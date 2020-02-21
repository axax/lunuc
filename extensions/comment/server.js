import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'

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
