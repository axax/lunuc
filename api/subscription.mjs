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

//const connectedClients = new Set()
const delayedPubsubs = []

const createSubscriptionServer = ({server, schema, rootValue}) => {
    const subscriptionServer = SubscriptionServer.create(
        {
            schema,
            execute,
            subscribe,
            rootValue,
            onConnect: (connectionParams, webSocket, context) => {
                //connectedClients.add(webSocket)
            },
            onDisconnect: (webSocket, context) => {
                // Remove the WebSocket from the set
                //connectedClients.delete(webSocket)
            },
            onOperation: ({payload}, params, webSocket) => {
                let context
                if (USE_COOKIES) {
                    const cookies = parseCookies(webSocket.upgradeReq)
                    context = decodeToken(cookies.auth)
                    context.session = cookies.session
                } else {
                    context = decodeToken(payload.auth)
                    context.session = payload.session
                }
                context.lang = payload.lang

                // now if auth is needed we can check if the context is available
                context.variables = payload.variables

                // clientId is unique per client. it is also unique if more than one tab is used in the same browser

                context.clientId = payload.clientId

                // [2.] keep last context on socket
                webSocket._context = context

                return {context, schema}
            }
        },
        {
            server
        }
    )
    const _sendMessage = subscriptionServer.sendMessage
    subscriptionServer.sendMessage = (socketRequest,opId,type,params)=>{
        _sendMessage(socketRequest,opId,type,params)
        if(type === 'subscription_success' && delayedPubsubs.length > 0){
            const context = socketRequest.socket._context
            for (let i = delayedPubsubs.length - 1; i >= 0; i--) {
                const pub = delayedPubsubs[i]
                if (new Date() - pub.time > 60 * 1000) {
                    // remove if older than 1 minute
                    delayedPubsubs.splice(i, 1)
                }else if(pub.payload.clientId===context.clientId){
                    // [3.] publish once subscription connection is successfully established
                    pubsub.publish(pub.triggerName, pub.payload)
                    delayedPubsubs.splice(i, 1)
                }

            }
        }
    }
    return subscriptionServer
}

// if pubsubDelayed is used it will be published after the current request has completed
const pubsubDelayed = {
    publish: async (triggerName, payload, context) => {
        // publish to current connections
        pubsub.publish(triggerName, payload)

        // [1.] publish to future connections (that are not established now)
        delayedPubsubs.push({triggerName, payload, time: new Date()})
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
