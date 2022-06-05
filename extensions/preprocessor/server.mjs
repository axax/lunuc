import Hook from '../../util/hook.cjs'
import schema from './schema/index.mjs'
import schemaGen from './gensrc/schema.mjs'
import resolver from './resolver/index.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {preProcessorsCache} from './preprocessor.mjs'
import {ObjectId} from 'mongodb'
import {createOrDeleteStaticFile} from '../staticfile/staticfile.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
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
