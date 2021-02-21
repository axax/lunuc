import Util from 'api/util'
import {getType} from 'util/types'
import {getFormFields} from 'util/typesAdmin'
import {ObjectId} from 'mongodb'
import config from 'gen/config'

const comparatorMap = {
    ':': '$regex',
    '=': '$regex',
    '==': '$eq',
    '===': '$eq',
    '>': '$gt',
    '>=': '$gte',
    '<': '$lt',
    '<=': '$lte',
    '!=': '$regex',
    '!==': '$ne'
}

export default class AggregationBuilder {

    constructor(type, fields, options) {
        this.type = type
        this.fields = fields
        this.options = options
    }

    getLimit() {
        let {limit} = this.options
        return limit ? parseInt(limit) : 10
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
        let {sort, lang} = this.options
        if (!sort) {
            return {_id: -1}
        } else {
            if (sort.constructor === String) {

                const typeFields = getFormFields(this.type)
                // sort looks like "field1 asc, field2 desc"
                return sort.split(',').reduce((acc, val) => {
                    const a = val.trim().split(' ')
                    let fieldName = a[0]
                    if (fieldName.indexOf('.') < 0 && typeFields[fieldName] && typeFields[fieldName].localized) {
                        fieldName += '.' + lang
                    }
                    return {...acc, [fieldName]: (a.length > 1 && a[1].toLowerCase() == "desc" ? -1 : 1)}
                }, {})
            }
        }
        return sort
    }


