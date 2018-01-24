import Util from '../util'
import {ObjectId} from 'mongodb'
import {auth} from '../auth'
import {ApiError} from '../error'
import {pubsub} from '../subscription'
import {speechLanguages, translateLanguages} from '../data/common'


const enhanceUserSettings = (user) => {
    // settings
    const settings = {
        speechLang: {
            data: speechLanguages,
            selection: null
        },
        translateLang: {
            data: translateLanguages,
            selection: null
        }
    }

    if( user.settings ){
    	if( user.settings.speechLang ){
			const filtered= speechLanguages.filter(lang => lang.key === user.settings.speechLang)
			if( filtered.length > 0 ){
				settings.speechLang.selection=filtered[0]
			}
		}
		if( user.settings.translateLang ){
			const filtered= translateLanguages.filter(lang => lang.key === user.settings.translateLang)
			if( filtered.length > 0 ){
				settings.translateLang.selection=filtered[0]
			}
		}
    }

    user.settings = settings
}


export const userResolver = (db) => ({
	me: async (data, {context}) => {
		Util.checkIfUserIsLoggedIn(context)
		var user = (await db.collection('User').findOne({_id: ObjectId(context.id)}))
		if (!user) {
			throw new Error('User doesn\'t exist')
		} else {
			var userRole = null
			// query user role
			if (user.role) {
				userRole = (await db.collection('UserRole').findOne({_id: ObjectId(user.role)}))
			}

			// set default user role
			if (userRole === null) {
				userRole = (await db.collection('UserRole').findOne({name: 'subscriber'}))
			}
			user.role = userRole



            enhanceUserSettings(user)

		}
		return user
	},
	users: async ({limit, offset}, {context, query}) => {
		Util.checkIfUserIsLoggedIn(context)

		const userCollection = db.collection('User')


		let users = (await userCollection.aggregate([
			/*{
			 $match: {
			 users: {$in: [ObjectId(context.id)]}
			 }
			 },*/
			{
				$skip: offset,
			},
			{
				$limit: limit
			},
			{
				$project: {
					username: 1
				}
			}

		]).toArray())


		return users
	},
	login: async ({username, password}) => {
		const result = await auth.createToken(username, password, db)

		return result
	},
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


		const userExists = (await userCollection.findOne({$or: [{'email': email}, {'username': username}]})) != null

		if (userExists) {
			throw new Error('Username or email already taken')
		}


		const hashedPw = Util.hashPassword(password)
		const userRole = (await db.collection('UserRole').findOne({name: 'subscriber'}))

		const insertResult = await userCollection.insertOne({
			role: userRole._id,
			emailConfirmed: false,
			email: email,
			username: username,
			password: hashedPw
		})

		if (insertResult.insertedCount) {
			const doc = insertResult.ops[0]
			return doc
		}
	},
	updateMe: async (user, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		const userCollection = db.collection('User')

		let existingUser = (await userCollection.findOne({$or: [{'username': user.username}]}))
		if (existingUser != null && existingUser._id.toString() !== context.id) {
			throw new ApiError(`Username ${user.username} already taken`, 'username.taken', {x: 'sss'})
		} else {
			const result = (await userCollection.findOneAndUpdate({_id: ObjectId(context.id)}, {$set: user}, {returnOriginal: false}))
			if (result.ok !== 1) {
				throw new ApiError('User could not be changed')
			}
            enhanceUserSettings(result.value)
			return result.value
		}
	},
	updateNote: async ({_id, value}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		const userCollection = db.collection('User')
		var result = null
		if (!_id) {
			throw new Error('Note id is missing')
		} else {
			result = (await userCollection.updateOne({
				_id: ObjectId(context.id),
				'note._id': ObjectId(_id)
			}, {$set: {'note.$.value': value}}))
			if (result.matchedCount === 1) {
				if (result.modifiedCount !== 1) {
					//throw new Error('Note was not modified')
				}
			} else {
				throw new Error('User or Note doesn\'t exist')
			}
		}

		return {value: value, _id: _id}
	},
	createNote: async ({value}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		if (!value) value = ''

		const userCollection = db.collection('User')
		const _id = ObjectId()
		let result = (await userCollection.updateOne({_id: ObjectId(context.id)}, {
			$push: {
				note: {
					value: value,
					_id: _id
				}
			}
		}))

		if (result.modifiedCount !== 1) {
			throw new Error('Note was not inserted')
		}

		return {value: value, _id: _id}
	},
	deleteNote: async ({_id}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		const userCollection = db.collection('User')

		var result = null
		if (!_id) {
			throw new Error('Note id is missing')
		} else {
			result = (await userCollection.updateOne({_id: ObjectId(context.id)}, {$pull: {note: {_id: ObjectId(_id)}}}))

			if (result.matchedCount === 1) {
				if (result.modifiedCount !== 1) {
					throw new Error('Note doesn\'t exist')
				}
			} else {
				throw new Error('User doesn\'t exist')
			}
		}

		return {value: '', _id: _id}
	}
})