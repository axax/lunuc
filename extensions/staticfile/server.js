import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import {ObjectId} from 'mongodb'
import {createOrDeleteStaticFile, createStaticFiles} from './staticfile'


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
    const staticFile = await db.collection('StaticFile').findOne({_id: ObjectId(result._id)})
    if(staticFile){
        createOrDeleteStaticFile(staticFile,{db})
    }
})
