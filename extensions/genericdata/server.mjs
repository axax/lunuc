import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import Cache from '../../util/cache.mjs'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import Util from '../../api/util/index.mjs'
import {ObjectId} from 'mongodb'
import {matchExpr, parseOrElse} from '../../client/util/json.mjs'
import {getGenericTypeDefinitionWithStructure} from './util/index.mjs'
import {addGenericTypeLookup, postLookupResult} from './addGenericTypeLookup.mjs'
import ClientUtil from '../../client/util/index.mjs'
import {resolveDynamicFieldQuery} from '../../api/resolver/generic/postQueryConverter.mjs'


const postCheckResult = async (def, result, db, context, otherOptions) => {
    for (let i = 0; i < def.structure.fields.length; i++) {
        const field = def.structure.fields[i]

        // post lookup
        if (field.genericType) {
            if (otherOptions.postLookup) {

                await postLookupResult(result, field, db, context)
            }
        }

        if (field.dynamic) {
            for (let j = 0; j < result.results.length; j++) {
                const item = result.results[j]
                if (item?.data) {

                    // make sure date is an Object not a serialized string Object
                    const wasObject = item.data.constructor === Object
                    item.data = wasObject ? item.data : parseOrElse(item.data, {})

                    if (field.dynamic.genericType) {
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

                        item.data[field.name] = subData.results
                    } else {
                        await resolveDynamicFieldQuery(db, field, item, item.data)
                    }
                    if (!wasObject) {
                        // make it a string again if it was a string initially
                        item.data = JSON.stringify(item.data)
                    }
                }
            }
        }
    }

    delete result.tempProjection
}

const fromAnyToIdStrings = (any) => {
    const ids = []

    if (!any) {
        return ids
    }

    const addId = (idStringOrObject) => {
        if (idStringOrObject) {
            if (idStringOrObject.constructor === Object) {
                if (idStringOrObject._id) {
                    ids.push(idStringOrObject._id.toString())
                }
            } else if (idStringOrObject.constructor === String) {
                const idTrimmed = idStringOrObject.trim()
                if (idTrimmed) {
                    ids.push(idTrimmed)
                }
            }
        }
    }

    if (any.constructor === Array) {
        any.forEach(addId)
    } else {
        addId(any)
    }

    return ids
}


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
                                const idsStr =fromAnyToIdStrings(jsonData[field.name])


                                if (idsStr.length>0) {
                                    console.log(`Resolve ids ${idsStr.join(',')} for ${def.name}.${field.name}`)

                                    const subData = await GenericResolver.entities(db, context, 'GenericData', ['_id', {definition: ['_id']}, 'data'],
                                        {
                                            filter: `_id==[${idsStr.join(',')}]`,
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


Hook.on('beforeTypeLoaded', async ({type, db, context, match, data, otherOptions}) => {


    if (type === 'GenericData') {

        // the generic type name can either be passed with the property genericType (when called from the server)
        // or with generic property meta (when called via graphql request)
        const genericType = otherOptions.genericType || otherOptions.meta

        if (genericType) {
            const def = await getGenericTypeDefinitionWithStructure(db, {name: genericType})
            if (def && def.structure) {
                const struct = def.structure

                if (struct.access && struct.access.read && !otherOptions.skipGenericTypeAccessFilter) {
                    const accessMatch = await Util.getAccessFilter(db, context, struct.access.read)
                    if (accessMatch.createdBy) {
                        match.createdBy = accessMatch.createdBy
                    } else if (struct.access.read.force) {

                        delete match.createdBy
                    }

                }

                match.definition = {$eq: new ObjectId(def._id)}
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
            if (otherOptions.removeDefinition !== false) {
                result.results.forEach(item => {
                    delete item.definition
                })
            }
        }
    }
})

Hook.on('typeBeforeUpdate', async ({type, data, params, _meta, db, context}) => {

    if (type === 'GenericData' && data.definition) {


        const def = await getGenericTypeDefinitionWithStructure(db, {id: data.definition})

        if (def && def.structure) {
            const accessMatch = await Util.getAccessFilter(db, context, def.structure?.access?.update)
            if (accessMatch) {
                if (accessMatch.createdBy) {
                    params.createdBy = accessMatch.createdBy
                } else if (def?.structure?.access?.update?.force) {
                    delete params.createdBy
                }
            }
        }

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

                        const last = await db.collection('GenericData').find({definition: new ObjectId(data.definition)}).sort({_id: -1}).limit(1).toArray()
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
                        } else {
                            data.data[field.name] = 1
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

                        if (dvalue.constructor === Array) {
                            data[key] = dvalue.map(f => new ObjectId(f))
                        } else {

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
Hook.on(['typeUpdated_GenericData', 'typeCreated_GenericData'], async ({db, result}) => {
    if (result.definition && result.definition._id) {
        const def = await getGenericTypeDefinitionWithStructure(db, {id: result.definition._id})
        if (def) {
            Cache.clearStartWith(def.name)
        }
    }
})

Hook.on(['typeDeleted_GenericData'], async ({db, deletedDocuments}) => {
    for (const deltedDoc of deletedDocuments) {
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


Hook.on(['ExtensionHistoryBeforeCreate'], async ({historyEntry}) => {
    if (historyEntry.type === 'GenericData') {
        try {
            historyEntry.data = Object.assign({}, historyEntry.data, {data: JSON.parse(historyEntry.data.data)})
        } catch (e) {
        }
    }
})

Hook.on(['ExtensionHistoryBeforeDelete'], async ({db, historyEntry}) => {
    if (historyEntry.type === 'GenericData' && historyEntry.data.definition) {
        const def = await getGenericTypeDefinitionWithStructure(db, {id: historyEntry.data.definition})
        if (def && def?.structure?.title) {
            historyEntry.meta.name = def.structure.title
        }
    }
})

Hook.on('SystemBeforeCollectionImport', async ({set, match, collection, meta, db, context}) => {

    if (collection === 'GenericData' && meta) {

        const def = await getGenericTypeDefinitionWithStructure(db, {name: meta})
        if (def && def?.structure?.title) {
            set.definition = def._id
        }
    }
})