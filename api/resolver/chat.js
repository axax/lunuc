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
	joinChat: async ({chatId, userId}, {context}) => {
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
			{
				'$project': {
					'users': 1,
					'name': 1,
					'createdBy': {'$arrayElemAt': ['$createdBy', 0]} // return as as single doc not an array
				}
			}
		]).toArray())


		//console.log(query.query)


		console.log(chats)
		return chats
	},
	chatsWithMessages: async ({}, {context, query}) => {
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
			{
				'$project': {
					'messages': [{
						'_id': '$messages._id',
						'from': '$messageFrom',
						'text': '$messages.text'
					}],
					'users': 1,
					'name': 1,
					'createdBy': {'$arrayElemAt': ['$createdBy', 0]} // return as as single doc not an array
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
			{
				'$project': {
					'users': 1,
					'name': 1,
					'createdBy': {'$arrayElemAt': ['$createdBy', 0]}, // return as as single doc not an array
					'messages': [{
						'_id': '$messages._id',
						'from': '$messageFrom',
						'to': '$messageTo',
						'text': '$messages.text'
					}]
				}
			}
		]).next())


		//console.log(query.query)


		console.log(chat)
		return chat
	}
})