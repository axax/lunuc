import {getType} from '../../util/types.mjs'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import {findProjection} from '../../util/project.mjs'
import {getGenericTypeDefinitionWithStructure} from './util/index.mjs'


export async function addGenericTypeLookup(field, otherOptions, projection, db, key) {

    if (field.genericType) {
        await addGenericTypeLookupForGenericType(field, otherOptions, projection, db, key)

    } else if (field.lookup && field.type) {
        addGenericTypeLookupForType(field, otherOptions, projection)

    } else if (field.uitype === 'wrapper' && field.subFields) {
        addGenericTypeLookupForWrapperFields(field, otherOptions, projection)
    }
}


function checkIfLookupIsNeededOrMapId(field, projection) {
    const dataProjection = findProjection('data', projection)
    let fieldProjection, lookupIsNeeded = true
    if (Array.isArray(dataProjection.data)) {
        fieldProjection = dataProjection
        const projectionResult = findProjection(field.name, dataProjection.data)
        if (Array.isArray(projectionResult.data)) {
            const fieldNames = projectionResult.data.filter(f => f.constructor === Object ? Object.keys(f)[0] : f)
            if (fieldNames.length === 0) {
                // lookup is not needed because there are no fields
                lookupIsNeeded = false
            } else if (fieldNames.length === 1 && fieldNames[0] === '_id') {
                if (!field.metaFields) {
                    // lookup is not needed because there is only _id to project
                    // $map to property _id instead of lookup
                    dataProjection.data[projectionResult.index][field.name] = {
                        $map: {
                            input: '$data.' + field.name,  // the original array
                            as: 'p',                 // name of each array element
                            in: {_id: '$$p'}       // wrap it in {_id: value}
                        }
                    }
                }
                lookupIsNeeded = false
            } else {
                fieldProjection = projectionResult
            }
        } else {
            //console.log(`lookup for ${field.name} not needed`)
            lookupIsNeeded = false
        }
    } else {
        // resolve everything if no data projection is set
        fieldProjection = {}
    }
    return {lookupIsNeeded, fieldProjection}
}


