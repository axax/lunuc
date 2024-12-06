import {pubsub} from '../subscription.mjs'
import {withFilter} from 'graphql-subscriptions'


export const notificationResolver = (db) => ({
    Query: {

        notifications: () => {
            return []
        }
    },
    Subscription: {
        newNotification: withFilter(() => pubsub.asyncIterableIterator('newNotification'),
            (payload, context) => {
                if (payload) {
                    // the context paramerter is set in the server.js -> SubscriptionServer.create -> onOperation

                    // notify only if it is for the current user
                    return payload.userId === context.id
                }
            }
        )
    }
})
