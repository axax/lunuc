// The root provides a resolver function for each API endpoint
export const resolver = (db) => ({
	me: (data, context) => {

		if (context.user) {
			return context.user
		}

		throw new Error('User is not logged in (or authenticated).')
	},
	keyvalue: () => {
		// return all keyvalue pairs
		return db.collection('keyvalue').find().toArray().then((docs) => {
			return docs.map((o) => ({key: o.key, id: o.key, value: o.value}))
		}).catch((err) => {
			console.error(err)
		})
	},
	value: ({key}) => {
		// return a single value
		return db.collection('keyvalue').findOne({key: key}).then((doc) => {
			return doc.value
		}).catch((err) => {
			console.error(err)
		})
	},
	setValue: ({key, value}) => {
		// update or insert if not exists
		return db.collection('keyvalue').updateOne({key: key}, {key: key, value: value}, {upsert: true}).then((docs) => {
			return {key: key, id: key, value: value}
		}).catch((err) => {
			console.error(err)
		})
	}
})