function addGenericTypeLookupForWrapperFields(field, otherOptions, projection) {

    //check if lookup is needed at all
    let {lookupIsNeeded} = checkIfLookupIsNeededOrMapId(field, projection)
    if (!lookupIsNeeded) {
        return
    }

    // wrapper element with lookup functionality
    //TODO: check if this part is working --> it is used in name=AudioforumBestellung
    let subFields
    if (field.subFields.constructor === Object) {
        subFields = Object.values(field.subFields)
    } else {
        subFields = field.subFields
    }
    for (const subField of subFields) {
        if (subField.lookup) {

            otherOptions.lookups.push({$unwind: `$data.${field.name}`})
            const id = getConditionalIdResolver(`${field.name}.${subField.name}`)
            otherOptions.lookups.push({
                $addFields: {
                    [`${field.name}${subField.name}ObjectId`]: id
                }
            })
            // keep order in array
            otherOptions.lookups.push(createLookupKeepSorting({
                name: field.name + subField.name,
                as: `data.${field.name}.${subField.name}`,
                type: subField.type
            }))

            if (!otherOptions.group) {
                otherOptions.group = {}
            }

            const tmpGroupName = `tmp_${field.name}${subField.name}`
            otherOptions.group[tmpGroupName] = {
                $push: `$data.${field.name}`
            }

            if (!otherOptions.beforeProject) {
                otherOptions.beforeProject = []
            }
            if (otherOptions.beforeProject.constructor !== Array) {
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

function addGenericTypeLookupForType(field, otherOptions, projection) {

    //check if lookup is needed at all
    let {lookupIsNeeded, fieldProjection} = checkIfLookupIsNeededOrMapId(field, projection)
    if (!lookupIsNeeded) {
        return
    }

    if (!otherOptions.lookups) {
        otherOptions.lookups = []
    }

    // normalize any expression to an array: [] for null/missing, wrap a scalar in a single-element array
    const ensureArray = (expr) => ({
        $cond: [
            {$isArray: expr}, expr,
            {$cond: [{$in: [{$type: expr}, ['missing', 'null']]}, [], [expr]]}
        ]
    })

    otherOptions.lookups.push({$addFields: {[`${field.name}ObjectId`]: getConditionalIdResolver(field.name)}})

    if (field.metaFields) {
        otherOptions.lookups.push({$addFields: {[`data.${field.name}_Original`]: `$data.${field.name}`}})
    }

    const pipeline = []
    const $projectParent = {}
    if (field.projection) {
        field.projection.forEach(key => $projectParent[key] = 1)
    }

    // resolve nested references (e.g. User.group -> UserGroup) driven by the requested projection.
    // may add reference fields to $projectParent so the raw ids survive the parent $project.
    const nestedStages = buildNestedLookupStages(field.type, fieldProjection && fieldProjection.data, $projectParent)

    if (field.projection) {
        pipeline.push({$project: $projectParent})
    }
    pipeline.push(...nestedStages)

    // single $lookup for all cases — order & duplicates are restored afterwards, so no keepOrder sorting needed
    otherOptions.lookups.push({
        $lookup: {
            from: field.type,
            localField: `${field.name}ObjectId`,
            foreignField: '_id',
            as: `data.${field.name}`,
            pipeline,
        }
    })

    // A $lookup join is deduplicated by _id and has no guaranteed order. Rebuild the array
    // positionally from the (order- and duplicate-preserving) id list and join each position
    // back against the lookup result. Unresolved references are dropped (null filtered out).
    const oidArray = ensureArray(`$${field.name}ObjectId`)

    const resolve = {
        $arrayElemAt: [
            {$filter: {input: `$data.${field.name}`, cond: {$eq: ['$$this._id', {$arrayElemAt: [oidArray, '$$i']}]}}},
            0
        ]
    }

    otherOptions.lookups.push({
        $addFields: {
            [`data.${field.name}`]: {
                $filter: {
                    input: {
                        $map: {
                            input: {$range: [0, {$size: oidArray}]},
                            as: 'i',
                            in: field.metaFields
                                ? {
                                    $let: {
                                        vars: {
                                            rel: resolve,
                                            orig: {$arrayElemAt: [ensureArray(`$data.${field.name}_Original`), '$$i']}
                                        },
                                        in: {
                                            $cond: [
                                                {$eq: ['$$rel', null]},
                                                null,
                                                {
                                                    $mergeObjects: [
                                                        '$$rel',
                                                        {$cond: [{$eq: [{$type: '$$orig'}, 'object']}, '$$orig', {}]}
                                                    ]
                                                }
                                            ]
                                        }
                                    }
                                }
                                : resolve
                        }
                    },
                    cond: {$ne: ['$$this', null]}
                }
            }
        }
    })

    if (field.metaFields) {
        otherOptions.lookups.push({$unset: `data.${field.name}_Original`})
    }
}

async function addGenericTypeLookupForGenericType(field, otherOptions, projection, db, key) {
    //check if lookup is needed at all
    let {lookupIsNeeded, fieldProjection} = checkIfLookupIsNeededOrMapId(field, projection)

    if (!lookupIsNeeded) {
        return
    }

    if (fieldProjection.data && otherOptions.postLookup) {
        /**
         * @deprecated postLookup mode might be deprecated
         */
        if (!otherOptions.$addFields) {
            otherOptions.$addFields = {}
        }
        if (!otherOptions.$addFields.tempProjection) {
            otherOptions.$addFields.tempProjection = {}
        }
        otherOptions.$addFields.tempProjection[field.name] = fieldProjection.data
        const dataProjection = findProjection('data', projection)
        dataProjection.data.splice(fieldProjection.index, 1)
        dataProjection.data.push(field.name)
        return
    }

    if (!fieldProjection.data && field.vagueLookup === false && (!otherOptions.filter || otherOptions.filter.indexOf('_id=') !== 0)) {
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
    if (otherOptions.lookupLevel > 1 || (otherOptions.lookupLevel === undefined && fieldProjection?.data?.length > 0)) {

        const def = await getGenericTypeDefinitionWithStructure(db, {name: field.genericType})
        if (def && def?.structure?.fields) {

            for (const subField of def.structure.fields) {
                if (subField.genericType) {
                    await addGenericTypeLookup(subField, {
                        lookups: subLookup,
                        lookupLevel: otherOptions.lookupLevel - 1
                    }, fieldProjection.data, db)
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


    const $project = {
        __typename: 'GenericData',
        _id: 1
    }

    if (field.projection) {

        field.projection.forEach(key => {
            $project[`data.${key}`] = 1
        })
    } else {
        $project.data = 1
    }


    newLookup.$lookup.pipeline.push({
        $project
    })


    otherOptions.lookups.push(newLookup)
    lookupMetaFields(field, key, otherOptions)
}


// -----------------------------------------------------------------------------
// Nested reference resolution
// -----------------------------------------------------------------------------

/**
 * Builds nested $lookup stages for reference sub-fields of `parentType`, driven by the
 * requested projection. The stages are meant to run INSIDE the parent lookup pipeline,
 * where the current document is the parent entity itself — therefore paths have no
 * `data.` prefix. Recurses for deeper references (e.g. User.junior -> User.group).
 *
 * `parentProject` (the parent $project object) is mutated so the raw reference ids
 * survive a restrictive parent projection.
 *
 * @param parentType     type name whose reference sub-fields should be resolved (e.g. 'User')
 * @param projectionData requested projection array for the parent (e.g. ['name', {group:[...]}])
 * @param parentProject  parent $project object (mutated to keep reference ids)
 * @param depth          recursion guard
 */
function buildNestedLookupStages(parentType, projectionData, parentProject, depth = 0) {
    const stages = []
    if (!Array.isArray(projectionData) || !parentType || depth > 4) {
        return stages
    }
    const typeDef = getType(parentType)
    if (!typeDef) {
        return stages
    }

    const ensureArray = (expr) => ({
        $cond: [
            {$isArray: expr}, expr,
            {$cond: [{$in: [{$type: expr}, ['missing', 'null']]}, [], [expr]]}
        ]
    })

    for (const entry of projectionData) {
        if (!entry || entry.constructor !== Object) continue
        const nestedName = Object.keys(entry)[0]
        const nestedProjection = entry[nestedName]
        const subDef = getFieldDefFromType(typeDef, nestedName)

        // only resolve fields that are references to another type
        if (!subDef || !subDef.type || !subDef.reference) continue

        // make sure the raw reference survives a restrictive parent $project
        if (parentProject && Object.keys(parentProject).length > 0) {
            parentProject[nestedName] = 1
        }

        const oidField = `${nestedName}ObjectId`
        stages.push({$addFields: {[oidField]: getConditionalIdResolverPath(nestedName)}})

        const $project = buildProjectionFromArray(nestedProjection, subDef.type)
        $project._id = 1
        const nestedPipeline = [{$project}]

        // recurse for references inside the nested type
        nestedPipeline.push(...buildNestedLookupStages(subDef.type, nestedProjection, $project, depth + 1))

        stages.push({
            $lookup: {
                from: subDef.type,
                localField: oidField,
                foreignField: '_id',
                as: nestedName,
                pipeline: nestedPipeline
            }
        })

        // restore order + duplicates, drop unresolved refs
        const oidArray = ensureArray(`$${oidField}`)
        const rebuilt = {
            $filter: {
                input: {
                    $map: {
                        input: {$range: [0, {$size: oidArray}]},
                        as: 'i',
                        in: {
                            $arrayElemAt: [
                                {$filter: {input: `$${nestedName}`, cond: {$eq: ['$$this._id', {$arrayElemAt: [oidArray, '$$i']}]}}},
                                0
                            ]
                        }
                    }
                },
                cond: {$ne: ['$$this', null]}
            }
        }

        stages.push({
            $addFields: {
                // multi -> keep array; scalar reference -> unwrap to a single object (or null)
                [nestedName]: subDef.multi
                    ? rebuilt
                    : {$arrayElemAt: [rebuilt, 0]}
            }
        })
        stages.push({$unset: oidField})
    }
    return stages
}

/**
 * Converts a projection array (["name", {meta:["mobile","street"]}]) into a $project object
 * ({name:1, "meta.mobile":1, ...}). Reference sub-fields are kept whole (raw ids) so a nested
 * lookup can resolve them; plain embedded objects are flattened into dotted paths.
 */
function buildProjectionFromArray(projArr, typeName, prefix = '') {
    const $project = {}
    if (!Array.isArray(projArr)) return $project
    const typeDef = typeName ? getType(typeName) : null
    for (const p of projArr) {
        if (typeof p === 'string') {
            $project[prefix + p] = 1
        } else if (p && p.constructor === Object) {
            const k = Object.keys(p)[0]
            const def = typeDef ? getFieldDefFromType(typeDef, k) : null
            if (def && def.type && def.reference) {
                // reference field: keep raw ids for a nested lookup
                $project[prefix + k] = 1
            } else {
                // plain embedded object (e.g. type:'Object' json field): flatten into dotted paths
                Object.assign($project, buildProjectionFromArray(p[k], null, prefix + k + '.'))
            }
        }
    }
    return $project
}

function getFieldDefFromType(typeDef, name) {
    const fields = typeDef && typeDef.fields
    if (Array.isArray(fields)) return fields.find(f => f && f.name === name)
    if (fields && fields.constructor === Object) return fields[name]
    return null
}


function getConditionalIdResolverPath(path) {
    return {
        $cond:
            {
                if: {$isArray: `$${path}`},
                then: {
                    $map: {
                        input: `$${path}`, in: {
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
                        input: `$${path}`, to: 'objectId', onError: {
                            $convert: {input: `$${path}._id`, to: 'objectId'}
                        }
                    }
                }
            }
    }
}

function getConditionalIdResolver(key) {
    return getConditionalIdResolverPath(`data.${key}`)
}

function createLookupKeepSorting({name, as, type, $project}) {
    const pipeline = [
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
    ]
    if ($project) {
        pipeline.push({$project})
    }
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
            pipeline
        }
    }
}

function lookupMetaFields(field, key, otherOptions) {
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
}


export async function postLookupResult(result, field, db, context) {
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