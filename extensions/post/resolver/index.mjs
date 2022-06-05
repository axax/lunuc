import Util from '../../../api/util/index.mjs'
import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import {withFilter} from 'graphql-subscriptions'
import {pubsub} from '../../../api/subscription.mjs'


export default db => ({
    Query: {
        posts: async ({limit, page, offset, filter, query}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const pipe = []

            let sort = {_id: 1},
                match = {createdBy: ObjectId(context.id)}

            if (query) {
                match.$or = [{title: {$regex: query, $options: 'i'}}, {$text: {$search: query}}]
                sort = {score: {$meta: 'textScore'}}
            }
            const posts = await GenericResolver.entities(db, context, 'Post', ['title', 'body', 'search', 'searchScore'], {
                match,
                page,
                limit,
                offset,
                filter,
                sort
            })

            return posts
        }
    },
    Mutation: {
        createPost: async ({title, body}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const postCollection = db.collection('Post')

            const search = Util.draftjsRawToFields(body)

            const insertResult = await postCollection.insertOne({
                title,
                body,
                search,
                createdBy: ObjectId(context.id)
            })

            if (insertResult.insertedId) {
                return {
                    _id: insertResult.insertedId,
                    title,
                    body,
                    createdBy: {
                        _id: ObjectId(context.id),
                        username: context.username
                    },
                    status: 'created'
                }
            }
        },
        updatePost: async ({_id, title, body}, {context}) => {

            const userContext = await Util.userOrAnonymousContext(db,context)

            // TODO premission management
            if( _id !== '5d499dfdd80222b7a0556c1c') {
                Util.checkIfUserIsLoggedIn(context)
            }

            const postCollection = db.collection('Post')

            const search = Util.draftjsRawToFields(body)
            const result = (await postCollection.findOneAndUpdate({_id: ObjectId(_id)}, {
                $set: {
                    title,
                    body,
                    search
                }
            }, {returnOriginal: false}))
            if (result.ok !== 1) {
                throw new ApiError('Post could not be changed')
            }

            pubsub.publish('subscribePost', {userId:userContext.id,subscribePost: {action: 'update', data: {_id,body, title}}})


            return {
                _id,
                title,
                body,
                createdBy: {
                    _id: ObjectId(userContext.id),
                    username: userContext.username
                },
                status: 'updated'
            }
        },
        deletePost: async ({_id}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const postCollection = db.collection('Post')

            if (!_id) {
                throw new Error('Id is missing')
            }

            const deletedResult = await postCollection.deleteOne({
                _id: ObjectId(_id)
            })

            if (deletedResult.deletedCount) {
                return {
                    _id: _id,
                    status: 'deleted'
                }
            } else {
                return {
                    _id: _id,
                    status: 'error'
                }
            }
        }
    },
    Subscription:{
        subscribePost: withFilter(() => pubsub.asyncIterator('subscribePost'),
            (payload, context) => {
                if( payload ) {
                    //return payload.userId === context.id
                    return true
                }
            }
        )
    }
})
