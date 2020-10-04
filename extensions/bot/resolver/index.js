import {pubsub} from 'api/subscription'
import {withFilter} from 'graphql-subscriptions'
import {registeredBots, botConnectors} from '../bot'
import BotConnector from '../classes/BotConnector'
import {ObjectId} from 'mongodb'


export default db => ({
    Query: {
        sendBotMessage: async ({message, botId, id}, {context}) => {
            // Util.checkIfUserIsLoggedIn(context)
            if (registeredBots[botId]) {
                const currentId = id || (context.id + String((new Date()).getTime()))
                if (!botConnectors[currentId]) {
                    const ctx = new BotConnector()
                    botConnectors[currentId] = ctx
                    botConnectors[currentId].sessions = []
                    botConnectors[currentId].botId = botId

                    ctx.on('command', (command, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId, response: text, message_id, event: 'newMessage'
                            }
                        })
                    })

                    ctx.on('text', (text, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId, response: text, message_id, event: 'newMessage'
                            }
                        })
                    })
                    ctx.on('deleteMessage', (message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId, message_id, event: 'deleteMessage'
                            }
                        })
                    })

                }

                if (botConnectors[currentId].sessions.indexOf(context.session) < 0) {
                    botConnectors[currentId].sessions.push(context.session)
                }

                botConnectors[currentId].setMessage({text: message, from: {first_name: context.username}})

                pubsub.publish('subscribeBotMessage', {
                    userId: context.id,
                    botId,
                    sessionId: context.session,
                    subscribeBotMessage: {
                        id: currentId,
                        username: context.username,
                        response: message,
                        message_id: ObjectId().toString(),
                        event: 'newMessage'
                    }
                })

                registeredBots[botId].communicate('text', botConnectors[currentId])


                return {id: currentId}
            } else {
                throw new Error(`Bot with id ${botId} doesn't exist`)
            }
        }
    },
    Subscription: {
        subscribeBotMessage: withFilter((e, {variables, session}) => {
                if (variables.id) {
                    const botConnector = botConnectors[variables.id]

                    if (botConnector && botConnector.sessions.indexOf(session) < 0) {
                        botConnector.sessions.push(session)
                    }
                }
                return pubsub.asyncIterator('subscribeBotMessage')
            },
            (payload, context) => {


                if (payload) {

                    const botConnector = botConnectors[payload.subscribeBotMessage.id]

                    if (botConnector && botConnector.sessions.indexOf(context.session) >= 0) {


                        if (payload.sessionId && payload.sessionId === context.session) {
                            return false
                        }

                        return true
                    }

//registeredBots[botId].data.manager
                    // console.log(payload)
                    //return payload && payload.session === context.session
                }
                return false
            }
        )
    }
})
