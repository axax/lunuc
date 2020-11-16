import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import {preProcessorsCache} from './preprocessor'
import {ObjectId} from 'mongodb'
import {createOrDeleteStaticFile} from '../staticfile/staticfile'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})

// Hook when the type StaticFile has changed
Hook.on('typeUpdated_PreProcessor', async ({db, result}) => {

    delete preProcessorsCache[result._id]

    const staticFiles = await db.collection('StaticFile').find({active:true,preprocessor: ObjectId(result._id)}).toArray()

    if(staticFiles){
        staticFiles.forEach(async staticFile => {
            createOrDeleteStaticFile(staticFile, {db, force:true})
        })
    }

})
