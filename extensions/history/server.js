import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import Util from '../../api/util'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

// Hook when the type Api has changed
Hook.on('typeUpdated', async ({db, data, type, context}) => {
    db.collection('History').insertOne({
        type,
        action:'update',
        data,
        createdBy: await Util.userOrAnonymousId(db, context)
    })
})



// Hook to create mongodb index
Hook.on('index', ({db}) => {

    console.log('Creating indexes for history...')

    // create indexes
    const collection = db.collection('History')
    collection.createIndex({'data._id': 1})


})
