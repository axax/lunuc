import {pubsub} from 'api/subscription'
import {withFilter} from 'graphql-subscriptions'
import {registeredBots} from '../bot'
import BotConnector from '../classes/BotConnector'

// TODO: clean up unsed connectors
const botConnectors = {}

export default db => ({
    Query: {
        sendBotMessage: async ({message, botId, id}, {context}) => {
            // Util.checkIfUserIsLoggedIn(context)

            if (registeredBots[botId]) {
                const currentId = id || (context.id + String((new Date()).getTime()))

                if (!botConnectors[currentId]) {
                    const ctx = new BotConnector()
                    botConnectors[currentId] = ctx

                    ctx.on('command', (command, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            userId: context.id,
                            session: context.session,
                            subscribeBotMessage: {response: text, id: currentId, message_id, event: 'newMessage'}
                        })
                    })

                    ctx.on('text', (text, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            userId: context.id,
                            session: context.session,
                            subscribeBotMessage: {response: text, id: currentId, message_id, event: 'newMessage'}
                        })
                    })
                    ctx.on('deleteMessage', (message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            userId: context.id,
                            session: context.session,
                            subscribeBotMessage: {message_id, id: currentId, event: 'deleteMessage'}
                        })
                    })

                }
                botConnectors[currentId].setMessage({text: message, from: {first_name: context.username}})
                registeredBots[botId].communicate('text', botConnectors[currentId])


                return {id: currentId}
            } else {
                throw new Error(`Bot with id ${botId} doesn't exist`)
            }
        }
    },
    Subscription: {
        subscribeBotMessage: withFilter(() => pubsub.asyncIterator('subscribeBotMessage'),
            (payload, context) => {
                return payload && payload.session === context.session
            }
        )
    }
})
