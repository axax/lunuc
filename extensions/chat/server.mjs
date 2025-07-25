import Hook from 'util/hook.cjs'
import schema from './schema/'
import resolver from './resolver/'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from 'util/deepMerge.mjs'
import Util from "../../api/util/index.mjs";
import {ObjectId} from "mongodb";
import GenericResolver from "../../api/resolver/generic/genericResolver.mjs";

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db), resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})

Hook.on('typeCreated_ChatMessage', async ({result, db}) => {
    if (result.createdBy) {
        const user = await Util.userById(db,result.createdBy._id)
        if(user) {
            result.createdBy.picture = user.picture
        }
    }
})
Hook.on('typeLoaded', async ({result, context, type, db}) => {
    if(type==='ChatMessage') {
        const userId = new ObjectId(context.id)
        for(const entry of result.results){
            if(entry.readBy.findIndex(u=>u._id.toString()===context.id)<0){
               entry.readBy.push({_id:userId, username: context.username})
                db.collection('ChatMessage').updateOne(
                    { _id: entry._id },
                    { $push: { readBy: userId } }
                )
            }
        }
    }
})

Hook.on('beforeTypeLoaded', async ({type, db, context, match, data, otherOptions}) => {


    if (type === 'Chat') {
        if(match.createdBy){
            match.$or = [{createdBy:match.createdBy},{users:match.createdBy}]
            delete match.createdBy
        }
    } else if (type === 'ChatMessage') {
        if(match.createdBy){

            const chats = await GenericResolver.entities(db, context, 'Chat', [], {limit:100, noLookupFields:['createdBy']})
            match.chat = {$in:chats.results.map(f=>f._id)}
         //   match.$or = [{createdBy:match.createdBy},{users:match.createdBy}]
            delete match.createdBy
        }

    }
}, 99)




Hook.on('ResolverBeforePublishSubscription', async ({context, db, payload, hookResponse}) => {

    //return payload.userId === context.id
    if (payload.subscribeChatMessage) {
        if(!context.id || context.id === payload.userId) {
            hookResponse.abort = true

        }else {
            const chats = await GenericResolver.entities(db, context, 'Chat', [], {limit:100, noLookupFields:['createdBy']})
            //chats.results.map(f=>f._id)
            const chatId = payload.subscribeChatMessage.data[0].chat._id.toString()
            if(!chats.results.find(f=>f._id.toString()===chatId)) {
                 hookResponse.abort = true
            }
        }
    }

})