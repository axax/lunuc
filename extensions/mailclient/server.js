import {startListening, stopListening} from './mailclient'
import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'


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
