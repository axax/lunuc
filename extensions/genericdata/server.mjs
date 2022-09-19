import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import Cache from '../../util/cache.mjs'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import Util from '../../api/util/index.mjs'
import ClientUtil from '../../client/util/index.mjs'
import {ObjectId} from 'mongodb'
import {matchExpr} from '../../client/util/json.mjs'
import {findProjection} from '../../util/project.mjs'
import {getGenericTypeDefinitionWithStructure} from './util/index.mjs'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

Hook.on('beforePubSub', async ({triggerName, payload, db, context}) => {
    if (triggerName === 'subscribeGenericData') {
        if (payload.subscribeGenericData.action === 'update' || payload.subscribeGenericData.action === 'create') {
            const item = payload.subscribeGenericData.data[0]
            if (item && item.definition && item.data) {

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


async function addGenericTypeLookup(field, otherOptions, projection, db, key) {

    if (field.genericType) {

        let currentProjection
        // check if lookup is needed
        if (projection) {

            const dataProjection = findProjection('data', projection)
            if (dataProjection.data && dataProjection.data.constructor === Array) {
                const projectionResult = findProjection(field.name, dataProjection.data)
                currentProjection = projectionResult.data
                if (!currentProjection) {
                    //console.log(`no lookup for ${field.name} needed`)
                    return
                }else{

                    if(otherOptions.postLookup){
                        dataProjection.data.splice(projectionResult.index, 1)
                        dataProjection.data.push(field.name)
                        return
                    }

                }
            }

        }
        if (!currentProjection && field.vagueLookup === false && (!otherOptions.filter || otherOptions.filter.indexOf('_id=') !== 0)) {
            return
        }

        if (!key) {
            key = field.name
        }

        if (!otherOptions.lookups) {
            otherOptions.lookups = []
        }

        let id = {
                $cond:
                    {
                        if: {$isArray: `$data.${key}`},
                        then: {
                            $map: {
                                input: `$data.${key}`, in: {
                                    $convert: {
                                        input: '$$this', to: 'objectId', onError: {
                                            $convert: {input: '$$this._id', to: 'objectId'}
                                        }
                                    }
                                }
                            }
                        },
                        else: {
                            $convert: {
                                input: `$data.${key}`, to: 'objectId', onError: {
                                    $convert: {input: `$data.${key}._id`, to: 'objectId'}
                                }
                            }
                        }
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
        let subLookup = []
        if (otherOptions.lookupLevel > 1/* && currentProjection && currentProjection.constructor===Array*/) {

            const def = await getGenericTypeDefinitionWithStructure(db, {name: field.genericType})
            if (def && def.structure && def.structure.fields) {

                for (const subField of def.structure.fields) {
                    if (subField.genericType) {
                        await addGenericTypeLookup(subField, {
                            lookups: subLookup,
                            lookupLevel: otherOptions.lookupLevel - 1
                        }, currentProjection, db)
                    }
                }

            }
        }

        const newLookup = {
            $lookup: {
                from: 'GenericData',
                let: {
                    id
                },
                pipeline: [
                    {
                        $match
                    }
                ],
                as: field.metaFields ? `lookupRelation${key}` : `data.${key}`
            }
        }
        if (subLookup.length > 0) {
            subLookup.forEach(sub => {
                newLookup.$lookup.pipeline.push(sub)
            })
        }

        newLookup.$lookup.pipeline.push({
            $project: {
                __typename: 'GenericData',
                _id: 1,
                data: 1
            }
        })

        otherOptions.lookups.push(newLookup)
        if (field.metaFields) {

            // merge lookup result with original object which contains the metaValues
            otherOptions.lookups.push({
                $addFields: {
                    [`data.${key}`]: {
                        $map: {
                            input: `$data.${key}`,
                            as: 'rel',
                            in: {
                                $mergeObjects: [
                                    {__typename: 'GenericData'},
                                    '$$rel',
                                    {data: {$arrayElemAt: [`$lookupRelation${key}.data`, {$indexOfArray: [`$lookupRelation${key}._id`, {$toObjectId: '$$rel._id'}]}]}}
                                ]
                            }
                        }
                    }
                }
            })
        }


    }
}

Hook.on('beforeTypeLoaded', async ({type, db, context, match, data, otherOptions}) => {


    if (type === 'GenericData') {

        // the generic type name can either be passed with the property genericType (when called from the server)
        // or with generic property meta (when called via graphql request)
        const genericType = otherOptions.genericType || otherOptions.meta

        if (genericType) {
            const def = await getGenericTypeDefinitionWithStructure(db, {name: genericType})

            if (def && def.structure) {
                const struct = def.structure

                if (struct.access && struct.access.read) {
                    const accessMatch = await Util.getAccessFilter(db, context, struct.access.read)
                    if (accessMatch.createdBy) {
                        match.createdBy = accessMatch.createdBy
                    } else if(struct.access.read.force){

                        delete match.createdBy
                    }

                }

                match.definition = {$eq: ObjectId(def._id)}
                if (struct.fields) {

                    for (let i = 0; i < struct.fields.length; i++) {
                        const field = struct.fields[i]
                        await addGenericTypeLookup(field, otherOptions, data, db)
                    }
                }
            } else {
                throw new Error(`Invalid type GenericType.${genericType}`)
            }
        }
    }
}, 99)


async function postLookupResult(result, field, db, context) {
    const itemCache = {}

    for (let j = 0; j < result.results.length; j++) {
        const item = result.results[j].data[field.name]

        if (item) {

            let tempItem = item
            if (tempItem.constructor !== Array) {
                tempItem = [tempItem]
            }

            const newItems = []
            for (let k = 0; k < tempItem.length; k++) {

                if (!itemCache[tempItem[k]]) {
                    const itemResults = await GenericResolver.entities(db, context, 'GenericData', ['_id', {definition: ['_id']}, 'data'],
                        {
                            filter: `definition.name==${field.genericType} && _id==${tempItem[k]}`,
                            limit: 1,
                            includeCount: false,
                            meta: field.genericType,
                            postLookup:true,
                            lookupLevel:0

                        })

                    itemCache[tempItem[k]] = itemResults.results.length > 0 ? itemResults.results[0] : null

                    if (itemCache[tempItem[k]]) {
                        itemCache[tempItem[k]].data = JSON.parse(itemCache[tempItem[k]].data)
                        newItems.push(itemCache[tempItem[k]])
                    }
                }else{
                    newItems.push(itemCache[tempItem[k]])
                }

            }
            result.results[j].data[field.name] = newItems



        }
    }
}

async function postCheckResult(def, result, db, context, otherOptions) {
    for (let i = 0; i < def.structure.fields.length; i++) {
        const field = def.structure.fields[i]

        // post lookup
        if (field.genericType) {
            if (otherOptions.postLookup) {

                await postLookupResult(result, field, db, context)
            }
        }

        if (field.dynamic) {
            if (!field.dynamic.genericType) {
                console.warn('field.dynamic.genericType is missing')
            } else {

                for (let j = 0; j < result.results.length; j++) {
                    const item = result.results[j]
                    const data = JSON.parse(item.data)
                    const subData = await GenericResolver.entities(db, context, 'GenericData', ['_id', {definition: ['_id']}, 'data'],
                        {
                            filter: `definition.name==${field.dynamic.genericType}${field.dynamic.filter ? ' && ' + ClientUtil.replacePlaceholders(field.dynamic.filter, item) : ''}`,
                            limit: 1000,
                            includeCount: false,
                            meta: field.dynamic.genericType
                        })

                    subData.results.forEach(subItem => {
                        subItem.data = JSON.parse(subItem.data)
                        subItem.__typename = field.type
                    })

                    data[field.name] = subData.results
                    item.data = JSON.stringify(data)
                }
            }

        }
    }
}



/*
Return the structure of the dynamic type as meta data
 */
Hook.on('typeLoaded', async ({type, db, context, result, otherOptions}) => {
    if (type === 'GenericData') {

        const genericType = otherOptions.genericType || otherOptions.meta
        if (genericType) {

            const def = await getGenericTypeDefinitionWithStructure(db, {name: genericType})


            if (def && def.structure && def.structure.fields) {


                await postCheckResult(def, result, db, context, otherOptions)

            }


            if (otherOptions.returnMeta !== false) {
                result.meta = def
            }

            // remove definition on entries
            result.results.forEach(item => {
                delete item.definition
            })
        }
    }
})

Hook.on('typeBeforeUpdate', async ({type, data, _meta, db, context}) => {

    if (type === 'GenericData' && data.definition) {

        if (_meta) {

            const meta = JSON.parse(_meta)

            if (meta.partialUpdate) {
                // if object it is updated partially
                data.data = JSON.parse(data.data)

                //console.log(data)
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

                    if (field.defaultValue && data.data.constructor === Object) {
                        if (!data.data[field.name]) {
                            data.data[field.name] = field.defaultValue
                        }
                    }
                }

            }

            if (struct.extendFields) {
                Object.keys(struct.extendFields).forEach(key => {
                    const dvalue = struct.extendFields[key].defaultValue
                    if (dvalue && !data[key]) {

                        if( dvalue.constructor === Array){
                            data[key] = dvalue.map(f=>ObjectId(f))
                        }else {

                            data[key] = dvalue
                        }
                    }

                })
            }

        }


    }

})


// Hook when the type GenericDataDefinition has changed
Hook.on('typeUpdated_GenericDataDefinition', ({db, result}) => {
    Cache.clearStartWith('GenericDataDefinition')
})

// Clear cache when the type GenericData has changed
Hook.on(['typeUpdated_GenericData','typeCreated_GenericData'], async ({db, result}) => {
    if (result.definition && result.definition._id) {
        const def = await getGenericTypeDefinitionWithStructure(db, {id: result.definition._id})
        if (def) {
            Cache.clearStartWith(def.name)
        }
    }
})

Hook.on(['typeDeleted_GenericData'], async ({db, deletedDocuments}) => {
    for(const deltedDoc of deletedDocuments){
        if (deltedDoc.definition) {
            const def = await getGenericTypeDefinitionWithStructure(db, {id: deltedDoc.definition})
            if (def) {
                Cache.clearStartWith(def.name)
            }
        }
    }
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
        Object.keys(filters.parts).forEach(key => {
            if (key.indexOf('.') < 0 && key !== 'data' && key !== '_id' && key !== 'definition' && key !== 'createdBy' && key !== 'ownerGroup') {
                filters.parts['data.' + key] = filters.parts[key]
                delete filters.parts[key]
            }
        })
    }

})


Hook.on('ResolverBeforePublishSubscription', async ({context, payload, hookResponse}) => {

    //return payload.userId === context.id
    if (context.variables && context.variables.filter) {

        const filters = JSON.parse(context.variables.filter),
            action = payload.subscribeGenericData.action,
            datas = payload.subscribeGenericData.data,
            filter = filters[action]

        if (filter) {

            for (let i = 0; i < datas.length; i++) {
                const data = datas[i]
                //console.log(data, filter)
                if (matchExpr(filter, data)) {
                    console.log('abort publish')
                    hookResponse.abort = true
                    return
                }
            }
        }
        payload.subscribeGenericData.filter = filter
    }

})



