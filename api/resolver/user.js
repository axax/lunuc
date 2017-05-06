import Util from '../util'
import {ObjectId} from 'mongodb'
import {auth} from '../auth'

export const userResolver = (db) => ({

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
	changeMe: async (user,{context}) => {
		Util.checkIfUserIsLoggedIn(context)


		const result = (await db.collection('User').updateOne({_id: ObjectId(context.id)}, user))
		if( result.modifiedCount !== 1){
			throw new Error('User was not changed')
		}
		return user
	},
	setNote: async ({_id,value},{context}) => {
		Util.checkIfUserIsLoggedIn(context)


		const userCollection = db.collection('User')

		var result = null
		if( !_id ) {
			_id = ObjectId()
			result = (await userCollection.updateOne({_id: ObjectId(context.id)}, {$push: {note: {value: value, _id: _id}}}))
			if( result.modifiedCount !== 1){
				throw new Error('Note was not inserted')
			}
		}else{
			result = (await userCollection.updateOne({_id: ObjectId(context.id),'note._id': ObjectId(_id) },{$set: {'note.$.value': value}}))

			if( result.matchedCount === 1) {
				if (result.modifiedCount !== 1) {
					//throw new Error('Note was not modified')
				}
			}else{
				throw new Error('Note doesn\'t exist')
			}
		}

		return {value: value, _id: _id}
	},
	me: (data,{context}) => {

		Util.checkIfUserIsLoggedIn(context)

		return db.collection('User').findOne({_id: ObjectId(context.id)}).then((doc) => {
			return doc
		}).catch((err) => {
			console.error(err)
		})
	},
	login: async ({username, password}) => {
		const result = await auth.createToken(username,password,db)

		return result
	}
})