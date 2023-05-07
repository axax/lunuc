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

        const historyEntry = {
            type,
            action: 'update',
            data,
            meta,
            createdBy: await Util.userOrAnonymousId(db, context)
        }

        Hook.call('ExtensionHistoryBeforeCreate', {historyEntry})

        db.collection('History').insertOne(historyEntry)
    }
})


// Hook when a type has been deleted
Hook.on('typeDeleted', async ({db, type, deletedDocuments, context, ids}) => {

    if (!TYPES_TO_IGNORE.includes(type)) {
        for (const data of deletedDocuments) {
            const historyEntry = {
                meta: {},
                type,
                action: 'delete',
                data: data,
                createdBy: await Util.userOrAnonymousId(db, context)
            }

            const aggHook = Hook.hooks['ExtensionHistoryBeforeDelete']
            if (aggHook && aggHook.length) {
                for (let i = 0; i < aggHook.length; ++i) {
                    await aggHook[i].callback({db, historyEntry})
                }
            }
            db.collection('History').insertOne(historyEntry)
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
