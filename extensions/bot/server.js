import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import {unregisterBots, registerBots, botConnectors, registeredBots} from './bot'
import {pubsub} from '../../api/subscription'
import {ObjectId} from 'mongodb'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})


Hook.on('cmsCustomResolver', async ({db, segment, resolvedData, context, req, scope, editmode, dynamic}) => {
    if (segment.chatbots && context.id) {

        const chats = []

        for(const key in botConnectors){
            const botConnector = botConnectors[key]
            if(new Date().getTime() - botConnector.lastActive.getTime() > 10000){
                console.log(`remove bot connector ${key}`)


                pubsub.publish('subscribeBotMessage', {
                    userId: context.id,
                    botId: botConnector.botId,
                    sessionId: context.session,
                    subscribeBotMessage: {
                        botId: botConnector.botId,
                        id: key,
                        username: context.username,
                        message_id: ObjectId().toString(),
                        event: 'removeConnection'
                    }
                })

                delete botConnectors[key]
            }else {
                const bot = registeredBots[botConnector.botId]
                if (bot && bot.data.manager) {

                    for (let i = 0; i < bot.data.manager.length; i++) {
                        const manager = bot.data.manager[i].toString()
                        if (manager === context.id) {
                            chats.push({botId: botConnector.botId, id: key})
                        }

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

