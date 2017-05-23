import { PubSub, SubscriptionManager } from 'graphql-subscriptions'
import {schema} from './schema/index'

// the default PubSub is based on EventEmitters. It can easily
// be replaced with one different one, e.g. Redis
const pubsub = new PubSub()
const subscriptionManager = new SubscriptionManager({
	schema,
	pubsub,
	setupFunctions: {
		notification: (options, args) => {
			return {
				notification: {
					filter: (data) => {
						return true
						//return testRun.id === args.testRunId;
					}
				},
			}
		}
	}
})


export { subscriptionManager, pubsub }