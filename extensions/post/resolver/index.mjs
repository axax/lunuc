import Util from '../../../api/util/index.mjs'
import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import {withFilter} from 'graphql-subscriptions'
import {pubsub} from '../../../api/subscription.mjs'


export default db => ({
    Query: {
        posts: async ({limit, page, offset, filter, query}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            let sort = {_id: 1},
                match = {createdBy: new ObjectId(context.id)}

            if (query) {
                match.$or = [{title: {$regex: query, $options: 'i'}}, {$text: {$search: query}}]
                sort = {score: {$meta: 'textScore'}}
            }
            const posts = await GenericResolver.entities(db, context, 'Post', ['title', 'body', 'editor', 'search', 'searchScore'], {
                match,
                page,
                limit,
                offset,
                filter,
                sort
            })

            posts.results.forEach(post=>{
                if(!post.title){
                    post.title = 'no title set'
                }

            })

            return posts
        }
    },
    Mutation: {
        createPost: async ({title, body, editor}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const postCollection = db.collection('Post')

            const search = Util.draftjsRawToFields(body)

            const insertResult = await postCollection.insertOne({
                title,
                body,
                editor,
                search,
                createdBy: new ObjectId(context.id)
            })

            if (insertResult.insertedId) {
                return {
                    _id: insertResult.insertedId,
                    title,
                    body,
                    editor,
                    createdBy: {
                        _id: new ObjectId(context.id),
                        username: context.username
                    },
                    status: 'created'
                }
            }
        },
        updatePost: async ({_id, title, body, editor}, {context}) => {

            const userContext = await Util.userOrAnonymousContext(db,context)

            // TODO premission management
            if( _id !== '640c372b0cbdad6ff37fd400') {
                Util.checkIfUserIsLoggedIn(context)
            }

            const postCollection = db.collection('Post')

            const $set = {}

            if(title!==undefined){
                $set.title = title
            }

            if(body!==undefined){
                $set.body = body
            }
            if(editor!==undefined){
                $set.editor = editor
            }

           // const search = Util.draftjsRawToFields(body)
            const result = await postCollection.findOneAndUpdate({_id: new ObjectId(_id)}, {
                $set
            }, {returnOriginal: false, includeResultMetadata: true})
            if (result.ok !== 1) {
                throw new ApiError('Post could not be changed')
            }

            pubsub.publish('subscribePost', {userId:userContext.id,subscribePost: {action: 'update', data: [{_id,body, title}]}})


            return {
                _id,
                title,
                body,
                createdBy: {
                    _id: new ObjectId(userContext.id),
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
                _id: new ObjectId(_id)
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
        subscribePost: withFilter(() => pubsub.asyncIterableIterator('subscribePost'),
            (payload, context) => {
                if( payload ) {
                    //return payload.userId === context.id
                    return true
                }
            }
        )
    }
})
