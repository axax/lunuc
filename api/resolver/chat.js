import Util from '../util'
import {ObjectId} from 'mongodb'
import {auth} from '../auth'
import {ApiError} from '../error'
import {pubsub} from '../subscription'


export const chatResolver = (db) => ({

	createChat: async ({name}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)


		const chatCollection = db.collection('Chat')


		const insertResult = await chatCollection.insertOne({
			name: name,
			createdBy: ObjectId(context.id),
			users: [ObjectId(context.id)]
		})

		if (insertResult.insertedCount) {
			const doc = insertResult.ops[0]
			return doc
		}
	},
	createMessage: async ({chatId, text}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)


		const chatCollection = db.collection('Chat')

		const _id = ObjectId()

		const newMessage = {
			_id: _id,
			to: ObjectId(chatId),
			from: ObjectId(context.id),
			text: text
		}

		let result = (await chatCollection.updateOne({_id: ObjectId(chatId), users: {$in: [ObjectId(context.id)]}}, {
			$push: {
				messages: newMessage
			}
		}))


		if (result.modifiedCount !== 1) {
			throw new Error('Message was not inserted')
		}

		return newMessage
	},
	addUserToChat: async ({chatId, userId}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)


		const chatCollection = db.collection('Chat')

		const result = await chatCollection.updateOne({
				_id: ObjectId(chatId)
			},
			{
				$addToSet: {users: ObjectId(userId)}
			})


		if (result.matchedCount === 0) {
			throw new Error('Chat doesnt exist')
		}

		return {_id: chatId}
	},
	removeUserToChat: async ({chatId, userId}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)


		const chatCollection = db.collection('Chat')

		const result = await chatCollection.updateOne({
				_id: ObjectId(chatId)
			},
			{
				$pull: {users: ObjectId(userId)}
			})


		if (result.matchedCount === 0) {
			throw new Error('Chat doesnt exist')
		}

		return {_id: chatId}
	},
	chats: async ({}, {context, query}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')


		let chats = (await chatCollection.aggregate([
			{
				$match: {
					users: {$in: [ObjectId(context.id)]}
				}
			},
			{
				$unwind: '$users' /* unwind because localFiled users is an array -> https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/ */
			},
			{
				$lookup: {
					from: 'User',
					localField: 'users',
					foreignField: '_id',
					as: 'users'
				}
			},
			{
				$lookup: {
					from: 'User',
					localField: 'createdBy',
					foreignField: '_id',
					as: 'createdBy'
				}
			},
			// Group back to arrays
			{
				$group: {
					_id: '$_id',
					name: {'$first':'$name'},
					createdBy: {'$first':{$arrayElemAt: ['$createdBy', 0]} }, // return as as single doc not an array
					users: {$addToSet: {_id:'$users._id',username:'$users.username'} }
				}
			}
		]).toArray())



		return chats
	},
	chatsWithMessages: async ({}, {context, query}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')


		let chats = (await chatCollection.aggregate([
			{
				$match: {
					users: {$in: [ObjectId(context.id)]},
				}
			},
			{
				$limit: 5
			},
			{
				$unwind: '$users' /* unwind because localFiled users is an array -> https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/ */
			},
			{
				$lookup: {
					from: 'User',
					localField: 'users',
					foreignField: '_id',
					as: 'users'
				}
			},
			{
				$lookup: {
					from: 'User',
					localField: 'createdBy',
					foreignField: '_id',
					as: 'createdBy'
				}
			},
			/* Resolve also user who sent message */
			{$unwind: '$messages'},
			{$unwind: '$messages.from'},
			{
				$lookup: {
					from: 'User',
					localField: 'messages.from',
					foreignField: '_id',
					as: 'messageFrom'
				}
			},
			{$unwind: '$messageFrom'},
			// Group back to arrays
			{
				$group: {
					_id: '$_id',
					name: {'$first':'$name'},
					createdBy: {'$first':{$arrayElemAt: ['$createdBy', 0]} }, // return as as single doc not an array
					users: {$addToSet: {_id:'$users._id',username:'$users.username'} },
					messages: {$addToSet: {'_id': '$messages._id',
						'from': '$messageFrom',
						'to': '$messageTo',
						'text': '$messages.text'} }
				}
			}
		]).toArray())

		return chats
	},
	chat: async ({chatId}, {context, query}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')


		const chat = (await chatCollection.aggregate([
			{
				$match: {
					_id: ObjectId(chatId),
					users: {$in: [ObjectId(context.id)]}
				}
			},
			{
				$unwind: '$users' /* unwind because localFiled users is an array -> https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/ */
			},
			{
				$lookup: {
					from: 'User',
					localField: 'users',
					foreignField: '_id',
					as: 'users'
				}
			},
			{
				$lookup: {
					from: 'User',
					localField: 'createdBy',
					foreignField: '_id',
					as: 'createdBy'
				}
			},
			/* Resolve also user who sent message */
			{$unwind: '$messages'},
			{$unwind: '$messages.from'},
			{
				$lookup: {
					from: 'User',
					localField: 'messages.from',
					foreignField: '_id',
					as: 'messageFrom'
				}
			},
			{$unwind: '$messageFrom'},
			{$unwind: '$messages.to'},
			{
				$lookup: {
					from: 'Chat',
					localField: 'messages.to',
					foreignField: '_id',
					as: 'messageTo'
				}
			},
			{$unwind: '$messageTo'},
			// Group back to arrays
			{
				$group: {
					_id: '$_id',
					name: {'$first':'$name'},
					createdBy: {'$first':{$arrayElemAt: ['$createdBy', 0]} }, // return as as single doc not an array
					users: {$addToSet: {_id:'$users._id',username:'$users.username'} },
					messages: {$addToSet: {'_id': '$messages._id',
						'from': '$messageFrom',
						'to': '$messageTo',
						'text': '$messages.text'} }
				}
			}
		]).next())

		return chat
	}
})