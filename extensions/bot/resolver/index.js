import {pubsub} from 'api/subscription'
import {withFilter} from 'graphql-subscriptions'
import {registeredBots, botConnectors} from '../bot'
import BotConnector from '../classes/BotConnector'
import {ObjectId} from 'mongodb'

const botConnectorClearTimeout = {}

export default db => ({
    Query: {
        sendBotMessage: async ({message, command, botId, id, meta}, {context}) => {
            // Util.checkIfUserIsLoggedIn(context)
            if (registeredBots[botId]) {
                const currentId = id || ((context.id ? context.id : '0') + '-' + String((new Date()).getTime()))
                let botConnector = botConnectors[currentId]

                if (!botConnector) {
                    const ctx = new BotConnector()
                    botConnectors[currentId] = ctx
                    botConnector = botConnectors[currentId]
                    botConnector.sessions = []
                    botConnector.botId = botId
                    botConnector.id = currentId

                    ctx.on('command', (command, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId,
                                response: text,
                                message_id,
                                event: 'newMessage',
                                username: registeredBots[botId].data.name,
                                botId,
                                botName: registeredBots[botId].data.name
                            }
                        })
                    })

                    ctx.on('text', (text, message_id) => {

                        registeredBots[botId].archiveMessage({
                            message: {
                                text,
                                from: {
                                    isBot: true,
                                    first_name: registeredBots[botId].data.name,
                                    id: registeredBots[botId]._id
                                },
                                chat: {id: currentId}
                            }
                        })

                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId,
                                response: text,
                                message_id,
                                isBot: true,
                                username: registeredBots[botId].data.name,
                                event: 'newMessage',
                                botId,
                                botName: registeredBots[botId].data.name
                            }
                        })
                    })
                    ctx.on('deleteMessage', (message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId,
                                message_id,
                                event: 'deleteMessage',
                                botId,
                                botName: registeredBots[botId].data.name
                            }
                        })
                    })
                }

                if (botConnector.sessions.indexOf(context.session) < 0) {
                    botConnector.sessions.push(context.session)
                }

                if (command) {

                    if (command === 'alive') {
                        botConnector.lastActive = new Date()
                       /* try {
                            botConnector.meta = JSON.parse(decodeURIComponent(meta))
                        }catch (e) {
                            botConnector.meta = {}
                        }*/
                        pubsub.publish('subscribeBotMessage', {
                            userId: context.id,
                            botId: botConnector.botId,
                            sessionId: context.session,
                            subscribeBotMessage: {
                                botId: botConnector.botId,
                                id: currentId,
                                username: context.username,
                                user_id: context.id,
                                message_id: ObjectId().toString(),
                                event: 'alive',
                                meta
                            }
                        })

                        clearTimeout(botConnectorClearTimeout[currentId])
                        botConnectorClearTimeout[currentId] = setTimeout(() => {

                            pubsub.publish('subscribeBotMessage', {
                                userId: context.id,
                                botId: botConnector.botId,
                                sessionId: context.session,
                                subscribeBotMessage: {
                                    botId: botConnector.botId,
                                    id: currentId,
                                    username: context.username,
                                    user_id: context.id,
                                    message_id: ObjectId().toString(),
                                    event: 'removeConnection'
                                }
                            })
                            delete botConnectorClearTimeout[currentId]
                            delete botConnectors[botConnector.id]
                        }, 8000)

                    }

                } else {

                    botConnector.setMessage({
                        chat: {id: currentId},
                        text: message,
                        from: {first_name: context.username, id: context.id || ''}
                    })

                    pubsub.publish('subscribeBotMessage', {
                        userId: context.id,
                        botId,
                        sessionId: context.session,
                        subscribeBotMessage: {
                            botId,
                            botName: registeredBots[botId].data.name,
                            id: currentId,
                            username: context.username,
                            user_id: context.id,
                            response: message,
                            message_id: ObjectId().toString(),
                            event: 'newMessage'
                        }
                    })

                    registeredBots[botId].communicate('text', botConnector)
                }

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
                    } else {
                        const bot = registeredBots[payload.botId]
                        if (bot && bot.data.manager) {
                            if (bot.data.manager.indexOf(context.id)) {
                                // return
                                return true
                            }
                        }

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
