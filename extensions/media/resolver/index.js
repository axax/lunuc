import Util from '../../../api/util'
import {CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities'
import config from 'gen/config'

const {UPLOAD_DIR} = config
import fs from 'fs'
import path from 'path'
import GenericResolver from "../../../api/resolver/generic/genericResolver";

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
                        if (!idMap[file]) {
                            fs.unlinkSync(filePath)
                            idsRemoved.push(file)
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


            const ids = await db.collection('Media').distinct("_id", {})
            //ids.length = 20
            let allcount = 0
            for (let i = 0; i < ids.length; i++) {
                const _id = ids[i],_idStr = _id.toString()

                let count = 0
                const locations = []


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

                if (count === 0) {
                    for (let j = 0; j < allGenericData.length; j++) {
                        if (allGenericData[j].data.indexOf(_idStr) > -1) {
                            locations.push({location: 'GenericData', _id: allGenericData[j]._id})
                            count++
                            break
                        }
                    }
                }


                if (count === 0) {
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
                allcount += count

                db.collection('Media').updateOne({_id}, {$set: {references: {count, locations}}})

            }
            return {status: `${allcount} references found`}
        }
    }
})
