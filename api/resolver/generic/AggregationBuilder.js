import Util from 'api/util'
import {getType} from 'util/types'
import {getFormFieldsByType} from 'util/typesAdmin'
import {ObjectId} from 'mongodb'
import config from 'gen/config'
import Hook from 'util/hook'

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

    constructor(type, fields, db, options) {
        this.type = type
        this.fields = fields
        this.db = db
        this.options = options
    }

    getLimit() {
        let {limit} = this.options
        return limit ? parseInt(limit) : 10
    }

    getOffset() {
        let {offset, page} = this.options

        if (!offset) {

            if (page && page > 0) {
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

                const typeFields = getFormFieldsByType(this.type)

                // the sort string is in this format "field1 asc, field2 desc"
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
                                $and: [{$expr}]
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
    async createFilterForField({name, subQuery, reference, type, multi, localized, searchable, vagueSearchable}, match, {exact, filters}) {
        let hasAtLeastOneMatch = false

        if (filters && searchable !== false) {


            if (localized) {
                for (const lang of config.LANGUAGES) {
                    if (await this.createFilterForField({
                        name: name + '.' + lang,
                        subQuery,
                        reference
                    }, match, {exact, filters})) {
                        hasAtLeastOneMatch = true
                    }
                }
                return hasAtLeastOneMatch
            }

            const filterKey = name + (subQuery ? '.' + subQuery.name : '')

            let filterPart = filters.parts[filterKey]
            if (!filterPart && reference) {
                filterPart = filters.parts[filterKey + '._id']
            }
            if (!filterPart && !exact) {
                filterPart = filters.parts[filterKey.split('.')[0]]
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
                    if (await this.addFilterToMatch({
                        filterKey: name,
                        subQuery,
                        filterValue: filterPartOfArray.value,
                        filterOptions: filterPartOfArray,
                        type: reference ? 'ID' : type,
                        multi,
                        match
                    })) {
                        hasAtLeastOneMatch = true
                    }
                }
            } else if (type === 'Object') {

                // filter in an Object without definition
                for (const partFilterKey in filters.parts) {
                    if (partFilterKey.startsWith(filterKey + '.')) {

                        filterPart = filters.parts[partFilterKey]

                        let filterPartArray = null

                        if (filterPart.constructor !== Array) {
                            filterPartArray = [filterPart]
                        } else {
                            filterPartArray = filterPart
                        }
                        for (const filterPartOfArray of filterPartArray) {
                            if (await this.addFilterToMatch({
                                filterKey: partFilterKey,
                                subQuery,
                                filterValue: filterPartOfArray.value,
                                filterOptions: filterPartOfArray,
                                match
                            })) {
                                hasAtLeastOneMatch = true
                            }
                        }
                    }
                }
            }

            if (!exact && !reference && vagueSearchable !== false && ['Boolean'].indexOf(type) < 0) {

                // if it is an object only add filter if searchable is explicitly set to true
                if (type !== 'Object' || vagueSearchable === true) {

                    for (const restFilter of filters.rest) {
                        hasAtLeastOneMatch = true
                        if (await this.addFilterToMatch({
                            filterKey,
                            subQuery,
                            filterValue: restFilter.value,
                            filterOptions: restFilter,
                            type,
                            multi,
                            match
                        })) {
                            hasAtLeastOneMatch = true
                        }
                    }
                }
            }
        }
        return hasAtLeastOneMatch
    }


    /**
     * get a user or gobal value by a key
     *
     * @param {String} filterKey is the name of the collection field
     * @param {String} filterValue is always a string
     * @param {String} type is the type of the field. it can be Boolean, ID, Object, Float
     * @param {Boolean} multi if true the field can store multiple values. it must be an array
     * @param {Object} filterOptions contains information about the filter
     * @param {Object} match the match where the filter should be added to
     * @param {Function} callback a function that gets called at the end
     *
     * @returns {Boolean} returns true when filter was added
     */
    async addFilterToMatch({filterKey, filterValue, type, subQuery, multi, filterOptions, match}) {

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

                if (filterValue.constructor === ObjectId) {
                    // do nothing
                } else if (filterValue.startsWith('[') && filterValue.endsWith(']')) {
                    filterValue = filterValue.substring(1, filterValue.length - 1).split(',')
                    const ids = []
                    for (const id of filterValue) {
                        if (ObjectId.isValid(id)) {
                            ids.push(ObjectId(id))
                        } else {
                            this.debugInfo.push('Search for IDs. But at least one ID is not valid')
                            return false
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
                    this.debugInfo.push('Search for ID. But ID is not valid')
                    return false
                }
            } else {

                if(comparator === '$ne') {
                    if (!match.$and) {
                        match.$and = []
                    }
                    match.$and.push({
                        // Check about no Company key
                        [filterKey]: {
                            $exists: true,
                        },
                    })
                    match.$and.push({
                        // Check about no Company key
                        [filterKey]: {$ne: null},
                    })
                }else{

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
                }
                return true
            }
        } else if (type === 'Boolean') {
            if (filterValue === 'true' || filterValue === 'TRUE') {
                filterValue = true
            } else if (filterValue === 'false' || filterValue === 'FALSE') {
                filterValue = false
            }
        } else if (type === 'Float') {
            filterValue = parseFloat(filterValue)
        } else if (type === 'Object' && filterValue) {

            filterValue = {
                body: `function(data) {return data && Object.keys(data).some(
                key => /${filterValue}/i.test( data[key] && (data[key].constructor===Object || data[key].constructor===Array)?JSON.stringify(data[key]):data[key])
                )}`,
                args: ['$' + filterKey],
                lang: 'js'
            }

            comparator = '$function'
            filterKey = '$expr'
        }

        let matchExpression
        if (['$gt', '$gte', '$lt', '$lte'].indexOf(comparator) >= 0) {
            matchExpression = {[comparator]: type === 'ID' ? filterValue : parseFloat(filterValue)}
        } else if (comparator === '$ne' || comparator === '$eq') {
            if (multi && filterValue && filterValue.constructor !== Array) {
                matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [filterValue]}
            } else if (filterValue === '') {
                matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [null, ""]}

                if(comparator !== '$eq'){
                    // array must exist and must not be empty
                    matchExpression.$exists = true
                    matchExpression.$not = {$size: 0}
                }

            } else if (!filterOptions.inDoubleQuotes && filterValue === 'null') {
                matchExpression = {[comparator]: null}
            } else if (filterValue.constructor === ObjectId) {
                matchExpression = {[comparator]: filterValue}
            } else {
                if (filterOptions.inDoubleQuotes) {
                    matchExpression = {[comparator]: filterValue}
                } else if (filterValue === true || filterValue === false) {
                    matchExpression = {[comparator]: filterValue}
                } else if (!isNaN(filterValue)) {
                    matchExpression = {[comparator]: parseFloat(filterValue)}
                } else if (filterValue && filterValue.constructor === String && filterValue.startsWith('[') && filterValue.endsWith(']')) {
                    matchExpression = {'$in': filterValue.substring(1, filterValue.length - 1).split(',')}
                } else {
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

        if (subQuery) {
            // execute sub query
            const ids = (await this.db.collection(subQuery.type).find({[subQuery.name]:matchExpression}).toArray()).map(item => item._id)
            matchExpression = {$in: ids}
        }

        if (!filterOptions || filterOptions.operator === 'or') {
            if (!match.$or) {
                match.$or = []
            }
            match.$or.push({[filterKey]: matchExpression})
        } else {

            if (!match.$and) {
                match.$and = []
            }

            match.$and.push({[filterKey]: matchExpression})

            /*if (match[filterKey]) {
                match[filterKey] = {...match[filterKey], ...matchExpression}
            } else {
                match[filterKey] = matchExpression
            }*/
        }
        return true
    }


    getFieldDefinition(fieldData, type) {
        const typeFields = getFormFieldsByType(type)

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

    async query() {

        this.debugInfo = []

        const typeDefinition = getType(this.type) || {}
        const {projectResult, lang, includeCount, includeUserFilter} = this.options

        // limit and offset
        const limit = this.getLimit(),
            offset = this.getOffset(),
            page = this.getPage(),
            sort = this.getSort(),
            typeFields = getFormFieldsByType(this.type),
            filters = this.getParsedFilter(this.options.filter),
            resultFilters = this.getParsedFilter(this.options.resultFilter)


        let match = Object.assign({$and: []}, this.options.match),
            resultMatch = {$and: []},
            groups = {},
            lookups = [],
            projectResultData = {}

        if (match) {
            // all the passed matches must be and
            Object.keys(match).forEach(k => {
                if (k == '$and') {
                    return
                }
                match.$and.push({[k]: match[k]})
                delete match[k]
            })
        }

        const aggHook = Hook.hooks['AggregationBuilderBeforeQuery']
        if (aggHook && aggHook.length) {
            for (let i = 0; i < aggHook.length; ++i) {
                await aggHook[i].callback({filters, type: this.type, db: this.db})
            }
        }

        const fields = this.fields.slice(0)

        if (filters) {
            if (filters.parts._id) {
                // if there is a filter on _id
                let idFilters
                if (filters.parts._id.constructor !== Array) {
                    idFilters = [filters.parts._id]
                } else {
                    idFilters = filters.parts._id
                }
                for( const idFilter of idFilters){
                    await this.addFilterToMatch({
                        filterKey: '_id',
                        filterValue: idFilter.value,
                        filterOptions: idFilter,
                        type: 'ID',
                        match
                    })
                }
            }

            if (includeUserFilter && (filters.parts.createdBy || filters.parts['createdBy.username'])) {
                fields.push('createdBy')
            }
        }


        for (let i = 0; i < fields.length; i++) {
            const field = fields[i]
            const fieldDefinition = this.getFieldDefinition(field, this.type)
            const fieldName = fieldDefinition.name
            if (fieldDefinition.reference) {

                // search in a ref field
                let refFields = fieldDefinition.fields, projectPipeline = {}, usePipeline = false

                if (!refFields) {
                    projectResultData[fieldName] = 1
                    const refFieldDefinitions = getFormFieldsByType(fieldDefinition.type)
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

                                await this.createFilterForField({
                                    name: fieldName,
                                    subQuery: {type: fieldDefinition.type, name: refFieldName},
                                    reference: false,
                                    type: refFieldDefinition.type,
                                    localized: refFieldDefinition.localized && !localProjected
                                }, match, {exact: true, filters})
                            }
                        }
                    }
                }


                // execute sub query
                /*  if (Object.keys(subMatch).length > 0) {

                      const ids = (await db.collection(fieldDefinition.type).find(subMatch).toArray()).map(item => item._id)
                      match.$and.push({[fieldName]: {$in: ids}})
                  }*/

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
                await this.createFilterForField(fieldDefinition, match, {filters})

            } else {
                // regular field
                if (fieldName !== '_id') {
                    groups[fieldName] = {'$first': '$' + fieldName}
                    if (typeFields[fieldName]) {
                        await this.createFilterForField(fieldDefinition, match, {filters})
                        await this.createFilterForField(fieldDefinition, resultMatch, {filters: resultFilters})
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
        }

        if (!projectResult) {
            // also return extra fields
            if (!typeDefinition.noUserRelation && !groups.createdBy) {
                this.createAndAddLookup({type: 'User', name: 'createdBy', multi: false}, lookups, {})
                groups.createdBy = this.createGroup({name: 'createdBy', multi: false})
            }
            groups.modifiedAt = {'$first': '$modifiedAt'}
        }

        // compose result
        let dataQuery = [], dataFacetQuery = []

        this.cleanupMatch(match)
        this.cleanupMatch(resultMatch)

        const hasMatch = Object.keys(match).length > 0,
            hasResultMatch = Object.keys(resultMatch).length > 0


        if (hasMatch) {

            dataQuery.push({
                $match: match
            })
        }


        // add at the beginning of the query
        if (this.options.afterRootMatch) {
            if (this.options.afterRootMatch.constructor === Array) {
                dataQuery.push(...this.options.afterRootMatch)
            }
        }
        if (hasResultMatch) {
            dataFacetQuery.push({$match: resultMatch})
        }

        if(this.options.resultLimit) {
            dataFacetQuery.push({$limit: this.options.resultLimit})
        }

        if (includeCount) {
            if(this.options.limitCount){

                dataQuery.push({$sort: sort})
                dataQuery.push({$skip: offset})
                dataQuery.push({$limit: this.options.limitCount})

                dataFacetQuery.push({$skip: 0})
                dataFacetQuery.push({$limit: limit})

            }else {
                dataFacetQuery.push({$sort: sort})
                dataFacetQuery.push({$skip: offset})
                dataFacetQuery.push({$limit: limit})
            }
        } else {
            dataQuery.push({$sort: sort})
            dataQuery.push({$skip: offset})
            dataQuery.push({$limit: limit})
        }


        if (this.options.lookups) {
            lookups.push(...this.options.lookups)
        }

        if (lookups.length > 0) {
            for (const lookup of lookups) {
                dataFacetQuery.push(lookup)
            }
        }

        // add at the beginning of the query
        if (this.options.before) {
            if (this.options.before.constructor === Array) {
                for (let i = this.options.before.length - 1; i >= 0; i--) {
                    dataFacetQuery.unshift(this.options.before[i])
                }
            } else {
                dataFacetQuery.unshift(this.options.before)
            }
        }

        // add right before the group
        if (this.options.beforeGroup) {
            dataFacetQuery.push(this.options.beforeGroup)
        }

        // Group back to arrays
        dataFacetQuery.push({
            $group: {
                _id: '$_id',
                ...groups,
                ...this.options.group
            }
        })


        const countQuery = dataQuery.slice(0)
        countQuery.push({
            "$count": "count"
        })

        // sort again within the result
        dataFacetQuery.push({$sort: sort})

        // add right before the group
        if (this.options.beforeProject) {
            if (this.options.beforeProject.constructor === Array) {
                for (let i = this.options.beforeProject.length - 1; i >= 0; i--) {
                    dataFacetQuery.push(this.options.beforeProject[i])
                }
            } else {
                dataFacetQuery.push(this.options.beforeProject)
            }
            console.log(dataFacetQuery)

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
            facet.$facet.count = [
                {$count: 'count'}
            ]


            if (hasResultMatch) {
                facet.$facet.count.unshift({$match: resultMatch})
            }
        }

        //wrap in a facet
        dataQuery.push(facet)

        // return offset and limit
        dataQuery.push({
            $addFields: {limit, offset, page, ...this.options.$addFields}
        })


        return {dataQuery, countQuery, debugInfo: this.debugInfo}

    }

    cleanupMatch(match) {
        // get rid of single or
        if (match.$or && match.$or.length === 1) {
            match.$and.push(match.$or[0])
            delete match.$or
        }

        // get rid of empty $and
        if (match.$and && match.$and.length == 0) {
            delete match.$and
        }
        // get rid of empty $or
        if (match.$or && match.$or.length == 0) {
            delete match.$or
        }
    }
}
