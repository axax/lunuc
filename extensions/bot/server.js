import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import {unregisterBots, registerBots} from './bot'



// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})


// Hook when db is ready
Hook.on('appready', ({db}) => {
    registerBots(db)
})

// Hook when the type CronJob has changed
Hook.on(['typeUpdated_Bot', 'typeUpdated_BotCommand'], ({db}) => {
    unregisterBots()
    registerBots(db)
})

