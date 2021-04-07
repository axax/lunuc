import Util from '../../../api/util'
import {CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities'
import config from 'gen/config'

const {UPLOAD_DIR} = config
import fs from 'fs'
import path from 'path'
import GenericResolver from '../../../api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import {getTypes} from '../../../util/types'

export default db => ({
    Query: {
        cleanUpMedia: async ({}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            const ids = await db.collection('Media').distinct("_id", {})

            const idMap = ids.reduce((map, obj) => {
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
        findReferencesForMedia: async ({}, {context}) => {

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            const allGenericData = []
            const res = (await db.collection('GenericData').find({}).toArray())

            res.forEach(item => {
                allGenericData.push({data: JSON.stringify(item.data), _id: item._id})
            })


            const types = getTypes()

            const ids = await db.collection('Media').distinct("_id", {})
            //ids.length = 20
            let allcount = 0
            for (let i = 0; i < ids.length; i++) {
                const _id = ids[i], _idStr = _id.toString()

                let count = 0
                const locations = []


                const user = await db.collection('User').findOne({
                    $or: [
                        {picture: ObjectId(_id)},
                        {meta: {$regex: _id, $options: 'i'}}
                    ]
                })

                if (user) {

                    count++
                    locations.push({location: 'User', _id: user._id, name: user.username})
                }


                if (count === 0 && types['CmsPage']) {
                    const data = await GenericResolver.entities(db, context, 'CmsPage', ['dataResolver', 'script', 'serverScript', 'template', 'style', 'slug'], {
                        limit: 1,
                        filter: _idStr
                    })
                    if (data.total > 0) {
                        count++

                        data.results.forEach(item => {
                            locations.push({location: 'CmsPage', _id: item._id, slug: item.slug})
                        })
                    }
                }
                if (count === 0 && types['GenericData']) {
                    for (let j = 0; j < allGenericData.length; j++) {
                        if (allGenericData[j].data.indexOf(_idStr) > -1) {
                            locations.push({location: 'GenericData', _id: allGenericData[j]._id})
                            count++
                            break
                        }
                    }
                }

                if (count === 0 && types['BotCommand']) {
                    const data = await GenericResolver.entities(db, context, 'BotCommand', ['script', 'name'], {
                        limit: 1,
                        filter: _idStr
                    })
                    if (data.total > 0) {
                        count++

                        data.results.forEach(item => {
                            locations.push({location: 'BotCommand', _id: item._id, name: item.name})
                        })
                    }
                }

                if (count === 0 && types['KeyValue']) {
                    const data = await GenericResolver.entities(db, context, 'KeyValue', ['value', 'key'], {
                        limit: 1,
                        filter: _idStr
                    })
                    if (data.total > 0) {
                        count++

                        data.results.forEach(item => {
                            locations.push({location: 'KeyValue', _id: item._id, key: item.key})
                        })
                    }
                }

                if (count === 0 && types['KeyValueGlobal']) {
                    const data = await GenericResolver.entities(db, context, 'KeyValueGlobal', ['value', 'key'], {
                        limit: 1,
                        filter: _idStr
                    })
                    if (data.total > 0) {
                        count++

                        data.results.forEach(item => {
                            locations.push({location: 'KeyValueGlobal', _id: item._id, key: item.key})
                        })
                    }
                }


                if (count === 0 && types['CronJob']) {
                    const data = await GenericResolver.entities(db, context, 'CronJob', ['script', 'name'], {
                        limit: 1,
                        filter: _idStr
                    })
                    if (data.total > 0) {
                        count++

                        data.results.forEach(item => {
                            locations.push({location: 'CronJob', _id: item._id, name: item.name})
                        })
                    }
                }
                allcount += count

                db.collection('Media').updateOne({_id}, {$set: {references: {count, locations}}})

            }
            return {status: `${allcount} references found`}
        }
    }
})
