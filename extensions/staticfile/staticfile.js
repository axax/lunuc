import path from 'path'
import Util from '../../api/util'
import fs from 'fs'
import {processById} from '../preprocessor/preprocessor'
import config from 'gen/config'

const {STATIC_DIR, STATIC_PRIVATE_DIR, STATIC_TEMPLATE_DIR} = config
const staticDir = path.join(__dirname, '../../' + STATIC_DIR)
const staticPrivateDir = path.join(__dirname, '../../' + STATIC_PRIVATE_DIR)
const staticTemplateDir = path.join(__dirname, '../../' + STATIC_TEMPLATE_DIR)

export const createOrDeleteStaticFile = async (staticFile, {db,force}) => {
    const pathParts = staticFile.name.split('/')
    pathParts.pop()

    let currentDir = staticFile.private ? staticPrivateDir : staticFile.template ? staticTemplateDir : staticDir
    if (!currentDir.endsWith('/')) {
        currentDir += '/'
    }

    if (Util.ensureDirectoryExistence(currentDir + pathParts.join('/'))) {

        const filePath = currentDir + staticFile.name

        if(staticFile.active) {

            //console.log(`create file ${filePath}`)

            let statDest
            try {
                statDest = fs.lstatSync(filePath)
            } catch (e) {
            }
            if ( force || !statDest || statDest.mtime < staticFile.modifiedAt) {

                console.log(`create file ${staticFile.name} after ${new Date() - _app_.start}ms`)

                let content
                if (staticFile.preprocessor && staticFile.preprocessor.length > 0) {

                    for (let i = 0; i < staticFile.preprocessor.length; i++) {
                        const result = await processById(staticFile.preprocessor[i], staticFile.content, {db})
                        content = result.data
                    }

                } else {
                    content = staticFile.content
                }

                const regex = /^data:.+\/(.+);base64,(.*)$/

                const matches = content.match(regex)
                if (matches && matches.length === 3) {
                    content = Buffer.from(matches[2], 'base64')
                }

                fs.writeFile(filePath, content, function (err) {
                    if (err) {
                        console.log('error writing file in createOrDeleteStaticFile', err)
                    }
                })

                fs.unlink(filePath + '.br', () => {
                })
                fs.unlink(filePath + '.gz', () => {
                })
            }
        }else{

            console.log(`delete file ${filePath}`)
            fs.unlink(filePath, () => {})
            fs.unlink(filePath + '.br', () => {})
            fs.unlink(filePath + '.gz', () => {})
        }

    }
}

export const createStaticFiles = async (db) => {

    if (Util.ensureDirectoryExistence(staticDir) &&
        Util.ensureDirectoryExistence(staticPrivateDir) &&
        Util.ensureDirectoryExistence(staticTemplateDir)) {


        const staticFiles = (await db.collection('StaticFile').find().toArray())
        staticFiles.forEach(async staticFile => {
            await createOrDeleteStaticFile(staticFile, {db})
        })
    }else{
        console.log('cannot create folder for static files')
    }
}
