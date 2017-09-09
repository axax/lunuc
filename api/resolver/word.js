import Util from '../util'
import {ObjectId} from 'mongodb'


export const wordResolver = (db) => ({
    words: async ({limit, offset}, { context} ) => {
        Util.checkIfUserIsLoggedIn(context)

        const wordCollection = db.collection('Word')


        let words = (await wordCollection.aggregate([
            {
                $skip: offset,
            },
            {
                $limit: limit
            },
            {
                $project: {
                    en: 1,
                    de: 1
                }
            }
        ]).toArray())


        return words
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
            return doc
        }
    },
})