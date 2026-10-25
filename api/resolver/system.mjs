import Util from '../util/index.mjs'
import {execSync, spawn} from 'child_process'
import config from '../../gensrc/config.mjs'
import {
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_RUN_COMMAND,
    CAPABILITY_BULK_EDIT, CAPABILITY_BULK_EDIT_SCRIPT, CAPABILITY_ADMIN_OPTIONS
} from '../../util/capabilities.mjs'
import Cache from '../../util/cache.mjs'
import {pubsub} from '../subscription.mjs'
import {clientIps} from '../util/connection.mjs'
import {withFilter} from 'graphql-subscriptions'
import {ObjectId} from 'mongodb'
import {sendMail} from '../util/mail.mjs'
import {getType} from '../../util/types.mjs'
import {findAndReplaceObjectIds} from '../util/graphql.js'
import {listBackups, createBackup, removeBackup, mongoExport} from './backups.mjs'
import {getCollections} from '../util/collection.mjs'
import {resolver} from './index.mjs'
import {createRequireForScript} from '../../util/require.mjs'
import {csv2json} from '../util/csv.mjs'
import {setPropertyByPath} from '../../client/util/json.mjs'
import Hook from '../../util/hook.cjs'
import {createAllIndexes} from '../index/indexes.mjs'
import {getTypeFilesTypes, exportTypeFiles, importTypeFiles, getExportAllSources, exportAllTypeFiles, importAllTypeFiles} from '../util/typeFiles.mjs'
import jwt from 'jsonwebtoken'
import {SECRET_KEY} from '../constants/index.mjs'
import {MONGO_URL} from '../database.mjs'
import {isTemporarilyBlocked} from '../../server/util/requestBlocker.mjs'
import {clientAddress} from "../../util/host.mjs";
import {getSystemUpdateInfo, getSystemUpdateStatus, startSystemUpdate} from '../util/systemUpdate.mjs'

const SKIP_CAPABILITY_CHECK = ['ls -l', 'pwd', 'ls', 'ping lunuc.com']
const ENDOFCOMMAND = '__ENDOFCOMMAND__\n'

const execs = {}

// a running console belongs to the user (or anonymous session) that started it
const execOwner = context => context.id || ('session:' + context.session)
const checkExecOwner = async (db, context, id) => {
    if (execs[id] && execs[id].owner !== execOwner(context) &&
        !await Util.userHasCapability(db, context, CAPABILITY_RUN_COMMAND)) {
        throw new Error('Not allowed to access this console')
    }
}

const killExec = (id) => {
    if (execs[id]) {
        //execs[id].kill('SIGINT')
        if (execs[id].exitCode === null) {
            process.kill(-execs[id].pid, 'SIGKILL')
        }
        delete execs[id]
    }
}

