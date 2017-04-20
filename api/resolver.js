import Util from './util'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => ({

	createUser: async ({username, password, email}) => {

		//TODO: Improve error handling -> https://medium.com/@tarkus/validation-and-user-errors-in-graphql-mutations-39ca79cd00bf

		// Validate Password
		const err = Util.validatePassword(password)
		if (err.length > 0) {
			throw new Error('Invalid Password: \n' + err.join('\n'))
		}

		// Validate Email Address
		if (!Util.validateEmail(email)) {
			throw new Error('Email is not valid')
		}

		const userCollection = db.collection('User')


		const userExists = (await userCollection.findOne({$or: [{'eemail': email}, {'username': username}]})) != null

		if (userExists) {
			throw new Error('Username or email already taken')
		}


		const hashedPw = Util.hashPassword(password)
		const insertResult = await userCollection.insertOne({email: email, username: username, password: hashedPw})

		if (insertResult.insertedCount) {
			const doc = insertResult.ops[0]
			return {email: doc.email, username: doc.username, password: doc.password, objectId: doc._id}
		}
	},
	me: (data, {context}) => {

		console.log(context)

		if (context.userId) {

			// return all keyvalue pairs
			return db.collection('User').findOne({id: context.userId}).then((docs) => {
				return docs
			}).catch((err) => {
				console.error(err)
			})

		}
		throw new Error('User is not logged in (or authenticated).')
	},
	keyvalue: () => {
		// return all keyvalue pairs
		return db.collection('KeyValue').find().toArray().then((docs) => {
			return docs.map((o) => ({key: o.key, objectId: o._id, value: o.value}))
		}).catch((err) => {
			console.error(err)
		})
	},
	keyvalueOne: ({key}) => {
		// return a single value
		return db.collection('KeyValue').findOne({key: key}).then((doc) => {
			return {key: doc.key, value: doc.value, objectId: doc._id}
		}).catch((err) => {
			console.error(err)
		})
	},
	setValue: ({key, value}) => {
		// update or insert if not exists
		return db.collection('KeyValue').updateOne({key: key}, {key: key, value: value}, {upsert: true}).then((doc) => {
			return {key: key, value: value, objectId: doc._id}
		}).catch((err) => {
			console.error(err)
		})
	}
})