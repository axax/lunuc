import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'

const TYPES_TO_IGNORE = ['History', 'Log', 'UserTracking', 'MailTracking']

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

    if (!TYPES_TO_IGNORE.includes(type)) {
        const meta = {keys: Object.keys(data)}
        Hook.call('ExtensionHistoryBeforeCreate', {type, data, meta})

        db.collection('History').insertOne({
            type,
            action: 'update',
            data,
            meta,
            createdBy: await Util.userOrAnonymousId(db, context)
        })
    }
})


// Hook when a type has been deleted
Hook.on('typeDeleted', async ({db, type, deletedDocuments, context, ids}) => {

    if (!TYPES_TO_IGNORE.includes(type)) {
        for (const data of deletedDocuments) {
            db.collection('History').insertOne({
                type,
                action: 'delete',
                data: data,
                createdBy: await Util.userOrAnonymousId(db, context)
            })
        }
    }


})


// Hook to create mongodb index
Hook.on('index', ({db}) => {

    console.log('Creating indexes for history...')

    // create indexes
    const collection = db.collection('History')
    collection.createIndex({'data._id': 1})


})
