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
import {getType} from "../../util/types.mjs";


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
                                    const idsStr = []
                                    if (ids.constructor === Array) {
                                        ids.forEach(id => {
                                            if (id) {
                                                if (id.constructor === Object) {
                                                    idsStr.push(id._id)
                                                } else {
                                                    idsStr.push(id)
                                                }
                                            }
                                        })
                                    } else {
                                        idsStr.push(ids)
                                    }
                                    console.log(`Resolve ids ${idsStr.join(',')}`)
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


function getConditionalIdResolver(key) {
    const id = {
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
    }
    return id;
}

function createLookupKeepSorting({name, as, type}) {
    return {
        $lookup: {
            from: type,
                let: {
                [`${name}ObjectId`]: {
                    $ifNull:
                        [
                            `$${name}ObjectId`,
                            [],
                            `$${name}ObjectId`
                        ]
                }
            },
            as: as || `data.${name}`,
                pipeline: [
                {
                    $match: {
                        $expr: {$in: ['$_id', `$$${name}ObjectId`]}
                    }
                },
                {
                    $addFields: {
                        sort: {
                            $indexOfArray: [`$$${name}ObjectId`, '$_id']
                        }
                    }
                },
                {$sort: {sort: 1}},
                {$addFields: {sort: '$$REMOVE'}}
            ],
        }
    }
}

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
                } else {

                    if (otherOptions.postLookup) {
                        /**
                         * @deprecated postLookup mode might be deprecated
                         */
                        if (!otherOptions.$addFields) {
                            otherOptions.$addFields = {}
                        }
                        if (!otherOptions.$addFields.tempProjection) {
                            otherOptions.$addFields.tempProjection = {}
                        }
                        otherOptions.$addFields.tempProjection[field.name] = currentProjection

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

        const id = getConditionalIdResolver(key)

        const subLookup = []
        if (otherOptions.lookupLevel > 1 || (otherOptions.lookupLevel === undefined && currentProjection && currentProjection.length > 0)) {

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

        let newLookup
        if (otherOptions.simpleLookup !== false && field.simpleLookup !== false) {
            otherOptions.lookups.push({
                $addFields: {
                    [`${key}ObjectId`]: id
                }
            })
            newLookup = {
                $lookup: {
                    from: 'GenericData',
                    localField: `${key}ObjectId`,
                    foreignField: '_id',
                    as: field.metaFields ? `lookupRelation${key}` : `data.${key}`,
                    pipeline: [],
                }
            }
        } else {

            /**
             * @deprecated lookup with $match might be deprecated
             */
            const $match = {
                $expr: {
                    $cond:
                        {
                            if: {$isArray: `$$id`},
                            then: {$in: ['$_id', '$$id']},
                            else: {$eq: ['$_id', '$$id']}
                        }
                }
            }
            newLookup = {
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

            let input
            //TODO make it optional
            if (true) {
                // filter references that doesn't exist
                input = {
                    $filter: {
                        input: `$data.${key}`,
                        as: 'relfiltered',
                        cond: {
                            $gt: [
                                {
                                    $indexOfArray: [
                                        `$lookupRelation${key}._id`,
                                        {
                                            $toObjectId: '$$relfiltered._id'
                                        }
                                    ]
                                },
                                -1
                            ]
                        }
                    }
                }
            } else {
                input = `$data.${key}`
            }


            // merge lookup result with original object which contains the metaValues
            otherOptions.lookups.push({
                $addFields: {
                    [`data.${key}`]: {
                        $map: {
                            input,
                            as: 'rel',
                            in: {
                                $let: {
                                    vars: {
                                        indexInArray: {
                                            $indexOfArray: [
                                                `$lookupRelation${key}._id`,
                                                {
                                                    $toObjectId: '$$rel._id'
                                                }
                                            ]
                                        }
                                    },
                                    in: {
                                        $mergeObjects: [
                                            {
                                                __typename: 'GenericData'
                                            },
                                            '$$rel',
                                            {
                                                data: {
                                                    $cond: {
                                                        if: {
                                                            $gt: [
                                                                '$$indexInArray',
                                                                -1
                                                            ]
                                                        },
                                                        then: {
                                                            $arrayElemAt: [
                                                                `$lookupRelation${key}.data`,
                                                                '$$indexInArray'
                                                            ]
                                                        },
                                                        else: { /* empty data */}
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            })
        }
    } else if (field.lookup && field.type) {
        const typeDef = getType(field.type)
        if (typeDef) {
        }
        if (!otherOptions.lookups) {
            otherOptions.lookups = []
        }

        const id = getConditionalIdResolver(field.name)
        otherOptions.lookups.push({$addFields: {[`${field.name}ObjectId`]: id}})

        if (field.metaFields) {
            otherOptions.lookups.push({ $addFields: {[`data.${field.name}_Original`]: `$data.${field.name}`}})
        }

        if (field.keepOrder /* field.multi  might be better */ ) {
            // keep order in array
            otherOptions.lookups.push(createLookupKeepSorting({name:field.name,type:field.type}))
        } else {
            otherOptions.lookups.push({
                $lookup: {
                    from: field.type,
                    localField: `${field.name}ObjectId`,
                    foreignField: '_id',
                    as: `data.${field.name}`,
                    pipeline: [],
                }
            })
        }

        if (field.metaFields) {
            otherOptions.lookups.push({
                $addFields: {
                    [`data.${field.name}`]: {
                        $map: {
                            input:`$data.${field.name}`,
                            as: 'rel',
                            in: {
                                $let: {
                                    vars: {
                                        indexInArray: {
                                            $indexOfArray: [
                                                `$${field.name}ObjectId`,
                                                '$$rel._id'
                                            ]
                                        }
                                    },
                                    in: {
                                        $mergeObjects: [
                                            '$$rel',
                                            {
                                                $cond: {
                                                    if: {
                                                        $gt: [
                                                            '$$indexInArray',
                                                            -1
                                                        ]
                                                    },
                                                    then: {
                                                        $arrayElemAt: [
                                                            `$data.${field.name}_Original`,
                                                            '$$indexInArray'
                                                        ]
                                                    },
                                                    else: { /* empty data */}
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            })

            otherOptions.lookups.push({
                $unset: `data.${field.name}_Original`
            })
        }

    }else if(field.uitype==='wrapper' && field.subFields){

        // wrapper element with lookup functionality
        //TODO: check if this part is working --> it is used in name=AudioforumBestellung
        let subFields
        if(field.subFields.constructor === Object){
            subFields = Object.values(field.subFields)
        }else{
            subFields = field.subFields
        }
        for(const subField of subFields){
            if(subField.lookup){

                otherOptions.lookups.push({$unwind : `$data.${field.name}` })
                const id = getConditionalIdResolver(`${field.name}.${subField.name}`)
                otherOptions.lookups.push({
                    $addFields: {
                        [`${field.name}${subField.name}ObjectId`]: id
                    }
                })
                // keep order in array
                otherOptions.lookups.push(createLookupKeepSorting({name:field.name+subField.name,as:`data.${field.name}.${subField.name}`,type:subField.type}))

                if(!otherOptions.group){
                    otherOptions.group = {}
                }

                const tmpGroupName = `tmp_${field.name}${subField.name}`
                otherOptions.group[tmpGroupName] = {
                    $push: `$data.${field.name}`
                }

                if(!otherOptions.beforeProject){
                    otherOptions.beforeProject = []
                }
                if(otherOptions.beforeProject.constructor !== Array){
                    otherOptions.beforeProject = [otherOptions.beforeProject]
                }
                otherOptions.beforeProject.push({
                    $unset: tmpGroupName
                })
                otherOptions.beforeProject.push({
                    $addFields: {
                        [`data.${field.name}`]: `$${tmpGroupName}`
                    }
                })

            }
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
                    let dataResolve, projectResult
                    if (result.tempProjection && result.tempProjection[field.name]) {
                        dataResolve = JSON.parse(JSON.stringify(result.tempProjection[field.name]))
                        projectResult = true
                    } else {
                        dataResolve = ['data']
                        projectResult = false
                    }

                    const itemResults = await GenericResolver.entities(db, context, 'GenericData', ['_id', {definition: ['_id']}, ...dataResolve],
                        {
                            filter: `_id==${tempItem[k]}`,
                            limit: 1,
                            includeCount: false,
                            match: {},
                            meta: field.genericType,
                            genericType: field.genericType,
                            postLookup: true,
                            postConvert: false,
                            projectResult,
                            lookupLevel: 0
                        })

                    itemCache[tempItem[k]] = itemResults.results.length > 0 ? itemResults.results[0] : null

                    if (itemCache[tempItem[k]]) {
                        newItems.push(itemCache[tempItem[k]])
                    }
                } else {
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

    delete result.tempProjection
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