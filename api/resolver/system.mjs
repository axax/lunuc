import Util from '../util/index.mjs'
import {execSync, spawn} from 'child_process'
import path from 'path'
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
import jwt from 'jsonwebtoken'
import {AUTH_EXPIRES_IN, SECRET_KEY} from '../constants/index.mjs'

const {UPLOAD_DIR} = config


const ABS_UPLOAD_DIR = path.join(path.resolve(), UPLOAD_DIR)

const SKIP_CAPABILITY_CHECK = ['ls -l', 'pwd', 'ls', 'ping lunuc.com']
const ENDOFCOMMAND = '__ENDOFCOMMAND__\n'

const execs = {}

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
        killRun: async ({id}, {context}) => {
            killExec(id)
            return {id}
        },
        run: async ({command, scope, id, sync}, {context}) => {
            let performCheck = true, response = ''

            const currentId = id || (context.id + String((new Date()).getTime()))


            if (SKIP_CAPABILITY_CHECK.indexOf(command) < 0) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            }


            if (scope === 'lu') {
                // lu commands

                if (command === 'clearcache') {
                    pubsub.publish('subscribeRun', {
                        userId: context.id,
                        subscribeRun: {
                            event: 'end',
                            response: `${Object.keys(Cache.cache).length} cached items cleared.`,
                            id: currentId
                        }
                    })


                    //rmDir(path.join(ABS_UPLOAD_DIR, '/screenshots'), true)


                    Cache.cache = {}

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
                    response = execSync(command, {encoding: 'utf8'})
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
                        execs[currentId].isRunning = false
                        execs[currentId].stdout.on('data', (data) => {
                            let str = data.toString('utf8')
                            const isEnd = str.endsWith(ENDOFCOMMAND)
                            console.log(str)
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
                            pubsub.publish('subscribeRun', {
                                userId: context.id,
                                subscribeRun: {event: 'error', error: data.toString('utf8'), id: currentId}
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
                        execs[currentId].stdin.write(` && echo ${ENDOFCOMMAND}`)
                    }else{
                        execs[currentId].stdin.write(`\n`)
                    }
                    execs[currentId].isRunning = true

                    clearTimeout(execs[currentId].execTimeout)
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
                    }, 600000)
                }
            }

            return {response, id: currentId}
        },
        sendMail: async (data, {context}) => {
            //Util.checkIfUserIsLoggedIn(context)
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
            Util.checkIfUserIsLoggedIn(context)

            return {results: await getCollections({db, filter})}
        },
        collectionAggregate: async ({collection, json}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)

            const jsonParsed = JSON.parse(json)
            findAndReplaceObjectIds(jsonParsed)
            const startTimeAggregate = new Date()
            const explanation = await db.collection(collection).aggregate(jsonParsed, {allowDiskUse: true}).explain()
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
                    if(Object.keys(match).length===0){
                        col.insertOne(set)
                    }else {
                        col.updateOne(match, {$set: set}, {upsert: true})
                    }

                }
            }
            /*findAndReplaceObjectIds(jsonParsed)
             const startTimeAggregate = new Date()

             let a = await (db.collection(collection).aggregate(jsonParsed, {allowDiskUse: true}).toArray())
             console.log(`Aggregate time = ${new Date() - startTimeAggregate}ms`)*/

            return {result: 'imported'}
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
        exportQuery: async ({type, query}) => {

            return {result: mongoExport({type, query})}
        },
        getTokenLink: async ({filePath}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)

            filePath = filePath.replace(/%(\w+)%/g, (all, key) => {
                return config[key] !== undefined ? config[key] : all
            })
            const payload = {filePath}
            const token = jwt.sign(payload, SECRET_KEY, {expiresIn: '5h'})
            return {token}
        }
    },
    Mutation: {
        createDbIndexes: async ({}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)
            return await createAllIndexes(db)
        },
        createBackup: async ({type, options}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_BACKUPS)

            const optionsAsJson = options ? JSON.parse(options) : {}
            return createBackup(type, optionsAsJson)
        },
        removeBackup: async ({type, name}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

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
        subscribeRun: withFilter(() => pubsub.asyncIterator('subscribeRun'),
            (payload, context) => {
                if (payload) {
                    return payload.userId === context.id
                }
            }
        )
    }
})
