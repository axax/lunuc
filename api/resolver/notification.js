import {pubsub} from '../subscription'
import {withFilter} from 'graphql-subscriptions'


export const notificationResolver = (db) => ({
	notifications: () => {
		return [{key: 'test'}]
	},
	newNotification: withFilter(() => pubsub.asyncIterator('newNotification'),
		(payload, args) => {
			return true
		}
	)
})