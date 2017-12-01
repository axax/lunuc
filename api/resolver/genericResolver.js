import Util from '../util'
import {ObjectId} from 'mongodb'


const GenericResolver = {
    entities: async (db, context, collectionName, data, options) => {

        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection(collectionName)

        let group = {}
        data.forEach(function (value, i) {
            group[value] = {'$first': '$' + value}
        })

        let match
        if( options && options.match ){
            match = options.match
        }else{
            match = {createdBy: ObjectId(context.id)}
        }


        let a = (await collection.aggregate([
            {
                $match: match
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
                    ...group,
                    createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
                }
            },
            {$sort: {_id: -1}}
        ]).toArray())

        return a
    },
    createEnity: async (db, context, collectionName, data) => {
        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection(collectionName)

        const insertResult = await collection.insertOne({
            ...data,
            createdBy: ObjectId(context.id)
        })

        if (insertResult.insertedCount) {
            const doc = insertResult.ops[0]

            return Object.assign(data, {
                _id: doc._id,
                status: 'created'
            })
        }
    },
    deleteEnity: async (db, context, collectionName, data) => {

        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection(collectionName)

        if (!data._id) {
            throw new Error('Id is missing')
        }

        const deletedResult = await collection.deleteOne({
            _id: ObjectId(data._id)
        })

        if (deletedResult.deletedCount) {
            return {
                _id: data._id,
                status: 'deleted'
            }
        } else {
            return {
                _id: data._id,
                status: 'error'
            }
        }
    },
    updateEnity: async (db, context, collectionName, data) => {

        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection(collectionName)

        const dataSet = Object.assign({},data)
        delete dataSet._id

        const result = (await collection.findOneAndUpdate({_id: ObjectId(data._id)}, {
            $set: dataSet
        }, {returnOriginal: false}))
        if (result.ok !== 1) {
            throw new ApiError(collectionName+' could not be changed')
        }
        return {
            ...data,
            createdBy: {
                _id: ObjectId(context.id),
                username: context.username
            },
            status: 'updated'
        }
    }
}

export default GenericResolver