export const systemResolver = (db) => ({
    Query: {
        // types that can be exported / imported as files (zip), see api/util/typeFiles.mjs
        typeFilesTypes: async ({}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return getTypeFilesTypes()
        },
        exportTypeFiles: async ({type, ids}, {context}) => {
            return exportTypeFiles({db, context, type, ids})
        },
        // export / import of everything the user has access to (/admin/system), needs capability export_import_data
        exportAllTypeFilesSources: async ({}, {context}) => {
            return getExportAllSources({db, context})
        },
        exportAllTypeFiles: async ({aiGuide}, {context}) => {
            return exportAllTypeFiles({db, context, aiGuide: !!aiGuide})
        },
        killRun: async ({id}, {context}) => {
            await checkExecOwner(db, context, id)
            killExec(id)
            return {id}
        },
        run: async ({command, scope, id, sync, timeout}, {context}) => {
            let response = ''

            const currentId = id || (context.id + String((new Date()).getTime()))


            if (SKIP_CAPABILITY_CHECK.indexOf(command) < 0) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            } else {
                // the commands without capability check must not be written into the console of another user
                await checkExecOwner(db, context, currentId)
            }


            if (scope === 'lu') {
                // lu commands

                if (command === 'clearcache') {
                    pubsub.publish('subscribeRun', {
                        userId: context.id,
                        subscribeRun: {
                            event: 'end',
                            response: `${Cache.size()} cached items cleared.`,
                            id: currentId
                        }
                    })


                    //rmDir(path.join(ABS_UPLOAD_DIR, '/screenshots'), true)


                    // also notifies cache listeners (e.g. dataResolver workers)
                    Cache.clearAll()

                } else if (command === 'memusage') {
                    const memusage = process.memoryUsage().heapUsed / 1024 / 1024

                    pubsub.publish('subscribeRun', {
                        userId: context.id,
                        subscribeRun: {event: 'end', response: memusage, id: currentId}
                    })


                } else if (command === 'connectedclients') {

                    pubsub.publish('subscribeRun', {
                        userId: context.id,
                        subscribeRun: {event: 'end', response: clientIps().join('\n'), id: currentId}
                    })

                } else {
                    pubsub.publish('subscribeRun', {
                        userId: context.id,
                        subscribeRun: {event: 'error', error: 'Unknown command', id: currentId}
                    })
                }


            } else {
                //Shell

                if (!command) {
                    throw new Error('No command to execute.')
                }
                if (sync) {
                    response = execSync(command, {
                        encoding: 'utf8',
                        shell: '/bin/bash'
                    })
                } else {
                    /*execs[id] = spawn(command, options, (err, stdout, stderr) => {
                     console.log(stdout)
                     pubsub.publish('subscribeRun', {
                     userId: context.id,
                     subscribeRun: {response: stdout, error: stderr, id}
                     })
                     })*/

                    if (!execs[currentId] || execs[currentId].exitCode !== null) {
                        execs[currentId] = spawn('bash', [], {detached: true})
                        execs[currentId].owner = execOwner(context)
                        execs[currentId].isRunning = false
                        execs[currentId].stdout.on('data', (data) => {
                            let str = data.toString('utf8')
                            const isEnd = str.endsWith(ENDOFCOMMAND)
                            if (isEnd) {
                                execs[currentId].isRunning = false
                                str = str.substring(0, str.length - ENDOFCOMMAND.length)
                            }
                            pubsub.publish('subscribeRun', {
                                userId: context.id,
                                subscribeRun: {event: isEnd ? 'end' : 'data', response: str, id: currentId}
                            })
                        })

                        execs[currentId].stderr.on('data', (data) => {
                            const error = data.toString('utf8')
                            pubsub.publish('subscribeRun', {
                                userId: context.id,
                                subscribeRun: {event: 'error', error, id: currentId}
                            })
                        })

                        execs[currentId].on('close', (code) => {
                            pubsub.publish('subscribeRun', {
                                userId: context.id,
                                subscribeRun: {event: 'close', id: currentId}
                            })
                        })
                        execs[currentId].on('error', (error) => {
                            pubsub.publish('subscribeRun', {
                                userId: context.id,
                                subscribeRun: {event: 'error', error, id: currentId}
                            })
                        })
                    }
                    console.log('is running',execs[currentId].isRunning,`-${command}-`)
                    execs[currentId].stdin.write(`${command}`)
                    if(!execs[currentId].isRunning) {
                        execs[currentId].stdin.write(` ; echo ${ENDOFCOMMAND}`)
                    }else{
                        execs[currentId].stdin.write(`\n`)
                    }
                    execs[currentId].isRunning = true

                    clearTimeout(execs[currentId].execTimeout)
                    if(timeout!==0) {
                        execs[currentId].execTimeout = setTimeout(function () {
                            killExec(currentId)
                            pubsub.publish('subscribeRun', {
                                userId: context.id,
                                subscribeRun: {
                                    event: 'error',
                                    error: 'Execution timeout reached. Console has been reseted',
                                    id: currentId
                                }
                            })
                        }, timeout || 600000)
                    }
                }
            }

            return {response, id: currentId}
        },
        sendMail: async (data, req) => {
            //Util.checkIfUserIsLoggedIn(context)
            const {context} = req
            const remoteAddress = clientAddress(req)
            if(isTemporarilyBlocked({requestTimeInMs: 2000, requestPerTime: 2,requestBlockForInMs:6000, key:'graphqlSendMail-'+remoteAddress})){
                return {response: JSON.stringify({error: 'Too many requests. Please try again later.'})}
            }
            if (!Util.isUserLoggedIn(context)) {
                // public forms (e.g. contact forms) send mails without login - limit how many mails
                // anonymous users can send, per ip and in total, so the api can't be abused as a mail relay
                if (isTemporarilyBlocked({requestTimeInMs: 600000, requestPerTime: 5, requestBlockForInMs: 600000, key: 'graphqlSendMailAnonymous-' + remoteAddress}) ||
                    isTemporarilyBlocked({requestTimeInMs: 600000, requestPerTime: 100, requestBlockForInMs: 600000, key: 'graphqlSendMailAnonymousTotal'})) {
                    return {response: JSON.stringify({error: 'Too many requests. Please try again later.'})}
                }
            }

            const response = await sendMail(db, context, data)
            return {response: JSON.stringify(response)}
        },
        ping: async ({}, {context}) => {

            // read something from the db
            const values = Util.keyValueGlobalMap(db, context, ['MailSettings'])

            const response = 'ok'

            return {response}
        },
        brokenReferences: async ({command}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            throw new Error('Not implmented yet.')
        },
        bulkEdit: async ({collection, _id, action, data}, {context}) => {

            const isScript = action === 'editScript'

            await Util.checkIfUserHasCapability(db, context, isScript ? CAPABILITY_BULK_EDIT_SCRIPT : CAPABILITY_BULK_EDIT)

            const $in = []
            _id.forEach(id => {
                $in.push(new ObjectId(id))
            })

            const options = {
                _id: {$in}
            }


            const entries = await db.collection(collection).find(options).toArray()

            const save = (entry) => {
                db.collection(collection).updateOne({_id: entry._id}, {$set: entry})
            }
            if(isScript) {
                const requireContext = createRequireForScript(import.meta.url)

                const tpl = new Function(`  
                      ${requireContext.script}
                this.entries.forEach(entry=>{
                    ${data}            
                })`)

                try {
                    tpl.call({entries, save, ObjectId, Util, require, __dirname, db, context})
                    return {result: `Successful executed`}
                } catch (e) {
                    console.log(e)
                    return {result: `Failed executed: ${e.message}`}
                }
            }else{
                const json = JSON.parse(data)

                const updater = resolver(db).Mutation[`update${collection}`]
                if(updater){
                    for(const entry of entries){
                        await updater(Object.assign({_id:entry._id}, json), {context})
                    }
                    return {result: `Successful executed`}
                }else{
                    return {result: `Updater for type ${collection} doesn't exist`}
                }

            }
        },
        backups: async ({type}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const files = listBackups(type)

            const response = {
                results: files,
                offset: 0,
                limit: 0,
                total: files.length
            }
            return response
        },
        collections: async ({filter}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

            return {results: await getCollections({db, filter})}
        },
        collectionAggregate: async ({collection, json}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)

            const jsonParsed = JSON.parse(json)
            findAndReplaceObjectIds(jsonParsed)
            const startTimeAggregate = new Date()
            // 'executionStats' MUST be passed explicitly. Without a verbosity the
            // driver sends allPlansExecution, which executes EVERY candidate plan
            // in full - on a heavy pipeline that alone can exhaust the server.
            // executionStats runs only the winning plan and is what an explain
            // tool actually needs.
            const explanation = await db.collection(collection)
                .aggregate(jsonParsed, {allowDiskUse: true}).explain('executionStats')
            let results = await (db.collection(collection).aggregate(jsonParsed, {allowDiskUse: true}).toArray())
            const aggregateTime = new Date() - startTimeAggregate
            console.log(`Aggregate time = ${aggregateTime}ms`)

            return {result: JSON.stringify({aggregateTime, data: results[0], explanation})}
        },
        importCollection: async ({collection,json,meta}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)


            if(!await Util.userHasAccessRights(db,context,{typeName:collection, access:'create'})){
                throw new Error('Benutzer hat keine Berechtigung zum Importieren')
            }

            const typeDefinition = getType(collection)
            let stats
            if (typeDefinition) {
                let jsonParsed
                try {
                    jsonParsed = JSON.parse(json)
                }catch (e){
                    console.log('import data is not json', e)
                    const csv = csv2json(json,';'),
                        csv1 = csv2json(json,'\t')

                    if(csv.length>0){
                        if(Object.keys(csv[0]).length >= Object.keys(csv1[0]).length){
                            jsonParsed = csv
                        }else{
                            jsonParsed = csv1
                        }
                    }
                }

                if(!jsonParsed){
                    return  {result: 'No valid data to import'}
                }

                if (jsonParsed.constructor !== Array) {
                    jsonParsed = [jsonParsed]
                }
                stats = {created: 0, updated: 0, errors: []}

                for(let i = 0; i<jsonParsed.length; i++){

                    const entry = jsonParsed[i],
                        match = {},
                        set = {}

                    // convert to proper ObjectId
                    Object.keys(entry).forEach(k => {
                        if (entry[k] && entry[k].constructor === String && ObjectId.isValid(entry[k])) {
                            entry[k] = new ObjectId(entry[k])
                        }else if(k.indexOf('.')>=0){
                            //dot notation
                            setPropertyByPath(entry[k], k, entry)
                        }
                    })

                    if (entry._id) {
                        if (entry._id.$oid) {
                            entry._id = entry._id.$oid
                        }
                        match._id = entry._id && entry._id.constructor === String ?new ObjectId(entry._id) : entry._id
                    }

                    if (entry.createdBy && entry.createdBy.$oid) {
                        entry.createdBy =new ObjectId(entry.createdBy.$oid)
                    }

                    typeDefinition.fields.forEach(field => {

                        if(entry[field.name] && entry[field.name].$oid){
                            entry[field.name] = new ObjectId(entry[field.name].$oid)
                        }

                        // fields missing in the import data stay unchanged (e.g. an export of only some columns)
                        if (entry[field.name] === undefined) {
                            return
                        }
                        if (field.unique) {
                            match[field.name] = entry[field.name]
                        } else {
                            set[field.name] = entry[field.name]
                        }
                    })

                    set.createdBy = entry.createdBy || new ObjectId(context.id)

                    const aggHook = Hook.hooks['SystemBeforeCollectionImport']
                    if (aggHook && aggHook.length) {
                        for (let i = 0; i < aggHook.length; ++i) {
                            await aggHook[i].callback({set, match, collection, meta, db,context})
                        }
                    }

                    const col = db.collection(collection)
                    try {
                        if (Object.keys(match).length === 0) {
                            await col.insertOne(set)
                            stats.created++
                        } else {
                            // match on _id AND the unique fields (e.g. slug) fails when the entry comes from another
                            // system (same slug, other _id): the upsert then inserted a duplicate. Here:
                            // 1. an entry with the same unique values exists -> update it (keeps its _id)
                            // 2. otherwise an entry with the same _id exists -> update it, incl. the unique fields
                            // 3. otherwise insert it
                            const {_id, ...uniqueMatch} = match
                            let filter = match
                            if (_id !== undefined && Object.keys(uniqueMatch).length > 0) {
                                const byUnique = await col.find(uniqueMatch, {projection: {_id: 1}}).limit(10).toArray()
                                if (byUnique.length > 1) {
                                    // duplicates (e.g. from an earlier import): update all of them, otherwise it is
                                    // random whether the entry that is actually used gets the new content
                                    const res = await col.updateMany(uniqueMatch, {$set: set})
                                    stats.updated += res.matchedCount
                                    stats.errors.push(`${match.slug || JSON.stringify(uniqueMatch)} exists ${byUnique.length} times (${byUnique.map(e => e._id).join(', ')}), all updated - please delete the duplicates`)
                                    continue
                                }
                                if (byUnique.length === 1) {
                                    filter = {_id: byUnique[0]._id}
                                } else if (await col.findOne({_id}, {projection: {_id: 1}})) {
                                    filter = {_id}
                                    Object.assign(set, uniqueMatch)
                                }
                            }
                            const res = await col.updateOne(filter, {$set: set}, {upsert: true})
                            if (res.upsertedCount) {
                                stats.created++
                            } else {
                                stats.updated++
                            }
                        }
                    } catch (e) {
                        stats.errors.push((match.slug || match._id || i) + ': ' + e.message)
                    }

                }

                Hook.call('SystemAfterCollectionImport', {collection, db, context})
            }
            /*findAndReplaceObjectIds(jsonParsed)
             const startTimeAggregate = new Date()

             let a = await (db.collection(collection).aggregate(jsonParsed, {allowDiskUse: true}).toArray())
             console.log(`Aggregate time = ${new Date() - startTimeAggregate}ms`)*/

            if (!stats) {
                return {result: 'imported'}
            }
            return {result: `imported: ${stats.updated} updated, ${stats.created} created` +
                    (stats.errors.length ? `, ${stats.errors.length} errors: ` + stats.errors.join('; ') : '')}
        },
        searchInCollections: async ({search}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)


            const collectionNames = db.getCollectionNames()
            const results = []

            for (const collectionName in collectionNames) {
                const coll = collectionNames[collectionName]
                if (coll === "system.indexes") continue

                console.log(`Search in collection ${collectionName}`)

                db[coll].find({
                    $where: function () {
                        for (const key in this) {
                            if (this[key] === "bar") {
                                return true
                            }
                        }
                        return false
                    }
                }).forEach((rec) => {
                    results.push({collection: collectionName, field: ''})
                })
            }

            return {result}
        },
        exportQuery: async ({type, query}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)

            return {result: mongoExport({type, query})}
        },
        getTokenLink: async ({filePath,mediaIds}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)

            filePath = filePath?filePath.replace(/%(\w+)%/g, (all, key) => {
                return config[key] !== undefined ? config[key] : all
            }):''
            const payload = {filePath, mediaIds}
            const token = jwt.sign(payload, SECRET_KEY, {expiresIn: '5h'})
            return {token}
        },
        getAllCollectionIndexes: async ({}, { context }) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS);

            const collections = await db.listCollections().toArray();

            // Every collection needs three independent reads. Sequentially that
            // is 3 x <number of collections> round trips before the page renders,
            // so they run per collection in parallel.
            const results = await Promise.all(collections.map(async (collection) => {
                const name = collection.name
                let indexSizes = {}, totalIndexSize = 0, indexes = [], usageByName = {}

                // Views and collections dropped mid-listing have no collStats /
                // indexes / indexStats. A failure on one must not take out the
                // whole listing, so each read is guarded on its own.
                try {
                    const stats = await db.command({ collStats: name })
                    indexSizes = stats.indexSizes || {}
                    totalIndexSize = stats.totalIndexSize || 0
                } catch (e) {
                    console.warn(`getAllCollectionIndexes: no collStats for ${name}`, e.message)
                }

                try {
                    indexes = await db.collection(name).indexes()
                } catch (e) {
                    console.warn(`getAllCollectionIndexes: no indexes for ${name}`, e.message)
                }

                try {
                    // $indexStats returns the usage counters of every index of the
                    // collection in one call, so it is folded into this listing
                    // instead of being fetched per index on demand.
                    const usage = await db.collection(name).aggregate([{ $indexStats: {} }]).toArray()
                    for (const stat of usage) {
                        usageByName[stat.name] = {
                            // Counter lives in the mongod process and resets on
                            // restart - only meaningful together with `since`.
                            ops: Number(stat.accesses?.ops ?? 0),
                            since: stat.accesses?.since
                        }
                    }
                } catch (e) {
                    console.warn(`getAllCollectionIndexes: no indexStats for ${name}`, e.message)
                }

                return {
                    name,
                    totalIndexSize,
                    indexes: indexes.map(index => JSON.stringify({
                        ...index,
                        sizeOnDisk: indexSizes[index.name] || 0,
                        ops: usageByName[index.name]?.ops,
                        opsSince: usageByName[index.name]?.since
                    }))
                }
            }))

            return { results };
        },
        systemInfo: async ({}, {context}) =>{
            // the url of the database may contain credentials
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)

            return {dbUrl:MONGO_URL}
        },
        // update via git tracking branch + shell/start.sh, see api/util/systemUpdate.mjs
        systemUpdateInfo: async ({fetch}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            return getSystemUpdateInfo({fetch: !!fetch})
        },
        systemUpdateStatus: async ({}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            return getSystemUpdateStatus()
        }
    },
    Mutation: {
        startSystemUpdate: async ({restart, force}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            return startSystemUpdate({restart: restart || 'all', force: !!force})
        },
        importTypeFiles: async ({type, data, dryRun, createMissing}, {context}) => {
            return importTypeFiles({db, context, type, data, dryRun, createMissing})
        },
        importAllTypeFiles: async ({data, dryRun, createMissing}, {context}) => {
            return importAllTypeFiles({db, context, data, dryRun, createMissing})
        },
        createDbIndexes: async ({}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)
            return await createAllIndexes(db)
        },
        dropDbIndexes: async ({name,indexes}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

            indexes.forEach(indexName => {
                db.collection(name).dropIndex(indexName)
            })


            return {status:'Indexes dropped'}
        },
        createBackup: async ({type, options}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_BACKUPS)

            const optionsAsJson = options ? JSON.parse(options) : {}
            return createBackup(type, optionsAsJson)
        },
        removeBackup: async ({type, name}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_BACKUPS)

            return removeBackup(type, name)
        },
        cloneCollection: async ({type, name, empty}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

            let customName
            if (name) {
                customName = name.replace(/[\W_]+/g, '_')
                if (customName) {
                    customName = '_' + customName
                }
            }

            const newName = `${type}_${new Date().getTime()}${customName}`
            const oldCollection = db.collection(type)
            const newCollection = db.collection(newName)

            // this is not the best way to copy a collection
            // better do it with aggregate function or mongodumb
            // but for now it is the only solution that worked
            if(!empty) {
                const result = await oldCollection.find().forEach((x) => {
                    newCollection.insert(x)
                })
            }
            //const result = await oldCollection.aggregate([{$out: newName}])

            //copy indexes
            const indexes = []
            await oldCollection.listIndexes().forEach((x) => {
                if (!x.key._id) {
                    delete x.ns
                    indexes.push(x)
                }
            })
            if (indexes.length > 0) {
                newCollection.createIndexes(indexes)
            }

            Cache.clearStartWith('system-collections')

            return {status: 'success', collection: {name: newName}}
        },
        syncCollectionEntries: async ({fromVersion,toVersion,type,ids},{context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

            const getCollectionName = (name) =>{
                return `${type}${name!=='default'?'_'+name:''}`
            }

            const fromCollection = db.collection(getCollectionName(fromVersion))
            const toCollection = db.collection(getCollectionName(toVersion))

            if(fromCollection && toCollection){

                for(const id of ids){
                    const entry = await fromCollection.findOne({_id:new ObjectId(id)})
                    if(entry) {
                        await toCollection.updateOne({_id: new ObjectId(id)}, {$set: entry}, {upsert: true})
                    }
                }

            }

            return {result: 'synced'}
        },
        deleteCollection: async ({name}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

            db.collection(name).drop()

            Cache.clearStartWith('system-collections')

            return {status: 'success', collection: {name}}
        }
    },
    Subscription: {
        subscribeRun: withFilter(() => pubsub.asyncIterableIterator('subscribeRun'),
            (payload, context) => {
                if (payload) {
                    return payload.userId === context.id
                }
            }
        )
    }
})
