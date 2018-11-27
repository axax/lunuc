import ReactDOMServer from 'react-dom/server'
import JsonDom from 'client/components/JsonDom'
import React from 'react'
import {UIProvider} from 'ui'

import Util from '../util'
import {execSync} from 'child_process'
import path from 'path'
import fs from 'fs'
import config from 'gen/config'
import zipper from 'zip-local'
import nodemailer from 'nodemailer'
import {
    CAPABILITY_MANAGE_COLLECTION,
    CAPABILITY_RUN_COMMAND
} from '../data/capabilities'
import Cache from 'util/cache'
import UtilCms from '../util/cms'

const {BACKUP_DIR, UPLOAD_DIR} = config

export const systemResolver = (db) => ({
    Query: {
        run: async ({command}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)

            if (!command) {
                throw new Error('No command to execute.')
            }

            const options = {
                encoding: 'utf8'
            }

            const response = execSync(command, options)

            return {response}
        },
        sendMail: async ({recipient, subject, body, slug}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const values = await Util.keyValueGlobalMap(db, context, ['MailSettings'])
            const mailSettings = JSON.parse(values.MailSettings)
            let html

            if (slug) {
                let cmsPages = await UtilCms.getCmsPage(db, context, slug)
                if (!cmsPages.results) {
                    throw new Error(`Template ${slug} doesn't exist`)
                }
                let scopeContext
                try{
                    scopeContext = JSON.parse(body)
                }catch(e){
                    throw new Error(`Error in body: ${e.message}`)
                    scopeContext = {}
                }

                const scope = {context: scopeContext, page: {slug}}

                const {template, script, dataResolver} = cmsPages.results[0]
                const {resolvedData} = await UtilCms.resolveData(db, context, dataResolver.trim(), scope)
                try {
                    global._app_ = {lang: context.lang}
                    html = ReactDOMServer.renderToString(<UIProvider>
                        <JsonDom template={template}
                                 script={script}
                                 resolvedData={JSON.stringify(resolvedData)}
                                 editMode={false}
                                 scope={JSON.stringify(scope)}/>
                    </UIProvider>)
                } catch (e){
                    throw new Error(`Error in template: ${e.message}`)
                }
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
                    files.push({name: file, createdAt: (new Date(stats.mtime)).getTime(), size: (stats.size / 1000) + 'kb'})
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
                    files.push({name: file, createdAt: (new Date(stats.mtime)).getTime(), size: (stats.size / 1000) + 'kb'})
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
            Util.checkIfUserIsLoggedIn(context)

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
            Util.checkIfUserIsLoggedIn(context)

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
        cloneCollection: async ({name}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_COLLECTION)

            const newName = `${name}_${new Date().getTime()}`
            const oldCollection = db.collection(name)
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
        }
    }
})