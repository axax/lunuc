import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'
import {getType} from '../../util/types.mjs'

// types that are written by the system itself (logs, executions, tracking)
// a type can also opt out with "history": false in its build.json
const TYPES_TO_IGNORE = ['History', 'Log', 'UserTracking', 'MailTracking', 'MailAccountMessage', 'MailAccountFolder',
    'CronJobExecution', 'MediaConversion', 'NewsletterSent', 'NewsletterTracking', 'SmsLog']

const isHistoryEnabled = (type) => {
    if (TYPES_TO_IGNORE.includes(type)) {
        return false
    }
    const typeDef = getType(type)
    return !(typeDef && typeDef.history === false)
}

const logInsertError = (type, action) => (e) => {
    // never let a failed history insert end as unhandled rejection
    // (e.g. document larger than 16MB) - it would count towards the process exit
    console.error(`History: could not store ${action} of ${type}`, e.message)
}

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

    if (isHistoryEnabled(type)) {
        const meta = {keys: Object.keys(data)}

        const historyEntry = {
            type,
            action: 'update',
            data,
            meta,
            createdBy: await Util.userOrAnonymousId(db, context)
        }

        Hook.call('ExtensionHistoryBeforeCreate', {historyEntry})

        db.collection('History').insertOne(historyEntry).catch(logInsertError(type, 'update'))
    }
})


// Hook when a type has been deleted
Hook.on('typeDeleted', async ({db, type, deletedDocuments, context, ids}) => {

    if (isHistoryEnabled(type) && deletedDocuments && deletedDocuments.length > 0) {
        const createdBy = await Util.userOrAnonymousId(db, context)
        const historyEntries = []
        for (const data of deletedDocuments) {
            const historyEntry = {
                meta: {},
                type,
                action: 'delete',
                data: data,
                createdBy
            }

            const aggHook = Hook.hooks['ExtensionHistoryBeforeDelete']
            if (aggHook && aggHook.length) {
                for (let i = 0; i < aggHook.length; ++i) {
                    await aggHook[i].callback({db, historyEntry})
                }
            }
            historyEntries.push(historyEntry)
        }
        // one round trip instead of one insert per deleted document
        db.collection('History').insertMany(historyEntries, {ordered: false}).catch(logInsertError(type, 'delete'))
    }


})


// Hook to create mongodb index
Hook.on('index', ({db}) => {

    console.log('Creating indexes for history...')

    // create indexes
    const collection = db.collection('History')
    collection.createIndex({'data._id': 1})


})
