import {PubSub} from 'graphql-subscriptions'
import Hook from '../util/hook'

// the default PubSub is based on EventEmitters. It can easily
// be replaced with one different one, e.g. Redis
const pubsub = new PubSub()

const _publish = pubsub.publish

// if pubsubDelayed is used it will be published after the current request has completed
const pubsubDelayed = {
    publish: (triggerName, payload, context) => {
        setTimeout(() => {
            if (context.responded) {
                pubsub.publish(triggerName, payload)
            } else {
                if (!context.delayedPubsubs) {
                    context.delayedPubsubs = []
                }
                context.delayedPubsubs.push({triggerName, payload})
            }
        }, 600)
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
	pubsub.publish('newNotification', {newNotification: {key: 'test.notification', message: `Notification Nr. ${counter}`}} )
},5000)*/

export {pubsub, pubsubDelayed, pubsubHooked}
