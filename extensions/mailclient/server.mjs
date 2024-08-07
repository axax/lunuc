import {startListening, stopListening} from './mailclient.mjs'
import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('appready', async ({app, context, db}) => {
    startListening(db, context)
})


// Hook when the type CronJob has changed
Hook.on(['typeUpdated_MailClient', 'typeCreated_MailClient', 'typeDeleted_MailClient'], ({db, context}) => {
    stopListening(db, context)
    startListening(db, context)
})
