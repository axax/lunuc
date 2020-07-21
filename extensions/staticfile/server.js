import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import fs from 'fs'
import path from 'path'
import Util from '../../api/util'
import config from 'gen/config'

const {STATIC_DIR, STATIC_PRIVATE_DIR, STATIC_TEMPLATE_DIR} = config

const createStaticFiles = async (db) => {
    const staticDir = path.join(__dirname, '../../' + STATIC_DIR)
    const staticPrivateDir = path.join(__dirname, '../../' + STATIC_PRIVATE_DIR)
    const staticTemplateDir = path.join(__dirname, '../../' + STATIC_TEMPLATE_DIR)

    if (Util.ensureDirectoryExistence(staticDir) &&
        Util.ensureDirectoryExistence(staticPrivateDir) &&
        Util.ensureDirectoryExistence(staticTemplateDir)) {


        const staticFiles = (await db.collection('StaticFile').find({active: true}).toArray())
        staticFiles.forEach(staticFile => {

            const pathParts = staticFile.name.split('/')
            pathParts.pop()

            let currentDir = staticFile.private ? staticPrivateDir : staticFile.template ? staticTemplateDir : staticDir
            if( !currentDir.endsWith('/')){
                currentDir += '/'
            }

            if (Util.ensureDirectoryExistence(currentDir + pathParts.join('/'))) {

                console.log(`create file ${staticFile.name}`)
                const filePath = currentDir + '/' + staticFile.name

                let content = staticFile.content
                const regex = /^data:.+\/(.+);base64,(.*)$/

                const matches = content.match(regex)
                if( matches && matches.length===3){
                    content = Buffer.from(matches[2], 'base64')
                }

                fs.writeFile(filePath, content, function (err) {
                    if (err) {
                        return console.log(err)
                    }
                })

                fs.unlink(filePath+'.br',()=>{})
                fs.unlink(filePath+'.gz',()=>{})

            }
        })
    }
}

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('appready', ({db}) => {
    createStaticFiles(db)
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_StaticFile', ({db, result}) => {
    createStaticFiles(db)
})
