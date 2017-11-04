import Util from '../util'
import {ObjectId} from 'mongodb'

import translate from 'google-translate-api'


export const wordResolver = (db) => ({

    translate: async ({text, toIso, fromIso}, {context}) => {

        if( !toIso ){
            toIso = 'en'
        }


        const res = (await translate(text, {to: toIso, from:fromIso}))
        return {text:res.text, fromIso:res.from.language.iso, toIso}

    },
    words: async ({limit, offset}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const wordCollection = db.collection('Word')


        let words = (await wordCollection.aggregate([
            {
                $match: {createdBy: ObjectId(context.id)}
            },
            {$sort: {_id: -1}},
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
                    en: {'$first': '$en'},
                    de: {'$first': '$de'},
                    createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
                }
            },
            {$sort: {_id: -1}}
        ]).toArray())


        return {results:words}
    },
    createWord: async ({en, de}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const wordCollection = db.collection('Word')


        const insertResult = await wordCollection.insertOne({
            de,
            en,
            createdBy: ObjectId(context.id)
        })

        if (insertResult.insertedCount) {
            const doc = insertResult.ops[0]


            return {
                _id: doc._id,
                en,
                de,
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                },
                status: 'created'
            }
        }
    },
    updateWord: async ({_id, en, de}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const wordCollection = db.collection('Word')

        const result = (await wordCollection.findOneAndUpdate({_id: ObjectId(_id)}, {$set: {en,de}}, {returnOriginal: false}))
        if (result.ok !== 1) {
            throw new ApiError('Word could not be changed')
        }
        return {
                _id,
                en,
                de,
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                },
                status: 'updated'
            }
    },
    deleteWord: async ({_id}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const wordCollection = db.collection('Word')

        if (!_id) {
            throw new Error('Id is missing')
        }

        const deletedResult = await wordCollection.deleteOne({
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