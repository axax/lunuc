import Util from '../../../api/util'
import {CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities'
import config from 'gen/config'
const {UPLOAD_DIR} = config
import fs from 'fs'
import path from 'path'

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
        }
    }
})
