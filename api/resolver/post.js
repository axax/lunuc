import Util from '../util'
import {ObjectId} from 'mongodb'

import translate from 'google-translate-api'


export const postResolver = (db) => ({
    posts: async ({limit, offset, query}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const postCollection = db.collection('Post')
        console.log(query)

        const pipe = []

        let sort = {_id: 1},
            match = {createdBy: ObjectId(context.id)},
            project = {title:1,body:1,search:1,createdBy:1}

        if (query) {
            match.$text={$search: query}
            project.searchScore = { $meta: 'textScore' }
            sort = {score: {$meta: 'textScore'}}
        }

        pipe.push(...[
            {
                $match: match
            },
            {
                $project: project
            },
            {
                $skip: offset,
            },
            {
                $limit: limit
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
                    title: {'$first': '$title'},
                    body: {'$first': '$body'},
                    search: {'$first': '$search'},
                    createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
                    searchScore: {'$first': '$searchScore'},
                }
            },
            {$sort: sort}
        ])

        let posts = (await postCollection.aggregate(pipe).toArray())

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