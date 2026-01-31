import Util from '../../../api/util/index.mjs'
import {CAPABILITY_ADMIN_OPTIONS, CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities.mjs'
import config from '../../../gensrc/config.mjs'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {ObjectId} from 'mongodb'
import {getType} from '../../../util/types.mjs'
import {sendMail} from '../../../api/util/mail.mjs'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {UPLOAD_DIR} = config


async function removeMediaVariants(db, {ids,saveMode}) {
    const idsAll = await db.collection('Media').distinct("_id", {})

    const idMap = idsAll.reduce((map, obj) => {
        map[obj.toString()] = true
        return map
    }, {})
    const uploadPath = path.join(__dirname, '../../../' + UPLOAD_DIR)
    const idsRemoved = []
    if (fs.existsSync(uploadPath)) {
        fs.readdirSync(uploadPath).forEach(function (file, index) {
            const filePath = uploadPath + "/" + file
            const stat = fs.lstatSync(filePath)
            if (!stat.isDirectory() && (!saveMode || file.indexOf('@')>0)) {

                if (ids) {
                    if (!ids.find(id => file.indexOf(id) >= 0)) {
                        return
                    }
                }

                let id
                if (file.indexOf('private') === 0) {
                    id = file.substring(7)
                } else {
                    id = file
                }
                if (!idMap[id]) {
                    console.log('delete file ' + filePath)
                    fs.unlinkSync(filePath)
                    idsRemoved.push(id)
                }
            }
        })
    }
    return idsRemoved
}

export default db => ({
    Query: {
        cleanUpMedia: async ({ids}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            const idsRemoved = await removeMediaVariants(db, {ids})

            return {status: `${idsRemoved.length} ${idsRemoved.length > 1 ? 'files' : 'file'} removed`}
        },
        findReferencesForMedia: async ({limit, ids, match={}}, {context}) => {

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            const startTime = new Date().getTime()
  /*          const allGenericData = []
            const res = (await db.collection('GenericData').find({}).toArray())

            res.forEach(item => {
                allGenericData.push({data: JSON.stringify(item.data), _id: item._id})
            })
            console.log(`findReferencesForMedia time to load data ${new Date().getTime()-startTime}ms`)*/




            const allCollections = await db.listCollections().toArray()

            const ignoreCollections = ['NewsletterMailing',
                'MediaConversion',
                'UserTracking',
                'TelegramCommand',
                'GenericDataDefinition',
                'History',
                'Comment',
                'Bot',
                'BotConversation',
                'Media',
                'UserRole',
                'NewsletterSubscriber',
                'CrmAddress',
                'Log',
                'Word',
                'Post',
                'MailClient',
                'MailTracking',
                'NewsletterList',
                'PreProcessor',
                'MediaGroup',
                'NewsletterSent',
                'Rating',
                'StaticFile',
                'Chat',
                'MailClientArchive',
                'WordCategory',
                'DnsHost',
                'NewsletterTracking',
                'TelegramBot',
                'Product',
                'CronJobExecution',
                'ProductCategory',
                'KeyValueGlobal',
                'FtpUser',
                'UserGroup',
                'UserRestriction',
                'UserSetting',
                'SmsLog',
                'MailAccountMessage',
                'MailAccount',
                'MailAccounts', /* collection can be deleted */
                'MailAccountFolder',
                'DnsHostGroup',
                'ProxyUser',
                'WebAuthnCredential',
                'ChatMessage'
            ]

            const collectionsToSearchIn = []
            for (const {name} of allCollections) {
                if(name.indexOf('-')<0 && name.indexOf('_')<0 && ignoreCollections.indexOf(name)<0){
                    collectionsToSearchIn.push(name)
                }
            }
            if(!ids){
                const mediaIds = await db.collection('Media').find(
                    match,
                    {'_id':1})
                    .sort({'references.lastChecked':1}).limit(limit || 10).toArray()
                ids = mediaIds.map(f=>f._id.toString())
            }

            let checkedItems = {}
            for (let i = 0; i < ids.length; i++) {
                const _id = ids[i]
                let count = 0
                const locations = []
                const $where = `function() { 
                    return JSON.stringify(this).indexOf('${_id}')>=0
                }`

                for( const name of collectionsToSearchIn){

                    console.log(`search ${_id} in ${name}`)
                    let searchQuery
                    if(name==='User') {
                        searchQuery = {
                            $or: [
                                { picture: new ObjectId(_id) },
                                { meta: { $regex: _id, $options: 'i' } }
                            ]
                        }
                    }else{
                        const typeDefinition = getType(name)
                        if (typeDefinition && typeDefinition.wildcardTextIndex) {
                            searchQuery = {$text: {$search: _id}}
                        } else {
                            searchQuery = {$where}
                            console.warn(`type ${name} does not support wildcard search`)
                        }
                    }
                    const item = await db.collection(name).findOne(searchQuery,  { projection: { _id: 1 } } )


                    if( item ){
                        count++
                        locations.push({location: name, ...item})
                        break
                    }
                }

                const $set = {references: {count, locations, lastChecked: new Date().getTime()}}
                checkedItems[_id] = $set
                db.collection('Media').updateOne({_id: new ObjectId(_id)}, {$set})

            }
            console.log(`findReferencesForMedia ended after ${new Date().getTime()-startTime}ms`)
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
