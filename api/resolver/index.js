import {userResolver} from './user'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => ({
	...userResolver(db),
	keyvalue: (data,{context}) => {
		// return all keyvalue pairs
		return db.collection('KeyValue').find().toArray().then((docs) => {
			return docs
		}).catch((err) => {
			console.error(err)
		})
	},
	keyvalueOne: ({key}) => {
		// return a single value
		return db.collection('KeyValue').findOne({key: key}).then((doc) => {
			return doc
		}).catch((err) => {
			console.error(err)
		})
	},
	setValue: ({key, value}) => {
		// update or insert if not exists
		return db.collection('KeyValue').updateOne({key: key}, {key: key, value: value}, {upsert: true}).then((doc) => {
			return {key:key, value:value}
		}).catch((err) => {
			console.error(err)
		})
	}
})