import Util from 'api/util/index.mjs'
import {ObjectId} from 'mongodb'

export default (db) => ({
    Mutation: {
        addUserToChat: async ({chatId, userId}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            // check if user exists
            const userCollection = db.collection('User')
            const user = (await userCollection.findOne({_id: ObjectId(userId)}))

            if (!user) {
                throw new Error('User doesnt exist')
            }

            // add user to chat
            const chatCollection = db.collection('Chat')
            const result = await chatCollection.updateOne({
                    _id: ObjectId(chatId)
                },
                {
                    $addToSet: {users: ObjectId(userId)}
                })


            if (result.matchedCount === 0) {
                throw new Error('Chat doesnt exist')
            } else if (result.modifiedCount === 0) {
                throw new Error('User is already added to the chat')
            }

            return {_id: chatId, status: 'user_added'}
        },
        removeUserFromChat: async ({chatId, userId}, {context}) => {
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

            return {_id: chatId, status: 'user_removed'}
        }
    }
})
