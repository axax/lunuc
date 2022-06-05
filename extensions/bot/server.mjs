import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {unregisterBots, registerBots, botConnectors, registeredBots} from './bot.mjs'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})


Hook.on('cmsCustomResolver', async ({segment, resolvedData, context}) => {
    if (segment.chatbots && context.id) {

        const chats = []

        for(const key in botConnectors){
            const botConnector = botConnectors[key],
                bot = registeredBots[botConnector.botId]
            if (bot && bot.data.manager) {

                for (let i = 0; i < bot.data.manager.length; i++) {
                    const manager = bot.data.manager[i].toString()
                    if (manager === context.id) {
                        chats.push({botId: botConnector.botId, id: key})
                    }

                }
            }
        }
        resolvedData.chatbots = chats
    }
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

