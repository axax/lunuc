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

// Hook when a type has changed
Hook.on('typeUpdated', async ({db, data, type, context}) => {
    const meta = {keys: Object.keys(data)}
    db.collection('History').insertOne({
        type,
        action:'update',
        data,
        meta,
        createdBy: await Util.userOrAnonymousId(db, context)
    })
})


// Hook when a type has been deleted
Hook.on('typeDeleted', async ({db, data, type, context}) => {
    let meta = ''
    if(data) {
        meta = {keys: Object.keys(data)}
    }
    db.collection('History').insertOne({
        type,
        action:'delete',
        data,
        meta,
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
