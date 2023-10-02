import Util from '../../util/index.mjs'
import {getType} from '../../../util/types.mjs'
import {getFormFieldsByType} from '../../../util/typesAdmin.mjs'
import config from '../../../gensrc/config.mjs'
import Hook from '../../../util/hook.cjs'
import {addFilterToMatch, addSearchStringToMatch} from '../../util/dbquery.mjs'


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
    createAndAddLookup({type, name, multi, localized}, lookups, {usePipeline, language}) {

        if(localized) {
            for (const lang of config.LANGUAGES) {
                this.createAndAddLookup({type,name,multi}, lookups, {usePipeline, language: lang})
            }
            return {}
        }

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
                    localField: language?`${name}.${language}`:name,
                    foreignField: '_id',
                    as: language?`${name}_${language}`:name
                }
            }
        }

        lookups.push(lookup)
        return {lookup}
    }

    createGroup({ name, multi, localized, reference }) {
        if (reference && localized) {
            const group = { $first: {} }
            for (const lang of config.LANGUAGES) {
                const fieldName = `${name}_${lang}`
                group.$first[lang] = `$${fieldName}`
            }
            return group
        } else {
            const fieldName = multi ? `$${name}` : { $arrayElemAt: [`$${name}`, 0] }
            return { $first: fieldName }
        }
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
                    if (await addFilterToMatch({
                        filterKey: name,
                        subQuery,
                        filterValue: filterPartOfArray.value,
                        filterOptions: filterPartOfArray,
                        type: reference ? 'ID' : type,
                        multi,
                        match,
                        db:this.db,
                        debugInfo: this.debugInfo
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
                            if (await addFilterToMatch({
                                filterKey: partFilterKey,
                                subQuery,
                                filterValue: filterPartOfArray.value,
                                filterOptions: filterPartOfArray,
                                match,
                                db:this.db,
                                debugInfo: this.debugInfo
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
                        if (await addFilterToMatch({
                            filterKey,
                            subQuery,
                            filterValue: restFilter.value,
                            filterOptions: restFilter,
                            type,
                            multi,
                            match,
                            db:this.db,
                            debugInfo: this.debugInfo
                        })) {
                            hasAtLeastOneMatch = true
                        }
                    }
                }
            }
        }
        return hasAtLeastOneMatch
    }





    createFieldDefinition(fieldData, type) {
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


    /*
    This is a JavaScript function that takes three arguments - fieldName, fields, and projectResultData -
    and recursively processes the fields object to construct a MongoDB projection object that includes only the specified fields.
     */
    projectByField(fieldName, fields, projectResultData) {
        for (const subField of fields) {
            if(subField) {
                if (subField.constructor === Object) {
                    const keys = Object.keys(subField)
                    if(keys[0]) {
                        this.projectByField(fieldName + '.' + keys[0], subField[keys[0]], projectResultData)
                    }
                } else {
                    projectResultData[fieldName + '.' + subField] = 1
                }
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
            facetSort = sort._id ? sort : Object.assign({}, sort, {_id:-1}),
            typeFields = getFormFieldsByType(this.type),
            filters = this.getParsedFilter(this.options.filter),
            resultFilters = this.getParsedFilter(this.options.resultFilter),
            lookupFilters = this.getParsedFilter(this.options.lookupFilter)
        let match = Object.assign({$and: []}, this.options.match),
            resultMatch = {$and: []},
            lookupMatch = {$and: []},
            groups = {},
            lookups = [],
            projectResultData = {}

        if(this.options.search){
            addSearchStringToMatch(this.options.search, match)
        }

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
                for (const idFilter of idFilters) {
                    await addFilterToMatch({
                        filterKey: '_id',
                        filterValue: idFilter.value,
                        filterOptions: idFilter,
                        type: 'ID',
                        match,
                        db:this.db,
                        debugInfo: this.debugInfo
                    })
                }
            }

            if (includeUserFilter && (filters.parts.createdBy || filters.parts['createdBy.username'])) {
                fields.push('createdBy')
            }
        }

        await this.createQueriesForFields(fields, projectResultData, lang, match, filters, groups, lookups, typeFields, resultMatch, resultFilters, lookupMatch, lookupFilters);

        if (!projectResult) {
            // also return extra fields
            if (!typeDefinition.noUserRelation && !groups.createdBy) {
                if(!this.options.noUserLookup) {
                    this.createAndAddLookup({type: 'User', name: 'createdBy', multi: false}, lookups, {})
                    groups.createdBy = this.createGroup({name: 'createdBy', multi: false})
                }else{
                    groups.createdBy = {'$first': '$createdBy'}
                }

            }
            groups.modifiedAt = {'$first': '$modifiedAt'}
        }

        // compose result
        let dataQuery = [], dataFacetQuery = []
        this.cleanupMatch(match)
        this.cleanupMatch(resultMatch)
        this.cleanupMatch(lookupMatch)

        const hasMatch = Object.keys(match).length > 0,
            hasResultMatch = Object.keys(resultMatch).length > 0,
            hasLookupMatch = Object.keys(lookupMatch).length > 0


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

        if (this.options.resultLimit) {
            dataFacetQuery.push({$limit: this.options.resultLimit})
        }

        if (includeCount) {
            if (this.options.limitCount) {

                dataQuery.push({$sort: sort})
                dataQuery.push({$skip: offset})
                dataQuery.push({$limit: this.options.limitCount})

                if(!lookupFilters) {
                    dataFacetQuery.push({$skip: 0})
                    dataFacetQuery.push({$limit: limit})
                }

            } else {
                dataFacetQuery.push({$sort: facetSort})
                if(!lookupFilters) {
                    dataFacetQuery.push({$skip: offset})
                    dataFacetQuery.push({$limit: limit})
                }
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


        if (hasLookupMatch) {
            dataFacetQuery.push({$match: lookupMatch})
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


        // add right before the group
        if (this.options.beforeProject) {
            if (this.options.beforeProject.constructor === Array) {
                for (let i = this.options.beforeProject.length - 1; i >= 0; i--) {
                    dataFacetQuery.push(this.options.beforeProject[i])
                }
            } else {
                dataFacetQuery.push(this.options.beforeProject)
            }
        }

        // sort again within the result
        dataFacetQuery.push({$sort: facetSort})

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
        const addFields = {
            $addFields: {limit, offset, page, ...this.options.$addFields}
        }
        if(lookupFilters){
            addFields.$addFields.total = {$size:'$results'}
            addFields.$addFields.results = { $slice: ['$results', offset, limit ] }
        }
        dataQuery.push(addFields)


        return {dataQuery, countQuery, debugInfo: this.debugInfo}

    }

    async createQueriesForFields(fields, projectResultData, lang, match, filters, groups, lookups, typeFields, resultMatch, resultFilters, lookupMatch, lookupFilters) {
        const createdFieldMatches = {}
        const processedFieldNames = []
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i]
            const fieldDefinition = this.createFieldDefinition(field, this.type)
            const fieldName = fieldDefinition.name

            if(!fieldName || processedFieldNames.indexOf(fieldName)>=0){
                continue
            }
            processedFieldNames.push(fieldName)
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
                        const refFieldDefinition = this.createFieldDefinition(refField, fieldDefinition.type)
                        const refFieldName = refFieldDefinition.name

                        if(!refFieldName){
                            continue
                        }

                        if (fieldDefinition.fields) {
                            projectResultData[fieldName + '.' + refFieldName] = 1
                        }

                        if (refFieldDefinition) {

                            let localProjected = false

                            if (refFieldDefinition.fields && !refFieldDefinition.reference) {
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
                    /*addFilterToMatch({
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

                    if (lookup && lookup.$lookup.pipeline) {
                        lookup.$lookup.pipeline.push({$project: projectPipeline})
                    }


                    groups[fieldName] = this.createGroup(fieldDefinition)

                }
                await this.createFilterForField(fieldDefinition, match, {filters})

            } else {
                // regular field
                if (fieldName !== '_id' && !createdFieldMatches[fieldName]) {
                    createdFieldMatches[fieldName] = true
                    groups[fieldName] = {'$first': '$' + fieldName}
                    if (typeFields[fieldName]) {
                        await this.createFilterForField(fieldDefinition, match, {filters})
                        await this.createFilterForField(fieldDefinition, resultMatch, {filters: resultFilters})
                        await this.createFilterForField(fieldDefinition, lookupMatch, {filters: lookupFilters})
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
