import Util from '../util/index.mjs'
import {execSync, spawn} from 'child_process'
import path from 'path'
import config from '../../gensrc/config.mjs'
import {
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_RUN_COMMAND
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
import {getCollections} from "../util/collection.mjs";

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


                        execs[currentId].stdout.on('data', (data) => {
                            let str = data.toString('utf8')
                            const isEnd = (str.indexOf(ENDOFCOMMAND) === str.length - ENDOFCOMMAND.length)
                            if (isEnd) {
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
                    execs[currentId].stdin.write(`${command} && echo ${ENDOFCOMMAND}`)

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
        bulkEdit: async ({collection, _id, script}, {context}) => {

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_BULK_EDIT)

            const $in = []
            _id.forEach(id => {
                $in.push(ObjectId(id))
            })

            const options = {
                _id: {$in}
            }


            const entries = await db.collection(collection).find(options).toArray()

            const save = (entry) => {
                db.collection(collection).updateOne({_id: entry._id}, {$set: entry})
            }


            const tpl = new Function(`  
                      
            this.entries.forEach(entry=>{
                ${script}            
            })`)

            try {
                tpl.call({entries, save, ObjectId, Util, require, __dirname, db, context})
                return {result: `Successful executed`}
            } catch (e) {

                return {result: `Failed executed: ${e.message}`}
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
        importCollection: async ({collection, json}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)


            if(!await Util.userHasAccessRights(db,context,{typeName:collection, access:'create'})){
                throw new Error('Benutzer hat keine Berechtigung zum Importieren')
            }

            let jsonParsed = JSON.parse(json)

            if (jsonParsed.constructor !== Array) {
                jsonParsed = [jsonParsed]
            }

            const col = db.collection(collection)
            const typeDefinition = getType(collection)
            if (typeDefinition) {

                jsonParsed.forEach(entry => {

                    const match = {}, set = {}

                    // convert to proper ObjectId
                    Object.keys(entry).forEach(k => {
                        if (entry[k] && entry[k].constructor === String && ObjectId.isValid(entry[k])) {
                            entry[k] = ObjectId(entry[k])
                        }
                    })

                    if (entry._id) {
                        if (entry._id.$oid) {
                            entry._id = entry._id.$oid
                        }
                        match._id = entry._id && entry._id.constructor === String ? ObjectId(entry._id) : entry._id
                    }

                    if (entry.createdBy && entry.createdBy.$oid) {
                        entry.createdBy = ObjectId(entry.createdBy.$oid)
                    }

                    typeDefinition.fields.forEach(field => {

                        if(entry[field.name] && entry[field.name].$oid){
                            entry[field.name] = ObjectId(entry[field.name].$oid)
                        }

                        if (field.unique) {
                            match[field.name] = entry[field.name]
                        } else {
                            set[field.name] = entry[field.name]
                        }
                    })
                    if(Object.keys(match).length===0){
                        col.insertOne(set)
                    }else {
                        col.updateOne(match, {$set: set}, {upsert: true})
                    }

                })
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
        }
    },
    Mutation: {
        createBackup: async ({type}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_BACKUPS)
            return createBackup(type)
        },
        removeBackup: async ({type, name}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            return removeBackup(type, name)
        },
        cloneCollection: async ({type, name}, {context}) => {
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
            const result = await oldCollection.find().forEach((x) => {
                newCollection.insert(x)
            })
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
