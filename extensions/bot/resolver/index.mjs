import {pubsub} from '../../../api/subscription.mjs'
import {withFilter} from 'graphql-subscriptions'
import {registeredBots, botConnectors} from '../bot.mjs'
import BotConnector from '../classes/BotConnector.mjs'
import {ObjectId} from 'mongodb'
import Util from '../../../api/util/index.mjs'
import {ApiError} from '../../../api/error.mjs'

const botConnectorClearTimeout = {}

export default db => ({
    Query: {
        sendBotMessage: async ({message, command, botId, id, meta}, {context}) => {
            // Util.checkIfUserIsLoggedIn(context)
            const sessionId = context.session
            let user = await Util.userById(db, context.id)
            if(!user){
                user = {username:'anonymous'}
            }
            if (registeredBots[botId]) {
                const currentId = id || ((context.id ? context.id : '0') + '-' + String((new Date()).getTime()))
                let botConnector = botConnectors[currentId]

                if (!botConnector) {
                    const ctx = new BotConnector()
                    botConnectors[currentId] = ctx
                    botConnector = botConnectors[currentId]
                    botConnector.sessions = {}
                    botConnector.botId = botId
                    botConnector.id = currentId

                    ctx.on('command', (command, message_id) => {
                        pubsub.publish('subscribeBotMessage', {
                            subscribeBotMessage: {
                                id: currentId,
                                response: text,
                                message_id,
                                event: 'newMessage',
                                username: registeredBots[botId].data.name,
                                botId,
                                isBot:true,
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
                            subscribeBotMessage: {
                                id: currentId,
                                message_id,
                                event: 'deleteMessage',
                                botId,
                                username: registeredBots[botId].data.name,
                                botName: registeredBots[botId].data.name
                            }
                        })
                    })
                }

                if (!botConnector.sessions[sessionId] ) {
                    botConnector.sessions[sessionId] = {}
                }

                if (command) {

                    if (command === 'userData') {

                        if(meta) {
                            try {
                                botConnector.sessions[sessionId] = JSON.parse(meta)
                            }catch (e) {
                            }

                           /* registeredBots[botId].archiveMessage({
                                message: {
                                    text: ,
                                    from: {
                                        isBot: true,
                                        first_name: registeredBots[botId].data.name,
                                        id: registeredBots[botId]._id
                                    },
                                    chat: {id: currentId}
                                }
                            })*/

                            pubsub.publish('subscribeBotMessage', {
                                subscribeBotMessage: {
                                    sessionId,
                                    isBot:true,
                                    botId: botConnector.botId,
                                    id: currentId,
                                    username: registeredBots[botId].data.name,
                                    user_id: context.id,
                                    message_id: ObjectId().toString(),
                                    event: 'userData',
                                    meta
                                }
                            })
                        }

                    }else if (command === 'alive' || command === 'typing') {
                        if (!botConnector.sessions[sessionId] ) {
                            botConnector.sessions[sessionId] = {username: user.username, user_id: context.id}
                        }
                        botConnector.lastActive = new Date()
                        if(meta) {
                            try {
                                botConnector.sessions[sessionId] = JSON.parse(meta)
                            }catch (e) {
                            }
                        }

                        //const sessionData = botConnector.sessions[context.session]

                        pubsub.publish('subscribeBotMessage', {
                            subscribeBotMessage: {
                                botId: botConnector.botId,
                                id: currentId,
                                sessionId,
                                username: user.username,
                                user_id: context.id,
                                user_image: user && user.picture,
                                message_id: ObjectId().toString(),
                                event: command,
                                meta
                            }
                        })

                        clearTimeout(botConnectorClearTimeout[sessionId])
                        botConnectorClearTimeout[sessionId] = setTimeout(() => {
                            pubsub.publish('subscribeBotMessage', {
                                subscribeBotMessage: {
                                    botId: botConnector.botId,
                                    id: currentId,
                                    sessionId,
                                    username: user.username,
                                    user_id: context.id,
                                    message_id: ObjectId().toString(),
                                    event: 'removeSession'
                                }
                            })
                            delete botConnector.sessions[sessionId]

                            if(Object.keys(botConnector.sessions).length < 1) {
                                pubsub.publish('subscribeBotMessage', {
                                    subscribeBotMessage: {
                                        botId: botConnector.botId,
                                        id: currentId,
                                        sessionId,
                                        username: user.username,
                                        user_id: context.id,
                                        message_id: ObjectId().toString(),
                                        event: 'removeConnection'
                                    }
                                })
                                delete botConnectors[botConnector.id]
                            }

                            delete botConnectorClearTimeout[sessionId]
                        }, 8000)

                    }

                } else {


                    const sessionData = botConnector.sessions[sessionId]

                    let username = sessionData && sessionData.username?sessionData.username:user.username

                    botConnector.setMessage({
                        chat: {id: currentId},
                        text: message,
                        from: {first_name: username, user_image: user && user.picture,id: context.id || ''}
                    })

                    pubsub.publish('subscribeBotMessage', {
                        subscribeBotMessage: {
                            botId,
                            botName: registeredBots[botId].data.name,
                            id: currentId,
                            sessionId,
                            username: username,
                            user_id: context.id,
                            user_image: user && user.picture,
                            response: message,
                            message_id: ObjectId().toString(),
                            event: 'newMessage'
                        }
                    })

                    // create a bot response if there is only one user in the current session
                    registeredBots[botId].communicate('text', botConnector, {createResult: Object.keys(botConnector.sessions).length<2})
                }

                return {id: currentId}
            } else {
                throw new ApiError(`Bot with id ${botId} doesn't exist`, 'botNotAvailable')
            }
        }
    },
    Subscription: {
        subscribeBotMessage: withFilter((e, {variables, session}) => {
                if (variables.id) {
                    const botConnector = botConnectors[variables.id]

                    if (botConnector && botConnector.sessions[session]) {
                        botConnector.sessions[session] = {}
                    }
                }
                return pubsub.asyncIterator('subscribeBotMessage')
            },
            (payload, context) => {



                if (payload) {
                    const message = payload.subscribeBotMessage
                    if(message.event!=='alive' || message.user_id !== context.id)
                    {
                        const sessionId = context.session
                        const botConnector = botConnectors[message.id]
                        if (botConnector && botConnector.sessions[sessionId]) {
                            return true
                        } else if (context.id) {
                            const bot = registeredBots[message.botId]
                            if (bot && bot.data.manager) {
                                if (bot.hasManager(context.id)) {
                                    return true
                                }
                            }

                        }
                    }
                }
                return false
            }
        )
    }
})
