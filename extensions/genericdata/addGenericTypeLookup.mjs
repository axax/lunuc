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


function checkIfLookupIsNeededOrMapId(field,projection) {
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
            }else if(fieldNames.length === 1 && fieldNames[0] === '_id'){
                if(!field.metaFields){
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
    let {lookupIsNeeded} = checkIfLookupIsNeededOrMapId(field, projection)
    if (!lookupIsNeeded) {
        return
    }

    const typeDef = getType(field.type)
    if (typeDef) {
    }
    if (!otherOptions.lookups) {
        otherOptions.lookups = []
    }

    const id = getConditionalIdResolver(field.name)
    otherOptions.lookups.push({$addFields: {[`${field.name}ObjectId`]: id}})

    if (field.metaFields) {
        otherOptions.lookups.push({$addFields: {[`data.${field.name}_Original`]: `$data.${field.name}`}})
    }

    let $project
    if (field.projection) {
        $project = {}
        field.projection.forEach(key => {
            $project[key] = 1
        })
    }

    if (field.keepOrder /* field.multi  might be better */) {
        // keep order in array
        otherOptions.lookups.push(createLookupKeepSorting({name: field.name, type: field.type, $project}))
    } else {
        const pipeline = []
        if ($project) {
            pipeline.push({$project})
        }
        otherOptions.lookups.push({
            $lookup: {
                from: field.type,
                localField: `${field.name}ObjectId`,
                foreignField: '_id',
                as: `data.${field.name}`,
                pipeline,
            }
        })
    }

    if (field.metaFields) {
        otherOptions.lookups.push({
            $addFields: {
                [`data.${field.name}`]: {
                    $map: {
                        input: `$data.${field.name}`,
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
                                                    $and: [
                                                        {
                                                            $gt: [
                                                                '$$indexInArray',
                                                                -1
                                                            ]
                                                        },
                                                        {
                                                            $eq: [
                                                                {
                                                                    $type: {
                                                                        $arrayElemAt: [
                                                                            `$data.${field.name}_Original`,
                                                                            '$$indexInArray'
                                                                        ]
                                                                    }
                                                                },
                                                                'object'
                                                            ]
                                                        }
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
