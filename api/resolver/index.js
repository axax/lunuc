import {userResolver} from './user'
import {notificationResolver} from './notification'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => ({
	...userResolver(db),
	...notificationResolver(db),
	keyvalue: (data,{context}) => {
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
	setValue: ({key, value}) => {
		// update or insert if not exists
		return db.collection('KeyValue').updateOne({key: key}, {key: key, value: value}, {upsert: true}).then((doc) => {
			return {key:key, value:value}
		})
	}
})