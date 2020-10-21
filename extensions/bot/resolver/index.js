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
                const currentId = id || ((context.id ? context.id : '0') + '-' + String((new Date()).getTime()))
                if (!botConnectors[currentId]) {
                    const ctx = new BotConnector()
                    botConnectors[currentId] = ctx
                    botConnectors[currentId].sessions = []
                    botConnectors[currentId].botId = botId

                    ctx.on('command', (command, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId, response: text, message_id, event: 'newMessage', username:registeredBots[botId].data.name, botId, botName: registeredBots[botId].data.name
                            }
                        })
                    })

                    ctx.on('text', (text, message_id) => {

                        registeredBots[botId].archiveMessage({
                            message: {
                                text,
                                from: {isBot:true, first_name: registeredBots[botId].data.name, id: registeredBots[botId]._id},
                                chat: {id: currentId}
                            }
                        })

                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId, response: text, message_id, username:registeredBots[botId].data.name, event: 'newMessage', botId, botName: registeredBots[botId].data.name
                            }
                        })
                    })
                    ctx.on('deleteMessage', (message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            botId,
                            subscribeBotMessage: {
                                id: currentId, message_id, event: 'deleteMessage', botId, botName: registeredBots[botId].data.name
                            }
                        })
                    })

                }

                if (botConnectors[currentId].sessions.indexOf(context.session) < 0) {
                    botConnectors[currentId].sessions.push(context.session)
                }

                botConnectors[currentId].setMessage({
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
                    }else{
                        const bot = registeredBots[payload.botId]
                        if(bot && bot.data.manager){
                            if(bot.data.manager.indexOf(context.id)) {
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
