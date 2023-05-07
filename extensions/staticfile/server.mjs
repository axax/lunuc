import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {ObjectId} from 'mongodb'
import {createOrDeleteStaticFile, createStaticFiles} from './staticfile.mjs'


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

// Hook when the type StaticFile has changed
Hook.on(['typeUpdated_StaticFile', 'typeCreated_StaticFile', 'typeCloned_StaticFile'], async ({db, result}) => {
    const staticFile = await db.collection('StaticFile').findOne({_id: result._id.constructor === ObjectId?result._id: new ObjectId(result._id)})
    if(staticFile){
        createOrDeleteStaticFile(staticFile,{db})
    }
})
