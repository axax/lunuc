import {pubsub} from 'api/subscription'
import {withFilter} from 'graphql-subscriptions'
import {registeredBots, BotConnector} from '../bot'

export default db => ({
    Query: {
        sendBotMessage: async ({message, botId, id}, {context}) => {
           // Util.checkIfUserIsLoggedIn(context)

            if (registeredBots[botId]) {
                const currentId = id || (context.id + String((new Date()).getTime()))

                const ctx = new BotConnector(message)
                ctx.on('text', (text, id) => {
                    pubsub.publish('subscribeBotMessage', {
                        userId: context.id,
                        subscribeBotMessage: {response: text, id: currentId, message_id: id, event: 'newMessage'}
                    })
                })
                ctx.on('deleteMessage', (id) => {
                    pubsub.publish('subscribeBotMessage', {
                        userId: context.id,
                        subscribeBotMessage: {message_id: id, id: currentId, event: 'deleteMessage'}
                    })
                })

                registeredBots[botId].communicate('text', ctx)


                return {id: currentId}
            } else {
                throw new Error(`Bot with id ${botId} doesn't exist`)
            }
        }
    },
    Subscription: {
        subscribeBotMessage: withFilter(() => pubsub.asyncIterator('subscribeBotMessage'),
            (payload, context) => {
                if (payload) {
                    return payload.userId === context.id
                }
            }
        )
    }
})
