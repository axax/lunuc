import {userResolver} from './user'
import {notificationResolver} from './notification'
import Util from '../util'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => {
	return ({
		...userResolver(db),
		...notificationResolver(db),
		keyvalue: (data, {context}) => {
			// return all keyvalue pairs
			return db.collection('KeyValue').find().toArray().then((docs) => {
				return docs
			})
		},
		keyvalueOne: ({key}) => {
			// return a single value
			return db.collection('KeyValue').findOne({key: key}).then((doc) => {
				return doc
			})
		},
		setValue: async ({key, value}, {context}) => {
			await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

			// update or insert if not exists
			return db.collection('KeyValue').updateOne({key: key}, {key: key, value: value}, {upsert: true}).then((doc) => {
				return {key: key, value: value}
			})
		}
	})
}