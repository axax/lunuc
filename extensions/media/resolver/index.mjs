import Util from '../../../api/util/index.mjs'
import {
    CAPABILITY_ACCESS_ADMIN_PAGE,
    CAPABILITY_ADMIN_OPTIONS,
    CAPABILITY_MANAGE_TYPES
} from '../../../util/capabilities.mjs'
import config from '../../../gensrc/config.mjs'
import path from 'path'
import fs from 'fs'
import {fileURLToPath} from 'url'
import {ObjectId} from 'mongodb'
import {sendMail} from '../../../api/util/mail.mjs'
import {removeMediaVariants} from '../util/index.mjs'
import {checkRefForMedias, getRefMap} from './mediaRefMap.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {UPLOAD_DIR} = config

export default db => ({
    Query: {
        cleanUpMedia: async ({ids}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            const idsRemoved = await removeMediaVariants(db, {ids})

            return {status: `${idsRemoved.length} ${idsRemoved.length > 1 ? 'files' : 'file'} removed`}
        },
        findReferencesForMedia: async ({limit, ids, match={}}, {context}) => {

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ACCESS_ADMIN_PAGE)
            const startTime = Date.now()

            const allCollections = await db.listCollections().toArray()
            const ignoreCollections = ['system.profile','OAuthCode','OAuthClient','NewsletterMailing', 'MediaConversion', 'UserTracking',
                'TelegramCommand', 'GenericDataDefinition', 'History', 'Comment', 'Bot',
                'BotConversation', 'Media', 'UserRole', 'NewsletterSubscriber', 'CrmAddress',
                'Log', 'Word', 'Post', 'MailClient', 'MailTracking', 'NewsletterList',
                'PreProcessor', 'MediaGroup', 'NewsletterSent', 'Rating', 'StaticFile', 'Chat',
                'MailClientArchive', 'WordCategory', 'DnsHost', 'NewsletterTracking', 'TelegramBot',
                'Product', 'CronJobExecution', 'ProductCategory', 'KeyValueGlobal', 'FtpUser',
                'UserGroup', 'UserRestriction', 'UserSetting', 'SmsLog', 'MailAccountMessage',
                'MailAccount', 'MailAccounts', 'MailAccountFolder', 'DnsHostGroup', 'ProxyUser',
                'WebAuthnCredential', 'ChatMessage'
            ]

            const collectionsToSearchIn = allCollections
                .map(c => c.name)
                .filter(name => name.indexOf('-') < 0 && name.indexOf('_') < 0 && !ignoreCollections.includes(name))

            // Cache laden oder neu aufbauen
            let refMap = await getRefMap(db, collectionsToSearchIn)

            if (!ids) {
                const mediaIds = await db.collection('Media').find(match, {'_id': 1})
                    .sort({'references.lastChecked': 1}).limit(limit || 10).toArray()
                ids = mediaIds.map(f => f._id.toString())
            }
            const checkedItems = checkRefForMedias(ids, refMap, db)

            console.log(`findReferencesForMedia ended after ${new Date().getTime() - startTime}ms`)
            return {status: `{"items":${JSON.stringify(checkedItems)}}`}
        },
        deleteOnlyMediaFiles: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_ADMIN_OPTIONS)

            const result = []

            // delete file variants
            await removeMediaVariants(db, {saveMode:true, ids:_id})

            // delete original files
            for(const id of _id) {
                const fileName = path.join(__dirname, `../../../${UPLOAD_DIR}/${id}`)
                const fileExist = fs.existsSync(fileName)
                if (fileExist) {
                    console.log('delete file ' + fileName)
                    fs.unlinkSync(fileName)
                }
                result.push({_id: id,status: fileExist ? 'deleted' : 'nofile'})
            }
            return result
        },
        sendAsAttachment: async ({_id,email}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_ADMIN_OPTIONS)

            const result = []

            const attachments = []
            // delete original files
            for(const id of _id) {

                const item = await db.collection('Media').findOne({_id:new ObjectId(id)},  { projection: { name: 1 } } )
                if(item) {
                    const fileName = path.join(__dirname, `../../../${UPLOAD_DIR}/${id}`)
                    const fileExist = fs.existsSync(fileName)
                    if (fileExist) {
                        attachments.push( {
                            filename: item.name,
                            path: fileName
                        })
                        result.push({_id: id, status: 'attached'})
                    }else{
                        result.push({_id: id, status: 'no file'})
                    }
                }else{
                    result.push({_id: id, status: 'not found'})
                }
            }
            if(attachments.length>0) {
                await sendMail(db, req.context, {
                    body: attachments.map(a=>a.filename).join(', '),
                    attachments,
                    recipient: email,
                    subject: 'Medias from lunuc',
                    req
                })
            }
            return result
        }
    }
})
