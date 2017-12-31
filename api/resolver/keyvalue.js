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
                _id: doc._id,
                status: 'created',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                },
            }
        })
    },
    deleteKeyValue: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db,context,'KeyValue',{_id})
    }
})