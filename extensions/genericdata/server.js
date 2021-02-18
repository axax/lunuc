import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import Cache from 'util/cache'
import GenericResolver from '../../api/resolver/generic/genericResolver'
import Util from '../../api/util'
import {ObjectId} from 'mongodb'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

// Hook when the type Api has changed
Hook.on('typeUpdated_GenericDataDefinition', ({db, result}) => {
    Cache.clearStartWith('GenericDataDefinition')
})

/*Hook.on('typeBeforeCreate', ({type, data}) => {
    if( type==='GenericData'){
        //TODO
    }
})*/


Hook.on('beforePubSub', async ({triggerName, payload, db, context}) => {
    if(triggerName==='subscribeGenericData') {
        if(payload.subscribeGenericData.action==='update' || payload.subscribeGenericData.action==='create') {
            const item = payload.subscribeGenericData.data[0]
            if(item.definition){

                const data = await GenericResolver.entities(db, context, 'GenericDataDefinition', ['_id','name', 'structure'],
                    {
                        filter: `_id==${item.definition._id}`,
                        limit: 1,
                        includeCount: false,
                        projectResult: true,
                        postConvert: false,
                        cache: {
                            expires: 86400000,
                            key: `GenericDataDefinition${item.definition._id}`
                        }
                    })
                if (data.results.length === 1) {
                    const struct = data.results[0].structure


                    if (struct && struct.fields) {
                        let jsonData

                        for(let i=0; i<struct.fields.length; i++){
                            const field = struct.fields[i]
                            if (field.genericType && field.pickerField) {
                                if(!jsonData){
                                    jsonData = JSON.parse(item.data)
                                }
                                const subData = await GenericResolver.entities(db, context, 'GenericData', ['_id',{definition:['_id']},'data'],
                                    {
                                        filter: `_id==${jsonData[field.name]}`,
                                        limit: 1,
                                        includeCount: false,
                                        projectResult: true
                                    })
                                if (subData.results.length === 1) {

                                    jsonData[field.name] = subData.results
                                    jsonData[field.name][0].data = JSON.parse(jsonData[field.name][0].data)
                                }
                            }
                        }
                        if(jsonData){
                            item.data = JSON.stringify(jsonData)
                        }
                    }

                }
            }
        }
    }
})


Hook.on('beforeTypeLoaded', async ({type, db, context, match, otherOptions}) => {
    if (type === 'GenericData' && otherOptions.genericType) {

        const data = await GenericResolver.entities(db, context, 'GenericDataDefinition', ['_id','name', 'structure'],
            {
                filter: `name==${otherOptions.genericType}`,
                limit: 1,
                includeCount: false,
                projectResult: true,
                postConvert: false,
                cache: {
                    expires: 86400000,
                    key: `GenericDataDefinition${otherOptions.genericType}`
                }
            })
        if (data.results.length === 1) {
            const struct = data.results[0].structure

            if(struct.access && struct.access.read) {
                const accessMatch = await Util.getAccessFilter(db, context, struct.access.read)
                if(accessMatch.createdBy){
                    match.createdBy = accessMatch.createdBy
                }

            }

            match.definition = {$eq: ObjectId(data.results[0]._id)}

            if (struct && struct.fields) {
                struct.fields.forEach(field => {

                    if (field.genericType) {

                        if (!otherOptions.lookups) {
                            otherOptions.lookups = []
                        }

                        let id, $match
                        if (field.multi) {
                            id = {
                                $map: {
                                    input: `$data.${field.name}`, in: {$toObjectId: '$$this'}
                                }
                            }
                            $match = {$expr: {$in: ['$_id', '$$id']}}
                        } else {
                            id = {$toObjectId: `$data.${field.name}`}
                            $match = {$expr: {$eq: ['$_id', '$$id']}}
                        }
                        otherOptions.lookups.push(
                            {
                                $lookup: {
                                    from: 'GenericData',
                                    let: {
                                        id
                                    },
                                    pipeline: [
                                        {
                                            $match
                                        },
                                        {
                                            $project: {
                                                _id: 1,
                                                data: 1
                                            }
                                        }
                                    ],
                                    as: `data.${field.name}`
                                }
                            })

                    }

                })
            }
        }else{
            throw new Error(`Invalid type GenericType.${otherOptions.genericType}`)
        }
    }
}, 99)




Hook.on('typeCreated_GenericData', async ({resultData, db, context}) => {
   // resultData.data = JSON.parse(resultData.data)

})



