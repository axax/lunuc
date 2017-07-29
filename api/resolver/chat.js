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
			return {
				_id: doc._id,
				name: name,
				messages: [],
				createdBy: {_id: context.id, username: context.username},
				users: [{_id: context.id, username: context.username}],
				status: 'created'
			}
		}
	},
	deleteChat: async ({chatId}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')

		const deletedResult = await chatCollection.deleteOne({
			_id: ObjectId(chatId)
		})

		if (deletedResult.deletedCount) {
			return {
				_id: chatId,
				status: 'deleted'
			}
		}else{
			return {
				_id: chatId,
				status: 'error'
			}
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


		const returnMessage = {
			_id: newMessage._id,
			to: {
				_id: newMessage.to
			},
			from: {
				_id: newMessage.from,
				username: context.username
			},
			text: newMessage.text,
			status: 'created'
		}

		pubsub.publish('createMessage', {createMessage: returnMessage})


		return returnMessage
	},
	deleteMessage: async ({messageId, chatId}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)
		const chatCollection = db.collection('Chat')

		var result = null
		if (!messageId) {
			throw new Error('MessageId is missing')
		} else {
			result = (await chatCollection.updateOne({'messages._id': ObjectId(messageId)}, {$pull: {messages: {_id: ObjectId(messageId)}}}))

			if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
				throw new Error('Message doesn\'t exist')
			}
		}

		const returnMessage = {_id: messageId, to: {_id: chatId}, status: 'deleted'}

		pubsub.publish('deleteMessage', {deleteMessage: returnMessage})

		return returnMessage

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

		return {_id: chatId, status: 'user_added'}
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
	chats: async ({limit, offset}, {context, query}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')


		let chats = (await chatCollection.aggregate([
			{
				$match: {
					$or: [{ users: {$in: [ObjectId(context.id)]} }, { createdBy: ObjectId(context.id) }]
				}
			},
			{
				$skip: offset,
			},
			{
				$limit: limit
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
					name: {'$first': '$name'},
					createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
					users: {$addToSet: {_id: '$users._id', username: '$users.username'}}
				}
			}
		]).toArray())


		return chats
	},
	chatsWithMessages: async ({limit, offset, messageLimit, messageOffset}, {context, query}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')

		let chats = (await chatCollection.aggregate([
			{
				$match: {
					$or: [{ users: {$in: [ObjectId(context.id)]} }, { createdBy: ObjectId(context.id) }]
				}
			},
			{
				$skip: offset,
			},
			{
				$limit: limit
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
			/* Calculate limit and offset */
			{
				$project: {
					name: 1,
					createdBy: 1,
					users: 1,
					messages: 1,
					messageCount: {$size: { $ifNull: [ '$messages', [] ] } },
					calcOffset: {
						$let: {
							vars: {
								messageCount: {$size: { $ifNull: [ '$messages', [] ] }}
							},
							in: {$subtract: ['$$messageCount', messageOffset + messageLimit]}
						}
					},
					calcLimit: {
						$let: {
							vars: {
								messageCount: {$size: { $ifNull: [ '$messages', [] ] } }
							},
							in: {$subtract: ['$$messageCount', messageOffset]}
						}
					}
				}
			},
			/* return messages based on limit and offset */
			{
				$project: {
					name: 1,
					createdBy: 1,
					users: 1,
					messageCount: 1,
					messages: {
						$cond: {
							if: {$gte: ['$calcOffset', 0]},
							then: {$slice: ['$messages', '$calcOffset', messageLimit]},
							else: {
								$cond: {
									if: {$gt: ['$calcLimit', 0]},
									then: {$slice: ['$messages', 0, '$calcLimit']},
									else: [],
								},
							}
						}
					}
				}
			},
			/* Resolve also user who sent message */
			{$unwind: {path: '$messages', preserveNullAndEmptyArrays: true}},
			{$unwind: {path: '$messages.from', preserveNullAndEmptyArrays: true}},
			{
				$lookup: {
					from: 'User',
					localField: 'messages.from',
					foreignField: '_id',
					as: 'messageFrom'
				}
			},
			{$unwind: {path: '$messageFrom', preserveNullAndEmptyArrays: true}},
			// Group back to arrays
			{
				$group: {
					_id: '$_id',
					name: {'$first': '$name'},
					createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
					users: {$addToSet: {_id: '$users._id', username: '$users.username'}},
					messageCount: {'$first': '$messageCount'},
					messages: {
						$addToSet: {
							_id: '$messages._id',
							from: '$messageFrom',
							to: '$messageTo',
							text: '$messages.text'
						}
					}
				}
			},
			{
				$project: {
					name: 1,
					createdBy: 1,
					users: 1,
					messageCount: 1,
					/* return empty array if there are no messages */
					messages: {$cond: [{$eq: [{$arrayElemAt: ['$messages', 0]}, {}]}, [], '$messages']}
				}
			}
		]).toArray())

		//console.log(chats)

		return chats
	},
	chat: async ({chatId, messageLimit, messageOffset}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		const chatCollection = db.collection('Chat')

		const chat = (await chatCollection.aggregate([
			{
				$match: {
					_id: ObjectId(chatId),
					$or: [{ users: {$in: [ObjectId(context.id)]} }, { createdBy: ObjectId(context.id) }]
				}
			},
			{
				$unwind: '$users' /* unwind because localFiled users is an array -> https://docs.mongodb.com/manual/reference/operator/aggregation/lookup/ */
			},
			/* Resolve users in this chat */
			{
				$lookup: {
					from: 'User',
					localField: 'users',
					foreignField: '_id',
					as: 'users'
				}
			},
			/* Resolve creator of this chat */
			{
				$lookup: {
					from: 'User',
					localField: 'createdBy',
					foreignField: '_id',
					as: 'createdBy'
				}
			},
			/* Calculate limit and offset */
			{
				$project: {
					name: 1,
					createdBy: 1,
					users: 1,
					messages: 1,
					messageCount: {$size: { $ifNull: [ '$messages', [] ] }},
					calcOffset: {
						$let: {
							vars: {
								messageCount: {$size: { $ifNull: [ '$messages', [] ] }}
							},
							in: {$subtract: ['$$messageCount', messageOffset + messageLimit]}
						}
					},
					calcLimit: {
						$let: {
							vars: {
								messageCount: {$size: { $ifNull: [ '$messages', [] ] }}
							},
							in: {$subtract: ['$$messageCount', messageOffset]}
						}
					}
				}
			},
			/* return messages based on limit and offset */
			{
				$project: {
					name: 1,
					createdBy: 1,
					users: 1,
					messageCount: 1,
					messages: {
						$cond: {
							if: {$gte: ['$calcOffset', 0]},
							then: {$slice: ['$messages', '$calcOffset', messageLimit]},
							else: {
								$cond: {
									if: {$gt: ['$calcLimit', 0]},
									then: {$slice: ['$messages', 0, '$calcLimit']},
									else: [],
								},
							}
						}
					}
				}
			},
			/* Resolve also user who sent message */
			{$unwind: {path: '$messages', preserveNullAndEmptyArrays: true}},
			{$unwind: {path: '$messages.from', preserveNullAndEmptyArrays: true}},
			{
				$lookup: {
					from: 'User',
					localField: 'messages.from',
					foreignField: '_id',
					as: 'messageFrom'
				}
			},
			{$unwind: {path: '$messageFrom', preserveNullAndEmptyArrays: true}},
			{$unwind: {path: '$messages.to', preserveNullAndEmptyArrays: true}},
			{
				$lookup: {
					from: 'Chat',
					localField: 'messages.to',
					foreignField: '_id',
					as: 'messageTo'
				}
			},
			{$unwind: {path: '$messageTo', preserveNullAndEmptyArrays: true}},
			// Group back to arrays
			{
				$group: {
					_id: '$_id',
					name: {'$first': '$name'},
					createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
					users: {$addToSet: {_id: '$users._id', username: '$users.username'}},
					messageCount: {'$first': '$messageCount'},
					messages: {
						$addToSet: {
							'_id': '$messages._id',
							'from': '$messageFrom',
							'to': '$messageTo',
							'text': '$messages.text'
						}
					}
				}
			},
			/* return empty array if there are no messages */
			{
				$project: {
					name: 1,
					createdBy: 1,
					users: 1,
					messageCount: 1,
					messages: {$cond: [{$eq: [{$arrayElemAt: ['$messages', 0]}, {}]}, [], '$messages']}
				}
			}
		]).next())

		return chat
	},
	chatMessages: async ({chatId, messageLimit, messageOffset}, {context}) => {
		Util.checkIfUserIsLoggedIn(context)

		if (messageLimit <= 0)
			return []

		const chatCollection = db.collection('Chat')


		const chat = (await chatCollection.aggregate([
			{
				$match: {
					_id: ObjectId(chatId),
					$or: [{ users: {$in: [ObjectId(context.id)]} }, { createdBy: ObjectId(context.id) }]
				}
			},
			/* Calculate limit and offset */
			{
				$project: {
					messages: 1,
					calcOffset: {
						$let: {
							vars: {
								messageCount: {$size: { $ifNull: [ '$messages', [] ] }}
							},
							in: {$subtract: ['$$messageCount', messageOffset + messageLimit]}
						}
					},
					calcLimit: {
						$let: {
							vars: {
								messageCount: {$size: { $ifNull: [ '$messages', [] ] }}
							},
							in: {$subtract: ['$$messageCount', messageOffset]}
						}
					}
				}
			},
			/* return messages based on limit and offset */
			{
				$project: {
					messages: {
						$cond: {
							if: {$gte: ['$calcOffset', 0]},
							then: {$slice: ['$messages', '$calcOffset', messageLimit]},
							else: {
								$cond: {
									if: {$gt: ['$calcLimit', 0]},
									then: {$slice: ['$messages', 0, '$calcLimit']},
									else: [],
								},
							}
						}
					}
				}
			},
			/* Resolve also user who sent message */
			{$unwind: {path: '$messages', preserveNullAndEmptyArrays: true}},
			{$unwind: {path: '$messages.from', preserveNullAndEmptyArrays: true}},
			{
				$lookup: {
					from: 'User',
					localField: 'messages.from',
					foreignField: '_id',
					as: 'messageFrom'
				}
			},
			{$unwind: {path: '$messageFrom', preserveNullAndEmptyArrays: true}},
			{$unwind: {path: '$messages.to', preserveNullAndEmptyArrays: true}},
			{
				$lookup: {
					from: 'Chat',
					localField: 'messages.to',
					foreignField: '_id',
					as: 'messageTo'
				}
			},
			{$unwind: {path: '$messageTo', preserveNullAndEmptyArrays: true}},
			// Group back to arrays
			{
				$group: {
					_id: '$_id',
					messages: {
						$addToSet: {
							'_id': '$messages._id',
							'from': '$messageFrom',
							'to': '$messageTo',
							'text': '$messages.text'
						}
					}
				}
			},
			/* return empty array if there are no messages */
			{
				$project: {
					messages: {$cond: [{$eq: [{$arrayElemAt: ['$messages', 0]}, {}]}, [], '$messages']}
				}
			}
		]).next())
		return chat.messages
	}
})