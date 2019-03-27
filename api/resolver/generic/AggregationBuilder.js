import ClientUtil from 'client/util'
import {getFormFields, getType} from 'util/types'
import {ObjectId} from 'mongodb'


export default class AggregationBuilder {

    constructor(type, fields, options) {
        this.type = type
        this.fields = fields
        this.options = options
    }

    getLimit() {
        let {limit} = this.options
        return limit ? limit : 10
    }

    getOffset() {
        let {offset, page} = this.options

        if (!offset) {

            if (page) {
                return (page - 1) * this.getLimit()
            } else {
                return 0
            }
        }

        return offset
    }

    getPage() {
        let {page} = this.options

        if (!page) {
            return 1
        }

        return page
    }

    getSort() {
        let {sort} = this.options
        if (!sort) {
            return {_id: -1}
        } else {
            if (sort.constructor === String) {
                // sort looks like "field1 asc, field2 desc"
                return sort.split(',').reduce((acc, val) => {
                    const a = val.split(' ')
                    return {...acc, [a[0]]: (a.length > 1 && a[1].toLowerCase() == "desc" ? -1 : 1)}
                }, {})
            }
        }
        return sort
    }


    // Mongodb joins
    createAndAddLookup({type, fieldName, multi, lookups, usePipeline}) {


        let lookup

        /* with pipeline */
        if (usePipeline) {

            let $expr = {}
            if (multi) {
                $expr.$in = ['$_id',
                    {
                        $cond: {
                            if: {$isArray: '$$' + fieldName},
                            then: '$$' + fieldName,
                            else: ['$$' + fieldName]
                        }
                    }]
            } else {
                $expr.$eq = ['$_id', '$$' + fieldName]
            }


            lookup = {
                $lookup: {
                    from: type,
                    as: fieldName,
                    let: {
                        [fieldName]: '$' + fieldName
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr
                            }
                        }
                    ]
                }
            }

            /* Map localized fields to current language */
            const typeData = getType(type)

