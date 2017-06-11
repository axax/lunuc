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
})