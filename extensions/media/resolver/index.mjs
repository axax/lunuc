import Util from '../../../api/util/index.mjs'
import {CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities.mjs'
import config from '../../../gensrc/config.mjs'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {ObjectId} from 'mongodb'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const {UPLOAD_DIR} = config


export default db => ({
    Query: {
        cleanUpMedia: async ({ids}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

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
                    if (!stat.isDirectory()) {

                        if(ids){
                            if(!ids.find(id => file.indexOf(id)>=0)){
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
                            fs.unlinkSync(filePath)
                            idsRemoved.push(id)
                        }
                    }
                })
            }
            return {status: `${idsRemoved.length} ${idsRemoved.length > 1 ? 'files' : 'file'} removed`}
        },
        findReferencesForMedia: async ({limit, ids}, {context}) => {

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
                'MailAccountFolder',
                'DnsHostGroup',
                'ProxyUser',
                'WebAuthnCredential'
            ]

            const collectionsToSearchIn = []
            for (const {name} of allCollections) {
                if(name.indexOf('-')<0 && name.indexOf('_')<0 && ignoreCollections.indexOf(name)<0){
                    collectionsToSearchIn.push(name)
                }
            }

            if(!ids){
                const mediaIds = await db.collection('Media').find(
                    {},
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
                    const item = await db.collection(name).findOne({$where},  { projection: { _id: 1 } } )

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
        }
    }
})
