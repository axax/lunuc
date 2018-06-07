import Util from 'api/util'
import {ObjectId} from 'mongodb'
import GenericResolver from 'api/resolver/generic/genericResolver'


export default db => ({
    posts: async ({limit, page, offset, filter, query}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const pipe = []

        let sort = {_id: 1},
            match = {createdBy: ObjectId(context.id)}

        if (query) {
            match.$or = [{title:{$regex: query, $options: 'i'}}, {$text:{$search: query}}]
            sort = {score: {$meta: 'textScore'}}
        }
console.log( filter )
        const posts = await GenericResolver.entities(db, context, 'Post', ['title', 'body', 'search', 'searchScore'], {match, page, limit, offset, filter, sort})

        return posts
    },
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

        if (insertResult.insertedCount) {
            const doc = insertResult.ops[0]


            return {
                _id: doc._id,
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
        Util.checkIfUserIsLoggedIn(context)

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
        return {
            _id,
            title,
            body,
            createdBy: {
                _id: ObjectId(context.id),
                username: context.username
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
})