import { PubSub } from 'graphql-subscriptions'

// the default PubSub is based on EventEmitters. It can easily
// be replaced with one different one, e.g. Redis
const pubsub = new PubSub()

// send test notifications
var counter=0
setInterval(()=>{
	counter++
	pubsub.publish('newNotification', {newNotification: {key: 'test.notification', message: `Notification Nr. ${counter}`}} )
},4000)


export { pubsub }