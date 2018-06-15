import GenericResolver from './generic/genericResolver'
import Util from '../util'
import {ObjectId} from 'mongodb'


export const keyvalueResolver = (db) => ({
    keyValues: async ({keys, limit, sort, offset, filter, all}, {context}) => {
        const match = {}

        if (all) {
            await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')
        } else {
            match.createdBy = ObjectId(context.id)
        }
        if (keys) {
            match.key = {$in: keys}
        }
        return await GenericResolver.entities(db, context, 'KeyValue', ['key', 'value'], {limit, offset, sort, filter, match})
    },
    keyValueGlobals: async ({keys, limit, sort, offset}, {context}) => {
        const match = {}
        if (keys) {
            match.key = {$in: keys}
        }
        return await GenericResolver.entities(db, context, 'KeyValueGlobal', ['key', 'value'], {
            limit,
            offset,
            sort,
            match
        })
    },
    keyValue: async ({key}, {context}) => {
        const keyValues = await GenericResolver.entities(db, context, 'KeyValue', ['key', 'value'], {
            match: {
                createdBy: ObjectId(context.id),
                key
            }
        })
        if (keyValues && keyValues.results)
            return keyValues.results[0]
    },
    setKeyValue: async ({key, value}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        //await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

        // update or insert if not exists
        return Util.setKeyValue(db, context, key, value).then((doc) => {
            return {
                key,
                value,
                status: 'created',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                },
            }
        })
    },
    createKeyValue: async ({key, value, createdBy}, {context}) => {
        await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

        return await GenericResolver.createEnity(db, context, 'KeyValue', {key, value, createdBy})
    },
    setKeyValueGlobal: async ({key, value}, {context}) => {
        await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

        return db.collection('KeyValueGlobal').updateOne({
            key
        }, {$set: {key, value}}, {upsert: true})
    },
    deleteKeyValue: async ({key}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection('KeyValue')

        const deletedResult = await collection.deleteOne({createdBy: ObjectId(context.id), key})

        if (deletedResult.deletedCount) {
            return {
                key,
                status: 'deleted'
            }
        } else {
            return {
                key,
                status: 'error'
            }
        }
    }
})