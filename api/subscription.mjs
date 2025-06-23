import {PubSub} from 'graphql-subscriptions'
import Hook from '../util/hook.cjs'
import {SubscriptionServer} from 'subscriptions-transport-ws'
import {execute, subscribe} from 'graphql'
import {USE_COOKIES} from './constants/index.mjs'
import {parseCookies} from './util/parseCookies.mjs'
import {decodeToken} from './util/jwt.mjs'

// the default PubSub is based on EventEmitters. It can easily
// be replaced with one different one, e.g. Redis
const pubsub = new PubSub()

const connectedClients = new Set()
const delayedPubsubs = []

const createSubscriptionServer = ({server, schema, rootValue}) => {
    const subscriptionServer = SubscriptionServer.create(
        {
            schema,
            execute,
            subscribe,
            rootValue,
            onConnect: (connectionParams, webSocket, context) => {
                connectedClients.add(webSocket)
                setTimeout(()=>{
                    for (let i = delayedPubsubs.length - 1; i >= 0; i--) {
                        const pub = delayedPubsubs[i]
                        if (new Date() - pub.time > 60 * 1000) {
                            // remove if older than 1 minute
                            delayedPubsubs.splice(i, 1)
                        }else{
                            pubsub.publish(pub.triggerName, pub.payload)
                        }
                    }
                },1)

            },
            onDisconnect: (webSocket, context) => {
                // Remove the WebSocket from the set
                connectedClients.delete(webSocket)
            },
            onOperation: ({payload}, params, ws) => {
                let context
                if (USE_COOKIES) {
                    const cookies = parseCookies(ws.upgradeReq)
                    context = decodeToken(cookies.auth)
                    context.session = cookies.session
                } else {
                    context = decodeToken(payload.auth)
                    context.session = payload.session
                }
                context.lang = payload.lang

                // now if auth is needed we can check if the context is available
                context.variables = payload.variables

                context.clientId = payload.clientId

                ws._clientId = payload.clientId


                return {context, schema}
            }
        },
        {
            server
        }
    )
    return subscriptionServer
}

function isClientWithIdConnected(clientId) {
    for (const client of connectedClients) {
        if (client._clientId === clientId) {
            return true
        }
    }
    return false
}

// if pubsubDelayed is used it will be published after the current request has completed
const pubsubDelayed = {
    publish: async (triggerName, payload, context) => {
        if(isClientWithIdConnected(context.clientId)) {
            // publish to current connections
            pubsub.publish(triggerName, payload)
        }else {
            // publish to future connections
            delayedPubsubs.push({clientId: context.clientId, time: new Date(), triggerName, payload})
        }
    }
}

const pubsubHooked = {
    publish: async (triggerName, payload, db, context) => {

        if (Hook.hooks['beforePubSub'] && Hook.hooks['beforePubSub'].length) {
            for (let i = 0; i < Hook.hooks['beforePubSub'].length; ++i) {
                await Hook.hooks['beforePubSub'][i].callback({triggerName, payload, db, context})
            }
        }

        pubsub.publish(triggerName, payload)
    }
}

// send test notifications
/*var counter=0
setInterval(()=>{
	counter++
	pubsub.publish('newNotification', {userId: '590effdab75b10094f8543b8',newNotification: {key: 'test.notification', message: `Notification Nr. ${counter}`}} )
},5000)
*/
export {pubsub, pubsubDelayed, pubsubHooked, createSubscriptionServer}
