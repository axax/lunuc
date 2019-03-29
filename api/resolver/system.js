import Util from '../util'
import {execSync, spawn} from 'child_process'
import path from 'path'
import fs from 'fs'
import config from 'gen/config'
import zipper from 'zip-local'
import nodemailer from 'nodemailer'
import {
    CAPABILITY_MANAGE_BACKUPS,
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_RUN_COMMAND
} from 'util/capabilities'
import Cache from 'util/cache'
import Hook from 'util/hook'
import {pubsub} from 'api/subscription'
import {withFilter} from 'graphql-subscriptions'

const {BACKUP_DIR, UPLOAD_DIR} = config

const SKIP_CAPABILITY_CHECK = ['ls -l', 'less ', 'pwd', 'ls', 'ping']
const ENDOFCOMMAND = '__ENDOFCOMMAND__\n'

const execs = {}

const killExec = (id) => {
    if (execs[id]) {
        //execs[id].kill('SIGINT')
        if (execs[id].exitCode === null) {
            process.kill(-execs[id].pid, 'SIGKILL');
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
        run: async ({command, id, sync}, {context}) => {
            let performCheck = true, response = ''

            const currentId = id || (context.id + String((new Date()).getTime()))

            if (command.indexOf('&') < 0 && command.indexOf('>') < 0) {
                for (const c of SKIP_CAPABILITY_CHECK) {
                    if (command.indexOf(c) === 0) {
                        performCheck = false
                    }
                }
            }
            if (performCheck) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)
            }

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
                    execs[currentId] = spawn('bash', [], {detached: true});


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


            return {response, id: currentId}
        },
        sendMail: async ({recipient, subject, body, slug}, {context}) => {
            //Util.checkIfUserIsLoggedIn(context)
            const values = await Util.keyValueGlobalMap(db, context, ['MailSettings'])

            const mailSettings = values.MailSettings
            if (!mailSettings) {
                throw new Error(`Mail settings are missing. Please add MailSettings as a global value`)
            }

            let html
            if (slug && 'undefined' != typeof( Hook.hooks['cmsTemplateRenderer'] ) && Hook.hooks['cmsTemplateRenderer'].length) {
                html = await Hook.hooks['cmsTemplateRenderer'][0].callback({
                    context,
                    db,
                    recipient,
                    subject,
                    body,
                    slug
                })
            } else {
                html = body
            }

            const message = {
                from: mailSettings.from,
                to: recipient,
                subject: subject,
                text: 'Plaintext version of the message',
                html
            }

            var transporter = nodemailer.createTransport({
                service: mailSettings.service,
                auth: {
                    user: mailSettings.user,
                    pass: mailSettings.password
                }
            })

            const response = await transporter.sendMail(message)


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
        dbDumps: async (data, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            // make sure upload dir exists
            const backup_dir = path.join(__dirname, '../../' + BACKUP_DIR + '/dbdumps/')
            if (!Util.ensureDirectoryExistence(backup_dir)) {
                throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
            }

            const files = []
            fs.readdirSync(backup_dir).forEach(file => {
                if (file !== '.DS_Store') {
                    const stats = fs.statSync(backup_dir + '/' + file)
                    files.push({
                        name: file,
                        createdAt: (new Date(stats.mtime)).getTime(),
                        size: (stats.size / 1000) + 'kb'
                    })
                }
            })
            files.reverse()

            const response = {
                results: files,
                offset: 0,
                limit: 0,
                total: files.length
            }
            return response
        },
        mediaDumps: async (data, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            // make sure upload dir exists
            const backup_dir = path.join(__dirname, '../../' + BACKUP_DIR + '/mediadumps/')
            if (!Util.ensureDirectoryExistence(backup_dir)) {
                throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
            }

            const files = []
            fs.readdirSync(backup_dir).forEach(file => {
                if (file !== '.DS_Store') {
                    const stats = fs.statSync(backup_dir + '/' + file)
                    files.push({
                        name: file,
                        createdAt: (new Date(stats.mtime)).getTime(),
                        size: (stats.size / 1000) + 'kb'
                    })
                }
            })
            files.reverse()
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
        }
    },
    Mutation: {
        createDbDump: async ({type}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_BACKUPS)

            // make sure upload dir exists
            const backup_dir = path.join(__dirname, '../../' + BACKUP_DIR + '/dbdumps/')
            if (!Util.ensureDirectoryExistence(backup_dir)) {
                throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
            }

            /*

             Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip

             */
            const date = Date.now(),
                name = 'backup.db.' + date + '.gz',
                fullName = path.join(backup_dir, name)

            const response = execSync('mongodump --uri $LUNUC_MONGO_URL -v --archive="' + fullName + '" --gzip')
            console.log('createDbDump', response)

            const stats = fs.statSync(fullName)

            return {name, createdAt: date, size: (stats.size / 1000) + 'kb'}
        },
        createMediaDump: async ({type}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_BACKUPS)

            // make sure upload dir exists
            const backup_dir = path.join(__dirname, '../../' + BACKUP_DIR + '/mediadumps/')
            if (!Util.ensureDirectoryExistence(backup_dir)) {
                throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
            }

            const date = Date.now(),
                name = 'backup.media.' + date + '.gz',
                fullName = path.join(backup_dir, name)


            const media_dir = path.join(__dirname, '../../' + UPLOAD_DIR)

            const files = fs.readdirSync(media_dir)
            if (files.length === 0) {
                throw new Error(`No files in folder -> ${media_dir}`)
            }

            // zip media dir
            zipper.sync.zip(media_dir).compress().save(fullName)


            const stats = fs.statSync(fullName)

            return {name, createdAt: date, size: (stats.size / 1000) + 'kb'}
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
        },
        collectionAggregate: async ({collection, json}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)

            let a = await (db.collection(collection).aggregate(JSON.parse(json),{allowDiskUse:true}).toArray())
            return {result: JSON.stringify(a[0])}
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