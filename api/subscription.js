import {PubSub} from 'graphql-subscriptions'

// the default PubSub is based on EventEmitters. It can easily
// be replaced with one different one, e.g. Redis
const pubsub = new PubSub()

// if pubsubDelayed is used it will be published after the current request has completed
const pubsubDelayed = {
    publish: (triggerName, payload, context) => {
        setTimeout(()=> {
            if (context.responded) {
                pubsub.publish(triggerName, payload)
            } else {
                if (!context.delayedPubsubs) {
                    context.delayedPubsubs = []
                }
                context.delayedPubsubs.push({triggerName, payload})
            }
        },500)
    }
}

// send test notifications
/*var counter=0
setInterval(()=>{
	counter++
	pubsub.publish('newNotification', {newNotification: {key: 'test.notification', message: `Notification Nr. ${counter}`}} )
},5000)*/


export {pubsub, pubsubDelayed}
