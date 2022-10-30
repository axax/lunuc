import Hook from 'util/hook.cjs'
import schema from './schema/'
import resolver from './resolver/'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from 'util/deepMerge.mjs'
import {getGenericTypeDefinitionWithStructure} from "../genericdata/util/index.mjs";
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

Hook.on('beforeTypeLoaded', async ({type, db, context, match, data, otherOptions}) => {


    if (type === 'Chat') {
        if(match.createdBy){
            match.$or = [{createdBy:match.createdBy},{users:match.createdBy}]
            delete match.createdBy
        }
    } else if (type === 'ChatMessage') {
        if(match.createdBy){

            const chats = await GenericResolver.entities(db, context, 'Chat', [], {limit:100})
            match.chat = {$in:chats.results.map(f=>f._id)}
         //   match.$or = [{createdBy:match.createdBy},{users:match.createdBy}]
            delete match.createdBy
        }

    }
}, 99)