    getParsedFilter(filterStr) {
        if (filterStr) {
            return Util.parseFilter(filterStr)
        }
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
    createAndAddFilterToMatch({name, reference, type, multi, localized}, match, {exact, filters}) {
        let hasAtLeastOneMatch = false

        if (filters) {
            if (localized) {
                config.LANGUAGES.forEach(lang => {
                    if (this.createAndAddFilterToMatch({name: name + '.' + lang, reference}, match, {exact, filters})) {
                        hasAtLeastOneMatch = true
                    }
                })
                return hasAtLeastOneMatch
            }

            let filterPart = filters.parts[name]
            if (!filterPart && reference) {
                filterPart = filters.parts[name + '._id']
            }
            if (!filterPart && !exact) {
                filterPart = filters.parts[name.split('.')[0]]
            }

            // explicit search for this field
            if (filterPart) {

                let filterPartArray
                if (filterPart.constructor !== Array) {
                    filterPartArray = [filterPart]
                } else {
                    filterPartArray = filterPart
                }


                for (const filterPartOfArray of filterPartArray) {
                    const {added, error} = this.addFilterToMatch({
                        filterKey: name,
                        filterValue: filterPartOfArray.value,
                        filterOptions: filterPartOfArray,
                        type: reference ? 'ID' : type,
                        multi,
                        match
                    })

                    if (added) {
                        hasAtLeastOneMatch = true
                    } else {
                        //TODO add debugging infos for search. this here is only a test
                        this.searchHint = error
                    }
                }
            } else if (type === 'Object') {

                // filter in an Object without definition
                for (const filterKey in filters.parts) {
                    if (filterKey.startsWith(name + '.')) {


                        filterPart = filters.parts[filterKey]

                        let filterPartArray
                        if (filterPart.constructor !== Array) {
                            filterPartArray = [filterPart]
                        } else {
                            filterPartArray = filterPart
                        }

                        for (const filterPartOfArray of filterPartArray) {
                            const {added} = this.addFilterToMatch({
                                filterKey,
                                filterValue: filterPartOfArray.value,
                                filterOptions: filterPartOfArray,
                                match
                            })
                            if (added) {
                                hasAtLeastOneMatch = true
                            }
                        }


                    }
                }
            }


            if (!exact && !reference && ['Boolean'].indexOf(type) < 0) {
                filters.rest.forEach(e => {
                    hasAtLeastOneMatch = true
                    const {added} = this.addFilterToMatch({
                        filterKey: name,
                        filterValue: e.value,
                        filterOptions: e,
                        type,
                        multi,
                        match
                    })
                    if (added) {
                        hasAtLeastOneMatch = true
                    }
                })
            }
        }
        return hasAtLeastOneMatch
    }

    /*
     filterKey: is the name of the collection field
     filterValue: is always a string
     type: of the collection field
     */
    addFilterToMatch({filterKey, filterValue, type, multi, filterOptions, match}) {

        const rawComperator = filterOptions && filterOptions.comparator

        let comparator = '$regex' // default comparator

        if (rawComperator && comparatorMap[rawComperator]) {
            comparator = comparatorMap[rawComperator]
        }

        if (comparator === '$regex' && (type === 'Boolean' || type === 'ID' || type === 'Float')) {

            if (rawComperator === '!=') {
                comparator = '$ne'
            } else {
                comparator = '$eq'
            }
        }

        if (type === 'ID') {
            if (filterValue) {
                if (filterValue.startsWith('[') && filterValue.endsWith(']')) {
                    filterValue = filterValue.substring(1, filterValue.length - 1).split(',')
                    const ids = []
                    for (const id of filterValue) {
                        if (ObjectId.isValid(id)) {
                            ids.push(ObjectId(id))
                        } else {
                            return {added: false, error: 'Search for IDs. But not all ids are valid'}
                        }
                    }
                    filterValue = ids
                    if (comparator === '$ne') {
                        comparator = '$nin'
                    } else {
                        comparator = '$in'
                    }
                } else if (ObjectId.isValid(filterValue)) {
                    // match by id
                    filterValue = ObjectId(filterValue)
                } else {
                    return {added: false, error: 'Search for ID. But ID is not valid'}
                }
            } else {

                if (!match.$or) {
                    match.$or = []
                }
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: {
                        $exists: false,
                    },
                })
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: null,
                })
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: {
                        $size: 0
                    },
                })
                return {added: true}
            }
        } else if (type === 'Boolean') {
            if (filterValue === 'true' || filterValue === 'TRUE') {
                filterValue = true
            } else if (filterValue === 'false' || filterValue === 'FALSE') {
                filterValue = false
            }
        } else if (type === 'Float') {
            filterValue = parseFloat(filterValue)
        }

        let matchExpression
        if (['$gt', '$gte', '$lt', '$lte'].indexOf(comparator) >= 0) {
            matchExpression = {[comparator]: type === 'ID' ? filterValue : parseFloat(filterValue)}
        } else if (comparator === '$ne' || comparator === '$eq') {

            if (multi && filterValue && filterValue.constructor !== Array) {
                matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [filterValue]}
            } else if (filterValue==='') {
                matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [null, ""]}
            } else if (!filterOptions.inDoubleQuotes && filterValue === 'null') {
                matchExpression = {[comparator]: null}
            } else {
                if(filterOptions.inDoubleQuotes){
                    matchExpression = {[comparator]: filterValue}
                }else if( !isNaN(filterValue)) {
                    matchExpression = {[comparator]: parseFloat(filterValue)}
                }else if(filterValue.startsWith('[') && filterValue.endsWith(']')) {
                    matchExpression = {'$in': filterValue.substring(1,filterValue.length-1).split(',')}
                }else{
                    matchExpression = {[comparator]: filterValue}
                }
            }
        } else if (comparator === '$regex') {
            if (rawComperator === '!=') {
                matchExpression = {$not: {[comparator]: filterValue, $options: 'i'}}
            } else {
                matchExpression = {[comparator]: filterValue, $options: 'i'}
            }
        } else {
            matchExpression = {[comparator]: filterValue}
        }

        if (!filterOptions || filterOptions.operator === 'or') {
            if (!match.$or) {
                match.$or = []
            }
            match.$or.push({[filterKey]: matchExpression})
        } else {
            if(match[filterKey]){
                match[filterKey] = {...match[filterKey],...matchExpression}
            }else {
                match[filterKey] = matchExpression
            }
        }
        return {added: true}
    }


    getFieldDefinition(fieldData, type) {
        const typeFields = getFormFields(type)

        let fieldDefinition = {}
        if (fieldData.constructor === Object) {
            const fieldNames = Object.keys(fieldData)
            if (fieldNames.length > 0) {

                // there should be only one attribute
                fieldDefinition.name = fieldNames[0]
                let data = fieldData[fieldDefinition.name]

                if (fieldDefinition.name.indexOf('.') > 0) {
                    const parts = fieldDefinition.name.split('.')
                    fieldDefinition.name = parts[0]
                    data = [parts[1]]
                }


                if (data.constructor === Array) {
                    // if a value is in this format {'categories':['name']}
                    // we expect that the field categories is a reference to another type
                    // so we create a lookup for this type
                    fieldDefinition.fields = data
                } else {
                    if (data.localized) {
                        fieldDefinition.projectLocal = true
                    }
                    if (data.substr) {
                        fieldDefinition.projectLocal = true
                        fieldDefinition.substr = data.substr
                    }
                }

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
            if (fieldData.endsWith('.localized')) {
                fieldDefinition.projectLocal = true
                fieldDefinition.name = fieldData.split('.')[0]
            } else {
                fieldDefinition.name = fieldData
            }
        }

        // extend it with default definition
        if (typeFields[fieldDefinition.name]) {
            fieldDefinition = {...typeFields[fieldDefinition.name], ...fieldDefinition}
        } else if (fieldDefinition.name === 'createdBy') {
            fieldDefinition.reference = true
            fieldDefinition.type = 'User'
        }

        return fieldDefinition

    }


    projectByField(fieldName, fields, projectResultData) {
        for (const subField of fields) {
            if (subField.constructor === Object) {
                const keys = Object.keys(subField)
                this.projectByField(fieldName + '.' + keys[0], subField[keys[0]], projectResultData)
            } else {
                projectResultData[fieldName + '.' + subField] = 1
            }
        }
    }

    query() {
        const typeDefinition = getType(this.type) || {}
        const {projectResult, lang, includeCount} = this.options

        // limit and offset
        const limit = this.getLimit(),
            offset = this.getOffset(),
            page = this.getPage(),
            sort = this.getSort(),
            typeFields = getFormFields(this.type),
            filters = this.getParsedFilter(this.options.filter),
            resultFilters = this.getParsedFilter(this.options.resultFilter)

        let rootMatch = Object.assign({}, this.options.match),
            match = {},
            resultMatch = {},
            groups = {},
            lookups = [],
            projectResultData = {},
            hasMatchInReference = false

        // if there is filter like _id=12323213
        if (filters) {
            if (filters.parts._id) {
                // if there is a filter on _id
                // handle it here
                let idFilters
                if (filters.parts._id.constructor !== Array) {
                    idFilters = [filters.parts._id]
                } else {
                    idFilters = filters.parts._id
                }
                idFilters.forEach((idFilter) => {
                    this.addFilterToMatch({
                        filterKey: '_id',
                        filterValue: idFilter.value,
                        filterOptions: idFilter,
                        type: 'ID',
                        match: rootMatch
                    })
                })

            }
            if (filters.parts['createdBy.username']) {
                const typeFields = getFormFields('User')
                hasMatchInReference = true
                this.addFilterToMatch({
                    filterKey: 'createdBy.username',
                    filterValue: filters.parts['createdBy.username'].value,
                    filterOptions: filters.parts['createdBy.username'],
                    match
                })
            }
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
                    if (refFieldDefinitions) {
                        refFields = Object.keys(refFieldDefinitions)
                    }
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

                            /* if (refFieldDefinition.type === 'Object') {
                                 console.log(refFieldDefinition)
                                 projectPipeline[refFieldName] = {$convert: {input: '$' + refFieldName, to: "string", onError: "error" }}
                             }*/


                            if (!refFieldDefinition.reference) {
                                // these filters are slow
                                // probably it is better to do multiple queries instead
                                if (this.createAndAddFilterToMatch({
                                    name: fieldName + '.' + refFieldName,
                                    reference: false,
                                    localized: refFieldDefinition.localized && !localProjected
                                }, match, {exact: true, filters})) {
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


                if (refFields && refFields.length === 1 && refFields[0] === '_id') {
                    // it is only the id lookup doesn't make sense
                    projectResultData[fieldName + '._id'] = '$' + fieldName
                    groups[fieldName] = {'$first': '$' + fieldName}
                } else {
                    const {lookup} = this.createAndAddLookup(fieldDefinition, lookups, {usePipeline})

                    if (lookup.$lookup.pipeline) {
                        lookup.$lookup.pipeline.push({$project: projectPipeline})
                    }

                    groups[fieldName] = this.createGroup(fieldDefinition)

                }
                this.createAndAddFilterToMatch(fieldDefinition, hasMatchInReference ? match : rootMatch, {filters})

            } else {
                // regular field
                if (fieldName !== '_id') {
                    groups[fieldName] = {'$first': '$' + fieldName}
                    if (typeFields[fieldName]) {
                        this.createAndAddFilterToMatch(fieldDefinition, match, {filters})
                        this.createAndAddFilterToMatch(fieldDefinition, resultMatch, {filters: resultFilters})
                    }


                }
                if (fieldDefinition.fields) {
                    this.projectByField(fieldName, fieldDefinition.fields, projectResultData)
                } else {

                    if (fieldDefinition.projectLocal) {
                        // project localized field in current language
                        if (fieldDefinition.substr) {
                            projectResultData[fieldName] = {$substrCP: ['$' + fieldName + (fieldDefinition.localized ? '.' + lang : ''), fieldDefinition.substr[0], fieldDefinition.substr[1]]}
                        } else if (fieldDefinition.localized) {
                            projectResultData[fieldName] = '$' + fieldName + '.' + lang
                        }

                    } else {
                        projectResultData[fieldName] = 1

                        // mongodb 4 supports convert and toString
                        // for know we have to do it after the query
                        /*if (fieldDefinition.type === 'Object') {
                            projectResultData[fieldName] = {$convert: {input: '$' + fieldName, to: "string", onError: "error" }}
                        }*/
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
        let dataQuery = [], dataFacetQuery = []


        const hasMatch = Object.keys(match).length > 0,
            hasResultMatch = Object.keys(resultMatch).length > 0,
            doMatchAfterLookup = (hasMatch && hasMatchInReference)

        if (Object.keys(rootMatch).length > 0) {
            if (!hasMatchInReference) {

                // merge ors
                if (rootMatch.$or && match.$or) {
                    match.$or.push(...rootMatch.$or)
                    delete rootMatch.$or
                }

                dataQuery.push({
                    $match: {...rootMatch, ...match}
                })
            } else {
                dataQuery.push({
                    $match: rootMatch
                })
            }
        } else if (hasMatch && !hasMatchInReference) {
            dataQuery.push({
                $match: match
            })
        }

        if (hasResultMatch) {
            dataFacetQuery.push({$match: resultMatch})
        }


        let tempQuery
        if (doMatchAfterLookup) {
            tempQuery = dataQuery

            // add sort
            dataFacetQuery.push({$sort: sort})
            dataFacetQuery.push({$skip: offset})
            dataFacetQuery.push({$limit: limit})
        } else {
            tempQuery = dataFacetQuery

            if (includeCount) {
                dataFacetQuery.push({$sort: sort})
                dataFacetQuery.push({$skip: offset})
                dataFacetQuery.push({$limit: limit})
            }
        }

        if (this.options.lookups) {
            lookups.push(...this.options.lookups)
        }

        if (lookups.length > 0) {
            for (const lookup of lookups) {
                tempQuery.push(lookup)
            }
        }

        // add at the beginning of the query
        if (this.options.before) {
            if (this.options.before.constructor === Array) {
                for (let i = this.options.before.length - 1; i >= 0; i--) {
                    tempQuery.unshift(this.options.before[i])
                }
            } else {
                tempQuery.unshift(this.options.before)
            }
        }

        // add right before the group
        if (this.options.beforeGroup) {
            tempQuery.push(this.options.beforeGroup)
        }

        // Group back to arrays
        tempQuery.push(
            {
                $group: {
                    _id: '$_id',
                    ...groups,
                    ...this.options.group
                }
            })

        // second match
        if (doMatchAfterLookup) {
            dataQuery.push({
                $match: match
            })
        }


        const countQuery = dataQuery.slice(0)
        countQuery.push({
            "$count": "count"
        })

        if (!doMatchAfterLookup) {
            // add sort
            // it is much faster when skip limit is outside of facet
            if (!includeCount) {
                dataQuery.push({$sort: sort})
                dataQuery.push({$skip: offset})
                dataQuery.push({$limit: limit})
            }
        }

        // sort again within the result
        dataFacetQuery.push({$sort: sort})


        // add right before the group
        if (this.options.beforeProject) {
            tempQuery.push(this.options.beforeProject)
        }

        // project
        if (projectResult) {
            // also remove id if it is not explicitly set
            if (!projectResultData._id) {
                projectResultData._id = 0
            }
            if (this.options.group) {
                Object.keys(this.options.group).forEach((k) => {
                    projectResultData[k] = 1
                })
            }
            if (this.options.project) {
                Object.keys(this.options.project).forEach((k) => {
                    if (this.options.project[k] === null) {
                        delete projectResultData[k]
                    } else {
                        projectResultData[k] = this.options.project[k]
                    }
                })
            }
            dataFacetQuery.push({$project: projectResultData})
        }

        const facet = {
            $facet: {
                results: dataFacetQuery,
                ...this.options.$facet
            }
        }

        if (includeCount) {
            facet.$facet.meta = [
                {$count: 'count'}
            ]


            if (hasResultMatch) {
                facet.$facet.meta.unshift({$match: resultMatch})
            }
        }

        //wrap in a facet
        dataQuery.push(facet)

        // return offset and limit
        dataQuery.push({
            $addFields: {limit, offset, page, searchHint: this.searchHint, ...this.options.$addFields}
        })


        return {dataQuery, countQuery}

    }

}