            if (typeData && typeData.fields) {

                const {lang} = this.options
                const $group = {_id: '$_id'}

                for (const field of typeData.fields) {
                    if (field.localized) {
                        $group[field.name] = {$first: '$' + field.name + '_localized.' + lang}
                    } else {
                        $group[field.name] = {$first: '$' + field.name}
                    }
                }
                lookup.$lookup.pipeline.push({
                    $group
                })
            }

        } else {

            // without pipeline
            lookup = {
                $lookup: {
                    from: type,
                    localField: fieldName,
                    foreignField: '_id',
                    as: fieldName
                }
            }
        }

        lookups.push(lookup)
        return {lookup}
    }

    createGroup(fieldName, multi) {
        return {'$first': multi ? '$' + fieldName : {$arrayElemAt: ['$' + fieldName, 0]}}
    }


    getParsedFilter() {
        if (!this._parsedFilter) {
            const {filter} = this.options
            if (filter) {
                this._parsedFilter = ClientUtil.parseFilter(filter)
            }
        }
        return this._parsedFilter
    }

    // filter where clause
    createAndAddFilterToMatch({fieldName, reference, localized, match}) {
        const parsedFilter = this.getParsedFilter()
        if (parsedFilter) {
            const {lang} = this.options
            const filterPart = parsedFilter.parts[fieldName]
            const filterKey = fieldName + (localized ? '_localized.' + lang : '')

            if (filterPart) {

                if (reference) {
                    if (filterPart.value) {
                        if (ObjectId.isValid(filterPart.value)) {
                            // match by id
                            this.addFilterToMatch({
                                filterKey,
                                filterValue: ObjectId(filterPart.value),
                                filterOptions: filterPart,
                                match
                            })
                        }

                    }
                } else {
                    if (filterPart.constructor === Array) {
                        filterPart.forEach(e => {
                            this.addFilterToMatch({
                                filterKey,
                                filterValue: {'$regex': e.value, '$options': 'i'},
                                filterOptions: e,
                                match
                            })
                        })
                    } else {
                        this.addFilterToMatch({
                            filterKey,
                            filterValue: {
                                '$regex': filterPart.value,
                                '$options': 'i'
                            }, filterOptions: filterPart, match
                        })
                    }
                }
            }


            if (!reference) {
                parsedFilter.rest.forEach(e => {
                    this.addFilterToMatch({
                        filterKey,
                        filterValue: {'$regex': e.value, '$options': 'i'},
                        filterOptions: e,
                        match
                    })
                })
            }
        }
    }


    addFilterToMatch({filterKey, filterValue, filterOptions, match}) {
        if (!filterOptions || filterOptions.operator === 'or') {
            if (!match.$or) {
                match.$or = []
            }
            match.$or.push({[filterKey]: filterValue})
        } else {
            match[filterKey] = filterValue
        }
    }

    query() {
        const typeDefinition = getType(this.type) || {}

        const {projectResult, lang} = this.options

        // limit and offset
        const limit = this.getLimit(),
            offset = this.getOffset(),
            page = this.getPage(),
            sort = this.getSort(),
            typeFields = getFormFields(this.type),
            parsedFilter = this.getParsedFilter()

        let rootMatch = Object.assign({}, this.options.match),
            match = {},
            groups = {},
            lookups = [],
            projectResultData = {},
            hasMatchInReference = false


        // if there is filter like _id=12323213
        if (parsedFilter && parsedFilter.parts._id) {
            // if there is a filter on _id
            // handle it here
            this.addFilterToMatch({
                filterKey: '_id',
                filterValue: ObjectId(parsedFilter.parts._id.value),
                filterOptions: parsedFilter.parts._id,
                rootMatch
            })
        }


        this.fields.forEach((field, i) => {
            if (field.constructor === Object) {
                // if a value is in this format {'categories':['name']}
                // we expect that the field categories is a reference to another type
                // so we create a lookup for this type

                const fieldNames = Object.keys(field)
                if (fieldNames.length > 0) {

                    // there should be only one attribute
                    const fieldName = fieldNames[0]

                    //check if this field is a reference
                    if (typeFields && typeFields[fieldName]) {
                        const typeField = typeFields[fieldName]

                        // get fields of the referenced type
                        const lookupFields = getFormFields(typeField.type)

                        // projection
                        let projectPipeline = {},
                            hasLocalized = false


                        field[fieldName].forEach(item => {
                            projectResultData[fieldName + '.' + item] = 1
                            if (lookupFields[item] && lookupFields[item].localized) {
                                hasLocalized = true
                                projectPipeline[item + '_localized.' + lang] = 1

                                // project localized field in current language
                                projectPipeline[item] = '$' + item + '_localized.' + lang
                                //projectResultData[key + '.' + item + '_localized.' + lang] = 1
                            } else {
                                projectPipeline[item] = 1
                            }

                            if (fieldName !== '_id') {
                                hasMatchInReference = true
                                this.createAndAddFilterToMatch({
                                    fieldName: fieldName + '.' + item,
                                    reference: false,
                                    localized: false,
                                    match
                                })
                            }
                        })

                        // create lookup and group value for pipeline
                        const {lookup} = this.createAndAddLookup({
                            type: typeField.type,
                            fieldName,
                            multi: typeField.multi,
                            lookups,
                            usePipeline: hasLocalized
                        })


                        if (lookup.$lookup.pipeline) {
                            lookup.$lookup.pipeline.push({$project: projectPipeline})
                        }

                        // add group
                        groups[fieldName] = this.createGroup(fieldName, typeField.multi)

                        this.createAndAddFilterToMatch({
                            fieldName,
                            reference: true,
                            localized: false,
                            match: rootMatch
                        })

                    }

                }

            } else if (field.indexOf('$') > 0) {
                // this is a reference
                // for instance image$Media --> field image is a reference to the type Media
                const part = field.split('$')
                const fieldName = part[0]
                let type = part[1], multi = false
                if (type.startsWith('[')) {
                    multi = true
                    type = type.substring(1, type.length - 1)
                }


                const refTypeDefinition = getType(type) || {}

                if (refTypeDefinition.fields) {
                    for (const refField of refTypeDefinition.fields) {
                        if (!refField.reference) {
                            hasMatchInReference = true
                            this.createAndAddFilterToMatch({
                                fieldName: fieldName + '.' + refField.name,
                                reference: false,
                                localized: false,
                                match
                            })
                        }
                    }
                }


                if (multi) {
                    // if multi it has to be an array
                    // this is an anditional filter to remove non array values. it is not needed if database is consistent
                    // without this filter you might get the error: $in requires an array as a second argument
                    /*this.addFilterToMatch({
                     filterKey:fieldName+'.0',
                     filterValue: { '$exists': true },
                     match: rootMatch
                     })*/
                }
                this.createAndAddLookup({type, fieldName, multi, lookups, usePipeline: true})


                groups[fieldName] = this.createGroup(fieldName, multi)
                this.createAndAddFilterToMatch({fieldName, reference: true, localized: false, match: rootMatch})
                projectResultData[fieldName] = 1

            } else {
                // regular field
                if (field !== '_id') {
                    if (typeFields && typeFields[field] && typeFields[field].localized) {
                        groups[field] = {'$first': '$' + field + '_localized.' + lang}
                        this.createAndAddFilterToMatch({
                            fieldName: field,
                            reference: false,
                            localized: true,
                            match
                        })
                    } else {
                        groups[field] = {'$first': '$' + field}
                        this.createAndAddFilterToMatch({
                            fieldName: field,
                            reference: false,
                            localized: false,
                            match
                        })
                    }
                }
                projectResultData[field] = 1

            }
        })

        if (!projectResult) {
            // also return extra fields
            if (!typeDefinition.noUserRelation) {

                this.createAndAddLookup({type: 'User', fieldName: 'createdBy', multi: false, lookups})
                groups.createdBy = this.createGroup('createdBy', false)
            }
            groups.modifiedAt = {'$first': '$modifiedAt'}
        }


        // compose result
        let result = []

        const hasMatch = Object.keys(match).length > 0
        let canUseLimitSkip = !hasMatch

        if (Object.keys(rootMatch).length > 0) {
            if (!hasMatchInReference) {
                result.push({
                    $match: {...rootMatch, ...match}
                })
            } else {
                result.push({
                    $match: rootMatch
                })
            }
        } else if (hasMatch && !hasMatchInReference) {
            result.push({
                $match: match
            })
        }

        if (canUseLimitSkip) {
            result.push({$skip: offset})
            result.push({$limit: limit})
        }

        if (lookups.length > 0) {
            for (const lookup of lookups) {
                result.push(lookup)
            }
        }

        // Group back to arrays
        result.push(
            {
                $group: {
                    _id: '$_id',
                    ...groups
                }
            })

        // second match
        if (hasMatch && hasMatchInReference) {
            result.push({
                $match: match
            })
        }

        // add sort
        result.push({$sort: sort})

        // project
        if (projectResult) {
            // also remove id if it is not explicitly set
            if (!projectResultData._id) {
                projectResultData._id = 0
            }
            result.push({$project: projectResultData})
        }

        //pagination
        //TODO maybe it is better to use facet for pagination
        result.push({
            $group: {
                _id: null,
                // get a count of every result that matches until now
                total: {$sum: 1},
                // keep our results for the next operation
                results: {$push: '$$ROOT'}
            }
        })

        // and finally trim the results to within the range given by start/endRow
        if (!canUseLimitSkip) {
            result.push({
                $project: {
                    total: 1,
                    results: {$slice: ['$results', offset, limit]}
                }
            })
        }

        // return offset and limit
        result.push({
            $addFields: {limit, offset, page}
        })


        if (canUseLimitSkip) {
            //wrap in a facet
            result = [
                {
                    $facet: {
                        totalCount: [
                            {$count: "value"}
                        ],
                        pipelineResults: result
                    }
                },
                {
                    $unwind: "$pipelineResults"
                },
                {
                    $unwind: "$totalCount"
                },
                {
                    $replaceRoot: {
                        newRoot: {
                            $mergeObjects: ["$pipelineResults", {total: "$totalCount.value"}]
                        }
                    }
                }
            ]
        }


        return result

    }

}
