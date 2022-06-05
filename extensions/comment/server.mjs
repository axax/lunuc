import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})


// Hook to create mongodb index
Hook.on('index', ({db}) => {

    console.log('Creating indexes for comment...')


    // create indexes
    const collection = db.collection('Rating')
    collection.createIndex({key: 1, createdBy: 1}, {unique: true})


})
