import {pubsub} from 'api/subscription'
import {withFilter} from 'graphql-subscriptions'
import {registeredBots, botConnectors} from '../bot'
import BotConnector from '../classes/BotConnector'
import {ObjectId} from 'mongodb'
import Util from "../../../api/util";

const botConnectorClearTimeout = {}

export default db => ({
    Query: {
        sendBotMessage: async ({message, command, botId, id, meta}, {context}) => {
            // Util.checkIfUserIsLoggedIn(context)
            const sessionId = context.session

            const user = await Util.userById(db, context.id)
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
                            botId,
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

                            pubsub.publish('subscribeBotMessage', {
                                userId: context.id,
                                botId: botConnector.botId,
                                sessionId: sessionId,
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

                    }else if (command === 'alive') {

                        if (!botConnector.sessions[sessionId] ) {
                            botConnector.sessions[sessionId] = {username: context.username, user_id: context.id}
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
                            userId: context.id,
                            botId: botConnector.botId,
                            sessionId: sessionId,
                            subscribeBotMessage: {
                                botId: botConnector.botId,
                                id: currentId,
                                sessionId,
                                username: context.username,
                                user_id: context.id,
                                message_id: ObjectId().toString(),
                                event: 'alive',
                                meta
                            }
                        })

                        clearTimeout(botConnectorClearTimeout[sessionId])
                        botConnectorClearTimeout[sessionId] = setTimeout(() => {

                            delete botConnector.sessions[sessionId]

                            if(Object.keys(botConnector.sessions).length <= 1) {

                                pubsub.publish('subscribeBotMessage', {
                                    userId: context.id,
                                    botId: botConnector.botId,
                                    sessionId: sessionId,
                                    subscribeBotMessage: {
                                        botId: botConnector.botId,
                                        id: currentId,
                                        username: context.username,
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

                    let username = context.username || sessionData.username

                    botConnector.setMessage({
                        chat: {id: currentId},
                        text: message,
                        from: {first_name: username, user_image: user && user.picture,id: context.id || ''}
                    })

                    pubsub.publish('subscribeBotMessage', {
                        userId: context.id,
                        botId,
                        sessionId: sessionId,
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

                    if (botConnector && botConnector.sessions[session]) {
                        botConnector.sessions[session] = {}
                    }
                }
                return pubsub.asyncIterator('subscribeBotMessage')
            },
            (payload, context) => {

                if (payload && (payload.subscribeBotMessage.event!=='alive' || payload.userId !== context.id)) {
                    const sessionId = context.session
                    const botConnector = botConnectors[payload.subscribeBotMessage.id]

                    if (botConnector && botConnector.sessions[sessionId] ) {


                       /* if (payload.sessionId && payload.sessionId === sessionId) {
                            return false
                        }*/

                        return true
                    } else if(context.id){
                        const bot = registeredBots[payload.botId]
                        if (bot && bot.data.manager) {
                            if (bot.hasManager(context.id)) {
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
