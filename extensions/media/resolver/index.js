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

            const idMap =ids.reduce((map, obj) => {
                map[obj.toString()] = true
                return map
            }, {})
            const uploadPath = path.join(__dirname, '../../../' + UPLOAD_DIR)

            const idsRemoved = []
            if (fs.existsSync(uploadPath)) {
                fs.readdirSync(uploadPath).forEach(function (file, index) {
                    const filePath = uploadPath + "/" + file
                    const stat = fs.lstatSync(filePath)
                    if(!stat.isDirectory()) {
                        if( !idMap[file]) {
                            fs.unlinkSync(filePath)
                            idsRemoved.push(file)
                        }
                    }
                })
            }
            return {status:`${idsRemoved.length} ${idsRemoved.length>1?'files':'file'} removed`}
        },
        findReferencesForMedia: async ({}, {context}) => {

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            const ids = await db.collection('Media').distinct("_id", {})

            let count = 0
            for(let i = 0; i<ids.length;i++){
                const _id = ids[i]
                const fields = ['dataResolver', 'script', 'serverScript', 'template', 'style', 'slug']


                const data = await GenericResolver.entities(db, context, 'CmsPage', fields, {
                    limit:99,
                    filter:_id.toString()
                })
                if( data.total>0){
                    count += data.total

                    const refs = {count: data.total, locations: []}

                    data.results.forEach(item=> {
                        refs.locations.push({location: 'CmsPage',_id: item._id, name: item.slug })

                    })
                    db.collection('Media').updateOne({_id}, {$set: {references: refs}})

                }
            }
            return {status:`${count} references found`}
        }
    }
})
