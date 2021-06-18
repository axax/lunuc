import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import Cache from 'util/cache'
import GenericResolver from '../../api/resolver/generic/genericResolver'
import Util from '../../api/util'
import {ObjectId} from 'mongodb'
import {matchExpr} from '../../client/util/json'

async function getGenericTypeDefinitionWithStructure(db, {name, id}) {

    if (!id && !name) {
        return
    }


    const cacheKeyPrefix = 'GenericDataDefinition-WithStructure-', cacheKey = cacheKeyPrefix + (id ? id : name)

    let definition = Cache.get(cacheKey)
    if (definition === undefined) {
        definition = await db.collection('GenericDataDefinition').findOne({$or: [{_id: id && ObjectId(id)}, {name}]})

        console.log(`load GenericDataDefinition by id=${id} or by name=${name} -> ${definition}`)

        // put in cache with both name and id as key
        Cache.set(cacheKey, definition, 86400000) // cache expires in 100 min
        if (definition) {
            Cache.setAlias(cacheKeyPrefix + (id ? definition.name : definition._id), cacheKey)
        }
    }

    return definition
}


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

Hook.on('beforePubSub', async ({triggerName, payload, db, context}) => {
    if (triggerName === 'subscribeGenericData') {
        if (payload.subscribeGenericData.action === 'update' || payload.subscribeGenericData.action === 'create') {
            const item = payload.subscribeGenericData.data[0]
            if (item && item.definition) {

                const def = await getGenericTypeDefinitionWithStructure(db, {id: item.definition._id})

                if (def && def.structure) {
                    const struct = def.structure

                    if (struct.fields) {
                        let jsonData

                        for (let i = 0; i < struct.fields.length; i++) {
                            const field = struct.fields[i]
                            if (field.genericType && field.pickerField) {
                                if (!jsonData) {
                                    jsonData = item.data.constructor === Object ? item.data : JSON.parse(item.data)
                                }
                                const ids = jsonData[field.name]
                                if (ids) {
                                    const subData = await GenericResolver.entities(db, context, 'GenericData', ['_id', {definition: ['_id']}, 'data'],
                                        {
                                            filter: `_id==${ids.constructor === Array ? '[' + ids.join(',') + ']' : ids}`,
                                            limit: 1000,
                                            includeCount: false,
                                            projectResult: true
                                        })

                                    if (subData.results.length > 0) {
                                        jsonData[field.name] = []

                                        subData.results.forEach(row => {
                                            row.data = JSON.parse(row.data)
                                            jsonData[field.name].push(row)

                                        })
                                    }
                                }
                            }
                        }
                        if (jsonData) {
                            item.data = JSON.stringify(jsonData)
                        }
                    }

                }
            }
        }
    }
})


Hook.on('beforeTypeLoaded', async ({type, db, context, match, otherOptions}) => {


    if (type === 'GenericData') {

        const genericType = otherOptions.genericType || otherOptions.meta

        if (genericType) {
            const def = await getGenericTypeDefinitionWithStructure(db, {name: genericType})

            if (def && def.structure) {
                const struct = def.structure

                if (struct.access && struct.access.read) {
                    const accessMatch = await Util.getAccessFilter(db, context, struct.access.read)
                    if (accessMatch.createdBy) {
                        match.createdBy = accessMatch.createdBy
                    }

                }

                match.definition = {$eq: ObjectId(def._id)}

                if (struct.fields) {
                    struct.fields.forEach(field => {

                        if (field.genericType) {

                            if (!otherOptions.lookups) {
                                otherOptions.lookups = []
                            }

                            let id = {
                                    $cond:
                                        {
                                            if: {$isArray: `$data.${field.name}`},
                                            then: {
                                                $map: {
                                                    input: `$data.${field.name}`, in: {$toObjectId: '$$this'}
                                                }
                                            },
                                            else: {$toObjectId: `$data.${field.name}`}
                                        }
                                },
                                $match = {
                                    $expr: {
                                        $cond:
                                            {
                                                if: {$isArray: `$$id`},
                                                then: {$in: ['$_id', '$$id']},
                                                else: {$eq: ['$_id', '$$id']}
                                            }
                                    }
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
                                                    __typename: 'GenericData',
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
            } else {
                throw new Error(`Invalid type GenericType.${genericType}`)
            }
        }
    }
}, 99)


Hook.on('typeBeforeUpdate', async ({type, data, _meta, db, context}) => {

    if (type === 'GenericData' && data.definition) {

        /*  const def = await getGenericTypeDefinitionWithStructure(db,{id:data.definition})

          if(def.trigger && def.trigger.update){
              console.log(def.trigger.update)
          }*/

        if (_meta) {

            const meta = JSON.parse(_meta)

            if (meta.partialUpdate) {
                // if object it is updated partially
                data.data = JSON.parse(data.data)

                console.log(data)
            }
        }


    }

})


Hook.on('typeBeforeCreate', async ({db, type, data}) => {
    if (type === 'GenericData' && data.definition) {

        const def = await getGenericTypeDefinitionWithStructure(db, {id: data.definition})


        if (def && def.structure) {
            const struct = def.structure
            if (struct.fields) {
                for (let i = 0; i < struct.fields.length; i++) {
                    const field = struct.fields[i]
                    if (field.autoinc) {

                        const last = await db.collection('GenericData').find({definition: ObjectId(data.definition)}).sort({_id: -1}).limit(1).toArray()
                        if (last && last.length) {
                            try {
                                const nr = parseFloat(last[0].data[field.name])
                                if (data.data.constructor !== Object) {
                                    data.data = JSON.parse(data.data)
                                }
                                data.data[field.name] = nr + 1
                            } catch (e) {
                                console.log(e)
                            }

                        }

                    }
                }

            }

        }


    }

})


Hook.on('typeCreated_GenericData', async ({resultData, db, context}) => {
    // resultData.data = JSON.parse(resultData.data)
})

Hook.on('AggregationBuilderBeforeQuery', async ({db, type, filters}) => {

    // performance optimization
    if (type === 'GenericData' && filters) {
        const part = filters.parts['definition.name']
        if (part && part.value && part.comparator === '==') {

            const def = await getGenericTypeDefinitionWithStructure(db, {name: part.value})


            if (def) {
                console.log(`change name ${part.value} to id ${def._id}`)

                filters.parts['definition'] = filters.parts['definition.name']
                delete filters.parts['definition.name']

                filters.parts['definition'].value = def._id
            }
        }
    }

})


Hook.on('ResolverBeforePublishSubscription', async ({context, payload, hookResponse}) => {

    //return payload.userId === context.id
    if(context.variables && context.variables.filter){

        const filters = JSON.parse(context.variables.filter),
            action = payload.subscribeGenericData.action,
            datas = payload.subscribeGenericData.data,
            filter = filters[action]

        if( filter ){

            for(let i = 0; i < datas.length; i++){
                const data = datas[i]
                console.log(data, filter)
                if( matchExpr(filter, data)){
                    console.log('abort publish')
                    hookResponse.abort = true
                    return
                }
            }
        }
        payload.subscribeGenericData.filter = filter
    }

})



