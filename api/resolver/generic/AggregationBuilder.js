import ClientUtil from 'client/util'
import {getFormFields, getType} from 'util/types'
import {ObjectId} from 'mongodb'
import config from 'gen/config'


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


    getParsedFilter() {
        if (!this._parsedFilter) {
            const {filter} = this.options
            if (filter) {
                this._parsedFilter = ClientUtil.parseFilter(filter)
            }
        }
        return this._parsedFilter
    }


    // Mongodb joins
    createAndAddLookup({type, name, multi}, lookups, {usePipeline}) {


        let lookup

        /* with pipeline */
        if (usePipeline) {

            let $expr = {}
            if (multi) {
                $expr.$in = ['$_id',
                    {
                        $cond: {
                            if: {$isArray: '$$' + name},
                            then: '$$' + name,
                            else: ['$$' + name]
                        }
                    }]
            } else {
                $expr.$eq = ['$_id', '$$' + name]
            }


            lookup = {
                $lookup: {
                    from: type,
                    as: name,
                    let: {
                        [name]: '$' + name
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
        } else {

            // without pipeline
            lookup = {
                $lookup: {
                    from: type,
                    localField: name,
                    foreignField: '_id',
                    as: name
                }
            }
        }

        lookups.push(lookup)
        return {lookup}
    }

    createGroup({name, multi}) {
        return {'$first': multi ? '$' + name : {$arrayElemAt: ['$' + name, 0]}}
    }


    // filter where clause
    createAndAddFilterToMatch({name, reference, type, multi, localized}, match, {exact}) {
        let hasMatch = false
        if (localized) {
            config.LANGUAGES.forEach(lang => {
                if (this.createAndAddFilterToMatch({name: name + '.' + lang, reference}, match, {})) {
                    hasMatch = true
                }
            })
            return hasMatch
        }

        const parsedFilter = this.getParsedFilter()

        if (parsedFilter) {
            let filterPart = parsedFilter.parts[name]

            if (!filterPart && !exact) {
                filterPart = parsedFilter.parts[name.split('.')[0]]
            }

            // explicit search for this field
            if (filterPart) {
                if (reference) {
                    if (filterPart.value) {
                        if (ObjectId.isValid(filterPart.value)) {
                            // match by id
                            hasMatch = true
                            this.addFilterToMatch({
                                filterKey: name,
                                filterValue: ObjectId(filterPart.value),
                                filterOptions: filterPart,
                                type: 'ID',
                                multi,
                                match
                            })
                        } else {
                            this.searchHint = 'it has to be a valid id'
                        }

                    }
                } else {
                    if (filterPart.constructor === Array) {
                        filterPart.forEach(e => {
                            hasMatch = true
                            this.addFilterToMatch({
                                filterKey: name,
                                filterValue: e.value,
                                filterOptions: e,
                                type,
                                multi,
                                match
                            })
                        })
                    } else {
                        hasMatch = true
                        this.addFilterToMatch({
                            filterKey: name,
                            filterValue: filterPart.value,
                            filterOptions: filterPart,
                            type,
                            multi,
                            match
                        })
                    }
                }
            }


            if (!exact && !reference && ['Boolean'].indexOf(type) < 0) {
                parsedFilter.rest.forEach(e => {
                    hasMatch = true
                    this.addFilterToMatch({
                        filterKey: name,
                        filterValue: e.value,
                        filterOptions: e,
                        type,
                        multi,
                        match
                    })
                })
            }
        }
        return hasMatch
    }


    addFilterToMatch({filterKey, filterValue, type, multi, filterOptions, match}) {

        let comparator = '$regex' // default comparator
        const comparatorMap = {
            ':': '$regex',
            '=': '$regex',
            '==': '$eq',
            '>': '$gt',
            '>=': '$gte',
            '<': '$lt',
            '>=': '$lte',
            '!=': '$ne'
        }
        if (filterOptions && filterOptions.comparator && comparatorMap[filterOptions.comparator]) {
            comparator = comparatorMap[filterOptions.comparator]
        }

        if (type && ['Boolean', 'ID'].indexOf(type) >= 0 && comparator === '$regex') {
            comparator = '$eq'
        }

        if (comparator === '$eq' && multi) {
            comparator = '$in'
            filterValue = [filterValue]
        }

        let matchExpression

        if (['$gt', '$gte', '$lt', '$lte'].indexOf(comparator) >= 0) {
            matchExpression = {[comparator]: parseFloat(filterValue)}
        } else {
            matchExpression = {[comparator]: filterValue}
        }


        if (comparator === '$regex') {
            matchExpression.$options = 'i'
        }


        if (!filterOptions || filterOptions.operator === 'or') {
            if (!match.$or) {
                match.$or = []
            }
            match.$or.push({[filterKey]: matchExpression})
        } else {
            match[filterKey] = matchExpression
        }
    }


    getFieldDefinition(fieldData, type) {
        const typeFields = getFormFields(type)

        let fieldDefinition = {}

        if (fieldData.constructor === Object) {
            // if a value is in this format {'categories':['name']}
            // we expect that the field categories is a reference to another type
            // so we create a lookup for this type
            const fieldNames = Object.keys(fieldData)
            if (fieldNames.length > 0) {

                // there should be only one attribute
                fieldDefinition.name = fieldNames[0]

                fieldDefinition.fields = fieldData[fieldDefinition.name]
            }

        } else if (fieldData.indexOf('$') > 0) {
            // this is a reference
            // for instance image$Media --> field image is a reference to the type Media
            const part = fieldData.split('$')
            fieldDefinition.name = part[0]
            if (part[1].startsWith('[')) {
                fieldDefinition.multi = true
                fieldDefinition.type = part[1].substring(1, part[1].length - 1)
            } else {
                fieldDefinition.multi = false
                fieldDefinition.type = part[1]
            }
        } else {
            if( fieldData.endsWith('.localized')) {
                fieldDefinition.projectLocal = true
                fieldDefinition.name = fieldData.split('.')[0]
            }else{
                fieldDefinition.name = fieldData
            }
        }

        // extend it with default definition
        if (typeFields[fieldDefinition.name]) {
            fieldDefinition = {...typeFields[fieldDefinition.name], ...fieldDefinition}
        }
        return fieldDefinition

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
                type: 'ID',
                match: rootMatch
            })
        }

        this.fields.forEach((field, i) => {
            const fieldDefinition = this.getFieldDefinition(field, this.type)
            const fieldName = fieldDefinition.name
            if (fieldDefinition.reference) {

                // search in a ref field
                // poor performance
                let refFields = fieldDefinition.fields, projectPipeline = {}, usePipeline = false


                if (!refFields) {
                    projectResultData[fieldName] = 1
                    const refFieldDefinitions = getFormFields(fieldDefinition.type)
                    refFields = Object.keys(refFieldDefinitions)
                }

                if (refFields) {

                    for (const refField of refFields) {

                        const refFieldDefinition = this.getFieldDefinition(refField, fieldDefinition.type)
                        const refFieldName = refFieldDefinition.name

                        if (fieldDefinition.fields) {
                            projectResultData[fieldName + '.' + refFieldName] = 1
                        }

                        if (refFieldDefinition) {

                            let localProjected = false
                            if (refFieldDefinition.fields) {
                                usePipeline = true
                                for (const subRefField of refFieldDefinition.fields) {
                                    projectPipeline[refFieldName + '.' + subRefField] = 1
                                }
                            } else if (refFieldDefinition.localized && refFieldDefinition.projectLocal) {
                                usePipeline = true
                                localProjected = true
                                // project localized field in current language
                                projectPipeline[refFieldName] = '$' + refFieldName + '.' + lang
                            } else {
                                projectPipeline[refFieldName] = 1
                            }

                            if (!refFieldDefinition.reference) {
                                if (this.createAndAddFilterToMatch({
                                        name: fieldName + '.' + refFieldName,
                                        reference: false,
                                        localized: refFieldDefinition.localized && !localProjected
                                    }, match, {exact: true})) {
                                    hasMatchInReference = true
                                }
                            }
                        }
                    }
                }

                if (fieldDefinition.multi) {
                    // if multi it has to be an array
                    // this is an anditional filter to remove non array values. it is not needed if database is consistent
                    // without this filter you might get the error: $in requires an array as a second argument
                    /*this.addFilterToMatch({
                     filterKey:fieldName+'.0',
                     filterValue: { '$exists': true },
                     match: rootMatch
                     })*/
                }


                const {lookup} = this.createAndAddLookup(fieldDefinition, lookups, {usePipeline})

                if (lookup.$lookup.pipeline) {
                    lookup.$lookup.pipeline.push({$project: projectPipeline})
                }

                groups[fieldName] = this.createGroup(fieldDefinition)
                this.createAndAddFilterToMatch(fieldDefinition, hasMatchInReference ? match : rootMatch, {})

            } else {
                // regular field
                if (fieldName !== '_id') {


                    groups[fieldName] = {'$first': '$' + fieldName}
                    if (typeFields[fieldName]) {
                        this.createAndAddFilterToMatch(fieldDefinition, match, {})
                    }


                }
                if (fieldDefinition.fields) {
                    for (const subField of fieldDefinition.fields) {
                        projectResultData[fieldName + '.' + subField] = 1
                    }
                } else {

                    if (fieldDefinition.localized && fieldDefinition.projectLocal) {
                        // project localized field in current language
                        projectResultData[fieldName] = '$' + fieldName + '.' + lang
                    } else {
                        projectResultData[fieldName] = 1
                    }
                }
            }
        })

        if (!projectResult) {
            // also return extra fields
            if (!typeDefinition.noUserRelation) {

                this.createAndAddLookup({type: 'User', name: 'createdBy', multi: false}, lookups, {})
                groups.createdBy = this.createGroup({name: 'createdBy', multi: false})
            }
            groups.modifiedAt = {'$first': '$modifiedAt'}
        }


        // compose result
        let result = [], resultFacet = []

        const hasMatch = Object.keys(match).length > 0
        const doMatchAfterLookup = (hasMatch && hasMatchInReference)


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

        // add sort
        result.push({$sort: sort})


        let tmpResult
        if (doMatchAfterLookup) {
            tmpResult = result
        } else {
            tmpResult = resultFacet
        }

        resultFacet.push({$skip: offset})
        resultFacet.push({$limit: limit})

        if (lookups.length > 0) {
            for (const lookup of lookups) {
                tmpResult.push(lookup)
            }
        }

        // Group back to arrays
        tmpResult.push(
            {
                $group: {
                    _id: '$_id',
                    ...groups
                }
            })

        // second match
        if (doMatchAfterLookup) {
            tmpResult.push({
                $match: match
            })
        }

        // sort again within the result
        resultFacet.push({$sort: sort})


        // project
        if (projectResult) {
            // also remove id if it is not explicitly set
            if (!projectResultData._id) {
                projectResultData._id = 0
            }
            resultFacet.push({$project: projectResultData})
        }


        //wrap in a facet
        result.push(
            {
                $facet: {
                    meta: [
                        {$count: 'count'}
                    ],
                    results: resultFacet
                }
            })

        // return offset and limit
        result.push({
            $addFields: {limit, offset, page, searchHint: this.searchHint}
        })


        return result

    }

}
