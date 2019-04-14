import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import fs from 'fs'
import path from 'path'

import config from 'gen/config'
const {UPLOAD_DIR} = config

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when an entry of the type Media was deleted
Hook.on('typeDeleted_Media', ({ids}) => {
    // delete filea
    for(const id of ids) {
        const fileName = path.join(__dirname, '../../' + UPLOAD_DIR + '/' + id)
        if (fs.existsSync(fileName)) {
            console.log('delete file ' + fileName)
            fs.unlinkSync(fileName)
        }
    }
})
