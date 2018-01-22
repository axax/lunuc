import {pubsub} from '../subscription'
import {withFilter} from 'graphql-subscriptions'


export const notificationResolver = (db) => ({
	notifications: () => {
		return []
	},
	newNotification: withFilter(() => pubsub.asyncIterator('newNotification'),
		(payload, context) => {
            if( payload ) {
            	// the context paramerter is set in the server.js -> SubscriptionServer.create -> onOperation

				// notify only if it is for the current user
                return payload.userId === context.id
            }
		}
	)
})