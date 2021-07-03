import Util from '../util'
import {execSync, spawn} from 'child_process'
import path from 'path'
import config from '../../gensrc/config'
import {
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_RUN_COMMAND
} from 'util/capabilities'
import Cache from 'util/cache'
import {pubsub} from 'api/subscription'
import {clientIps} from 'api/util/connection'
import {withFilter} from 'graphql-subscriptions'
import {ObjectId} from 'mongodb'
import {sendMail} from '../util/mail'
import {getType} from 'util/types'
import {listBackups, createBackup, removeBackup, mongoExport} from './backups'

const {UPLOAD_DIR} = config


const ABS_UPLOAD_DIR = path.join(__dirname, '../../' + UPLOAD_DIR)

const SKIP_CAPABILITY_CHECK = ['ls -l', 'less ', 'pwd', 'ls', 'ping']
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

const findAndReplaceObjectIds = function (obj) {
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            const v = obj[i]
            if (v)
                if (v.constructor === Array) {
                    v.forEach((x, j) => {
                        if (x.constructor === String) {
                            if (i === '$in' && ObjectId.isValid(x)) {
                                v[j] = ObjectId(x)
                            }
                        } else {
                            findAndReplaceObjectIds(x)
                        }
                    })
                } else if (v.constructor === String) {
                    if (v.indexOf('.') < 0 && ObjectId.isValid(v)) {
                        obj[i] = ObjectId(v)
                    }
                } else {
                    findAndReplaceObjectIds(v)
                }
        }
    }
    return null
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

            if (command.indexOf('&') < 0 && command.indexOf('>') < 0 && command.indexOf('..') < 0 && command.indexOf('/.') < 0 && command.indexOf('./') < 0) {
                for (const c of SKIP_CAPABILITY_CHECK) {
                    if (command.indexOf(c) === 0) {
                        performCheck = false
                    }
                }
            }
            if (performCheck) {
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
                    }, 60000)
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

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

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

            const cacheKey = 'system-collections-' + filter

            let collections = Cache.get(cacheKey)
            if (!collections) {
                collections = await db.listCollections({name: {$regex: new RegExp(filter), $options: 'i'}}).toArray()
                Cache.set(cacheKey, collections, 86400000) // cache expires in 1 day
            }

            return {results: collections}
        },
        collectionAggregate: async ({collection, json}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)

            const jsonParsed = JSON.parse(json)
            findAndReplaceObjectIds(jsonParsed)
            const startTimeAggregate = new Date()
            const explanation = await db.collection(collection).aggregate(jsonParsed, {allowDiskUse: true}).explain()
            let results = await (db.collection(collection).aggregate(jsonParsed, {allowDiskUse: true}).toArray())
            console.log(`Aggregate time = ${new Date() - startTimeAggregate}ms`)

            return {result: JSON.stringify({data: results[0], explanation})}
        },
        importCollection: async ({collection, json}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)
            let jsonParsed = JSON.parse(json)

            if(jsonParsed.constructor !== Array){
                jsonParsed = [jsonParsed]
            }

            const col = db.collection(collection)
            const typeDefinition = getType(collection)
            if (typeDefinition) {

                jsonParsed.forEach(entry => {

                    const match = {}, set = {}

                    if (entry._id) {
                        if(entry._id.$oid){
                            entry._id = entry._id.$oid
                        }
                        match._id = ObjectId(entry._id)
                    }
                    typeDefinition.fields.forEach(field => {


                        if (field.unique) {
                            match[field.name] = entry[field.name]
                        } else {
                            set[field.name] = entry[field.name]
                        }
                    })

                    col.updateOne(match, {$set: set}, {upsert: true})

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
        exportQuery: async ({type, query}) =>{

            return {result:mongoExport({type, query})}
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
