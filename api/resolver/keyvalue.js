import GenericResolver from './generic/genericResolver'
import Util from '../util'
import {ObjectId} from 'mongodb'



export const keyvalueResolver = (db) => ({
    keyValues: async ({limit, offset}, {context}) => {
        return await GenericResolver.entities(db,context,'KeyValue',['key','value'],{limit, offset})
    },
    keyValue: async ({key}, {context}) => {
        const keyValues=await GenericResolver.entities(db,context,'KeyValue',['key','value'],{match:{createdBy: ObjectId(context.id),key}})
		if( keyValues )
        	return keyValues.results[0]
    },
    setKeyValue: async ({key,value}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

        // update or insert if not exists
        return db.collection('KeyValue').updateOne({createdBy: ObjectId(context.id),key}, {$set: {createdBy: ObjectId(context.id),key, value}}, {upsert: true}).then((doc) => {
            return {key,
                value,
                status: 'created',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                },
            }
        })
    },
    deleteKeyValue: async ({key}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection('KeyValue')

        const deletedResult = await collection.deleteOne({createdBy: ObjectId(context.id),key})

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