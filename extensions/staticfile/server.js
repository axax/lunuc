import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import fs from 'fs'
import path from 'path'
import Util from '../../api/util'
import config from 'gen/config'

const {STATIC_DIR} = config

const createStaticFiles = async (db) => {
    const staticDir = path.join(__dirname, '../../' + STATIC_DIR)

    if (Util.ensureDirectoryExistence(staticDir)) {


        const staticFiles = (await db.collection('StaticFile').find({active: true}).toArray())
        staticFiles.forEach(staticFile => {
            console.log(`create file ${staticFile.name}`)

            fs.writeFile(staticDir + '/' + staticFile.name, staticFile.content, function (err) {
                if (err) {
                    return console.log(err)
                }
            })
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