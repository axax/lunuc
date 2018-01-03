import GenericResolver from './generic/genericResolver'
import Util from '../util'
import {ObjectId} from 'mongodb'



export const keyvalueResolver = (db) => ({
    keyValues: async ({keys,limit, offset}, {context}) => {
        const match = {createdBy: ObjectId(context.id)}
        if( keys ){
            match.key = { $in: keys }
        }
        return await GenericResolver.entities(db,context,'KeyValue',['key','value'],{limit, offset, match})
    },
    keyValue: async ({key}, {context}) => {
        const keyValues=await GenericResolver.entities(db,context,'KeyValue',['key','value'],{match:{createdBy: ObjectId(context.id),key}})
		if( keyValues && keyValues.results )
        	return keyValues.results[0]
    },
    setKeyValue: async ({key,value}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

        // update or insert if not exists
        return Util.setKeyValue(db,context,key,value).then((doc) => {
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