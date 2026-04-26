import Util from '../../util/index.mjs'
import { getType } from '../../../util/types.mjs'
import { getFormFieldsByType } from '../../../util/typesAdmin.mjs'
import config from '../../../gensrc/config.mjs'
import Hook from '../../../util/hook.cjs'
import {
    addFilterToMatchV2,
    addSearchStringToMatch,
    makeAllMatchAnAndMatch
} from '../../util/dbquery.mjs'


export default class AggregationBuilderV2 {

    constructor(type, fields, db, options) {
        this.type = type
        this.fields = fields
        this.db = db
        this.options = options
    }

    // ─── Pagination helpers ───────────────────────────────────────────────────

    getLimit() {
        const { limit } = this.options
        return limit ? parseInt(limit) : 10
    }

    getOffset() {
        const { offset, page } = this.options
        if (offset) return offset
        if (page && page > 0) return (page - 1) * this.getLimit()
        return 0
    }

    getPage() {
        return this.options.page || 1
    }

    /** Parses the sort option string (e.g. "field1 asc, field2 desc") into a MongoDB sort object. */
    getSort() {
        const { sort, lang } = this.options;
        if (!sort) return { _id: -1 };
        if (typeof sort !== 'string') return sort;

        const typeFields = getFormFieldsByType(this.type);
        const sortObj = {};

        sort.split(',').forEach(val => {
            const [rawField, direction = 'asc'] = val.trim().split(/\s+/);
            const isLocalized = rawField.indexOf('.') < 0 && typeFields?.[rawField]?.localized;
            const fieldName = isLocalized ? `${rawField}.${lang}` : rawField;
            sortObj[fieldName] = direction.toLowerCase() === 'desc' ? -1 : 1;
        });

        return sortObj;
    }

    /** Parses a filter string into a structured filter object. Returns undefined if no filter given. */
    getParsedFilter(filterStr) {

        return filterStr ? Util.parseFilterV2(filterStr) : undefined
    }

    // ─── Lookup (MongoDB $lookup / join) ─────────────────────────────────────

    /**
     * Creates a $lookup stage and pushes it onto the lookups array.
     * For localized fields, a separate lookup is created for each configured language.
     */
    createAndAddLookup({ type, name, multi, localized }, lookups, { usePipeline, language }) {

        if (lookups.some(l => l.$lookup.from === type && l.$lookup.localField === name)) {
            return
        }

        // Localized fields: create one lookup per language
        if (localized) {
            for (const lang of config.LANGUAGES) {
                this.createAndAddLookup({ type, name, multi }, lookups, { usePipeline, language: lang })
            }
            return {}
        }

        let lookup

        if (usePipeline) {
            // Pipeline-based lookup: supports multi-value (array) and single-value references
            const $expr = multi
                ? {
                    $in: [
                        '$_id',
                        {
                            $cond: {
                                if: { $isArray: `$$${name}` },
                                then: `$$${name}`,
                                else: [`$$${name}`]
                            }
                        }
                    ]
                }
                : { $eq: ['$_id', `$$${name}`] }

            lookup = {
                $lookup: {
                    from: type,
                    as: name,
                    let: { [name]: `$${name}` },
                    pipeline: [{ $match: { $and: [{ $expr }] } }]
                }
            }
        } else {
            // Simple lookup without pipeline
            lookup = {
                $lookup: {
                    from: type,
                    localField: language ? `${name}.${language}` : name,
                    foreignField: '_id',
                    as: language ? `${name}_${language}` : name
                }
            }
        }

        lookups.push(lookup)
        return lookup
    }

    /**
     * Builds the $group expression for a single field.
     * Localized reference fields are grouped per language into a sub-document.
     */
    createGroup({ name, multi, localized, reference }) {
        if (reference && localized) {
            // Collect each language variant into a single grouped object
            const group = { $first: {} }
            for (const lang of config.LANGUAGES) {
                group.$first[lang] = `$${name}_${lang}`
            }
            return group
        }

        const fieldRef = multi ? `$${name}` : { $arrayElemAt: [`$${name}`, 0] }
        return { $first: fieldRef }
    }

    // ─── Filter / match building ──────────────────────────────────────────────

    /**
     * Adds filter conditions for a single field to the given match object.
     * Handles localized fields, reference fields, vague (full-text) search,
     * and nested Object fields.
     *
     * Returns true if at least one match condition was added.
     */
    async createFilterForField(
        { name, subQuery, reference, type, multi, localized, searchable, vagueSearchable },
        match,
        { exact, filters }
    ) {
        if (!filters || searchable === false) return

        // ── Localized fields: recurse per language and merge results into match.$or ──
        if (localized) {
            const localizedMatch = {}

            for (const lang of config.LANGUAGES) {
                await this.createFilterForField(
                    { name: `${name}.${lang}`, subQuery, reference },
                    localizedMatch,
                    { exact, filters }
                )
            }

            // Group per-language conditions and merge them into the parent match
            if (localizedMatch?.$and?.length > 0) {
                const allMatches = [
                    ...(localizedMatch.$or ?? []),
                    ...localizedMatch.$and
                ]

                // Group individual match conditions by their top-level key
                const byLang = {}
                allMatches.forEach(m => {
                    const key = Object.keys(m)[0]
                    if (!byLang[key]) byLang[key] = []
                    byLang[key].push(m)
                })

                match.push({$or:Object.keys(byLang).map(key => ({ $and: byLang[key] }))})
            } else if (localizedMatch?.$or?.length > 0) {
                match.push({$or:localizedMatch.$or})
            }
            return
        }

        // ── Resolve the matching filter part for this field ──
        const filterKey = name + (subQuery ? `.${subQuery.name}` : '')

        let filterPart = filters.parts[filterKey]
        if (!filterPart && reference)  filterPart = filters.parts[`${filterKey}._id`]
        if (!filterPart && !exact)     filterPart = filters.parts[filterKey.split('.')[0]]

        // ── Explicit filter on this specific field ──
        if (filterPart) {
            const filterPartArray = filterPart.constructor === Array ? filterPart : [filterPart]

            for (const filterPartItem of filterPartArray) {
                await addFilterToMatchV2({
                    filterKey: name,
                    subQuery,
                    filterValue: filterPartItem.value,
                    filterOptions: filterPartItem,
                    type: reference ? 'ID' : type,
                    multi,
                    match,
                    db: this.db,
                    debugInfo: this.debugInfo
                })
            }

        } else if (type === 'Object') {
            // ── Object fields: check for nested sub-key filters (e.g. "meta.author") ──
            for (const partFilterKey of Object.keys(filters.parts)) {
                if (!partFilterKey.startsWith(`${filterKey}.`)) continue

                filterPart = filters.parts[partFilterKey]
                const filterPartArray = filterPart.constructor === Array ? filterPart : [filterPart]

                for (const filterPartItem of filterPartArray) {

                    await addFilterToMatchV2({
                        filterKey: partFilterKey,
                        subQuery,
                        filterValue: filterPartItem.value,
                        filterOptions: filterPartItem,
                        match,
                        db: this.db,
                        debugInfo: this.debugInfo
                    })
                }
            }
        }

        // ── Vague (full-text / rest) search – skipped for exact, reference, and Boolean fields ──
        const isVagueEligible =
            !exact &&
            !reference &&
            vagueSearchable !== false &&
            type !== 'Boolean' &&
            (type !== 'Object' || vagueSearchable === true)

        if (isVagueEligible) {
            let count = 0
            for (const restFilter of filters.rest) {
                const restMatch = []
                await addFilterToMatchV2({
                    filterKey,
                    subQuery,
                    filterValue: restFilter.value,
                    filterOptions: restFilter,
                    type,
                    multi,
                    match: restMatch,
                    db: this.db,
                    debugInfo: this.debugInfo
                })

                if(restMatch.length === 0) continue

                if (!match.$$restQuery) match.$$restQuery = []
                if (!match.$$restQuery[count]) {
                    match.$$restQuery.push({ $: [], operator: filters.operator })
                }
                match.$$restQuery[count].$.push(...restMatch)
                count++
            }
        }
    }

    // ─── Field definition ─────────────────────────────────────────────────────

    /**
     * Normalises the various shorthand field formats into a unified field definition object.
     *
     * Supported input formats:
     *   - Plain string:            "title"
     *   - Localised string:        "title.localized"
     *   - Reference shorthand:     "image$Media" or "tags$[Tag]"
     *   - Object with array value: { categories: ['name', 'slug'] }
     *   - Object with options:     { title: { localized: true } }
     */
    createFieldDefinition(fieldData, type) {
        const typeFields = getFormFieldsByType(type)
        let fieldDefinition = {}

        if (fieldData.constructor === Object) {
            const [fieldName] = Object.keys(fieldData)
            if (fieldName) {
                fieldDefinition.name = fieldName
                let data = fieldData[fieldName]

                // Dot-notation key (e.g. { "categories.name": [...] }) – split into name + sub-fields
                if (fieldDefinition.name.indexOf('.') > 0) {
                    const [parent, child] = fieldDefinition.name.split('.')
                    fieldDefinition.name = parent
                    data = [child]
                }

                if (data.constructor === Array) {
                    // Reference field with explicit sub-fields to project
                    fieldDefinition.fields = data
                } else {
                    if (data.localized) fieldDefinition.projectLocal = true
                    if (data.substr) {
                        fieldDefinition.projectLocal = true
                        fieldDefinition.substr = data.substr
                    }
                }
            }

        } else if (fieldData.indexOf('$') > 0) {
            // Reference shorthand: "image$Media" or "tags$[Tag]"
            const [refName, refType] = fieldData.split('$')
            fieldDefinition.name = refName
            if (refType.startsWith('[')) {
                fieldDefinition.multi = true
                fieldDefinition.type = refType.slice(1, -1)
            } else {
                fieldDefinition.multi = false
                fieldDefinition.type = refType
            }

        } else {
            // Plain string, optionally suffixed with ".localized"
            if (fieldData.endsWith('.localized')) {
                fieldDefinition.projectLocal = true
                fieldDefinition.name = fieldData.split('.')[0]
            } else {
                fieldDefinition.name = fieldData
            }
        }

        // Merge with the type's schema definition (schema takes lower priority than explicit values)
        if (typeFields?.[fieldDefinition.name]) {
            fieldDefinition.existsInDefinition = true
            for (const key of Object.keys(typeFields[fieldDefinition.name])) {
                if (fieldDefinition[key] === undefined) {
                    fieldDefinition[key] = typeFields[fieldDefinition.name][key]
                }
            }
        } else if (fieldDefinition.name === 'createdBy') {
            // Built-in virtual reference to the User type
            fieldDefinition.reference = true
            fieldDefinition.type = 'User'
        }

        if(fieldDefinition.name === '_id') {
            fieldDefinition.type = 'ID'
            fieldDefinition.existsInDefinition = true
        }

        return fieldDefinition
    }

    // ─── Projection helpers ───────────────────────────────────────────────────

    /**
     * Recursively builds a MongoDB projection object for a reference field
     * that exposes only the specified sub-fields.
     */
    projectByField(fieldName, fields, projectResultData) {
        for (const subField of fields) {
            if (!subField) continue

            if (subField.constructor === Object) {
                const [key] = Object.keys(subField)
                if (key) {
                    if (subField[key].$map) {
                        // Inline $map expression – use as-is
                        projectResultData[`${fieldName}.${key}`] = subField[key]
                    } else {
                        // Nested object – recurse
                        this.projectByField(`${fieldName}.${key}`, subField[key], projectResultData)
                    }
                }
            } else {
                projectResultData[`${fieldName}.${subField}`] = 1
            }
        }
    }

    // ─── Main query builder ───────────────────────────────────────────────────

    /** Builds and returns the full MongoDB aggregation pipeline (dataQuery) and a count pipeline (countQuery). */
    async query() {
        this.startTimeAggregate = Date.now()
        this.debugInfo = []

        const typeDefinition = getType(this.type) || {}

        const {projectResult, includeCount, returnDocumentSize} = this.options

        const limit      = this.getLimit()
        const offset     = this.getOffset()
        const page       = this.getPage()
        const sort       = this.getSort()
        // Ensure the facet sort always has a stable tiebreaker on _id
        const facetSort  = sort._id ? sort : { ...sort, _id: -1 }
        const typeFields = getFormFieldsByType(this.type, true)
        const filters        = this.getParsedFilter(this.options.filter)
        const resultFilters  = this.getParsedFilter(this.options.resultFilter)
        const lookupFilters  = this.getParsedFilter(this.options.lookupFilter)

        let match        = Object.assign({ $and: [] }, this.options.match)
        let resultMatch  = { $and: [] }
        let lookupMatch  = { $and: [] }
        let groups       = {}
        let lookups      = []
        let projectResultData = {}

        // Apply full-text search string to the root match
        if (this.options.search) {
            makeAllMatchAnAndMatch(match)
            addSearchStringToMatch(this.options.search, match)
        }
        makeAllMatchAnAndMatch(match)

        // Run pre-query hooks (e.g. injecting tenant filters)
        const aggHook = Hook.hooks['AggregationBuilderBeforeQuery']
        if (aggHook?.length) {
            for (const hook of aggHook) {
                await hook.callback({ filters, type: this.type, db: this.db })
            }
        }

        // copy fields
        const fields = this.fields.slice(0)

        try {
            const matches = await this.createQueriesForFieldsRecursive(
                fields, projectResultData, groups, lookups,
                typeFields, filters, resultFilters, lookupFilters
            )

           if (matches.match.length > 0) {
               console.log('xxxxxx', JSON.stringify(matches.match, null, 2))
                match.$and.push(...matches.match)
            }
            if (matches.resultMatch.length > 0) {
                resultMatch.$and.push(...matches.lookupMatch)
            }
            if (matches.lookupMatch.length > 0) {
                lookupMatch.$and.push(...matches.lookupMatch)
            }
        }catch (e) {
            console.log('AggregationBuilderV2: error', e)
        }
        //console.log('xxxxxx', JSON.stringify(match, null, 2))

        // Always include createdBy and modifiedAt unless the caller controls the projection
        if (!projectResult) {
            if (!typeDefinition.noUserRelation && !groups.createdBy) {
                if (!this.options.noLookupFields || this.options.noLookupFields.indexOf('createdBy') < 0) {
                    this.createAndAddLookup({ type: 'User', name: 'createdBy', multi: false }, lookups, {})
                    groups.createdBy = this.createGroup({ name: 'createdBy', multi: false })
                } else {
                    groups.createdBy = { $first: '$createdBy' }
                }
            }
            groups.modifiedAt = { $first: '$modifiedAt' }
        }

        // ── Assemble the aggregation pipeline ──
        let dataQuery      = []
        let dataFacetQuery = []

        this.cleanupMatch(match)
        this.cleanupMatch(resultMatch)
        this.cleanupMatch(lookupMatch)

        const hasMatch       = Object.keys(match).length > 0
        const hasResultMatch = Object.keys(resultMatch).length > 0
        const hasLookupMatch = Object.keys(lookupMatch).length > 0

        if (hasMatch) {
            dataQuery.push({ $match: match })
        }

        // Inject optional pipeline stages after the root match
        if (this.options.afterRootMatch) {
            const stages = this.options.afterRootMatch
            dataQuery.push(...(stages.constructor === Array ? stages : [stages]))
        }

        if (hasResultMatch) {
            dataFacetQuery.push({ $match: resultMatch })
        }

        if (this.options.resultLimit) {
            dataFacetQuery.push({ $limit: this.options.resultLimit })
        }

        // Sorting and pagination – two modes depending on whether a count is needed
        if (includeCount) {
            if (this.options.limitCount) {
                // Pre-limit the dataset before the facet split
                dataQuery.push({ $sort: sort }, { $skip: offset }, { $limit: this.options.limitCount })
                if (!lookupFilters) {
                    dataFacetQuery.push({ $skip: 0 }, { $limit: limit })
                }
            } else {
                dataFacetQuery.push({ $sort: facetSort })
                if (!lookupFilters) {
                    dataFacetQuery.push({ $skip: offset }, { $limit: limit })
                }
            }
        } else {
            dataQuery.push({ $sort: sort }, { $skip: offset }, { $limit: limit })
        }

        // Add any caller-provided lookups and the built-in field lookups
        if (this.options.lookups) lookups.push(...this.options.lookups)
        for (const lookup of lookups) dataFacetQuery.push(lookup)

        if (hasLookupMatch) {
            dataFacetQuery.push({ $match: lookupMatch })
        }

        // Inject optional stages before the $group
        if (this.options.before) {
            const stages = this.options.before
            const stageArray = stages.constructor === Array ? stages : [stages]
            for (let i = stageArray.length - 1; i >= 0; i--) {
                dataFacetQuery.unshift(stageArray[i])
            }
        }

        if (this.options.beforeGroup) {
            dataFacetQuery.push(this.options.beforeGroup)
        }

        // Re-group documents by _id after lookups have been applied
        dataFacetQuery.push({
            $group: {
                _id: '$_id',
                ...groups,
                ...this.options.group
            }
        })

        const countQuery = [...dataQuery, { $count: 'count' }]

        // Inject optional stages before $project
        if (this.options.beforeProject) {
            const stages = this.options.beforeProject
            const stageArray = stages.constructor === Array ? stages : [stages]
            for (let i = stageArray.length - 1; i >= 0; i--) {
                dataFacetQuery.push(stageArray[i])
            }
        }

        // Final sort within the facet result
        dataFacetQuery.push({ $sort: facetSort })

        // Apply projection if requested or if document size measurement is needed
        if (projectResult || returnDocumentSize) {
            if (!projectResultData._id) projectResultData._id = 0

            if (this.options.group) {
                Object.keys(this.options.group).forEach(k => { projectResultData[k] = 1 })
            }
            if (this.options.project) {
                Object.keys(this.options.project).forEach(k => {
                    if (this.options.project[k] === null) {
                        delete projectResultData[k]
                    } else {
                        projectResultData[k] = this.options.project[k]
                    }
                })
            }
            if (returnDocumentSize) {
                projectResultData.size_bytes = { $bsonSize: '$$ROOT' }
            }

            dataFacetQuery.push({ $project: projectResultData })

            if (this.options.afterProject) {
                const stages = this.options.afterProject
                const stageArray = stages.constructor === Array ? stages : [stages]
                for (let i = stageArray.length - 1; i >= 0; i--) {
                    dataFacetQuery.push(stageArray[i])
                }
            }
        }

        // Wrap both sub-pipelines in a $facet stage to get results and count in one round-trip
        const facet = {
            $facet: {
                results: dataFacetQuery,
                ...this.options.$facet
            }
        }

        if (includeCount) {
            facet.$facet.count = [{ $count: 'count' }]
            if (hasResultMatch) facet.$facet.count.unshift({ $match: resultMatch })
        }

        dataQuery.push(facet)

        // Append pagination metadata and optionally slice results (when lookupFilters are active)
        const addFields = {
            $addFields: { limit, offset, page, ...this.options.$addFields }
        }
        if (lookupFilters) {
            addFields.$addFields.total   = { $size: '$results' }
            addFields.$addFields.results = { $slice: ['$results', offset, limit] }
        }
        dataQuery.push(addFields)

        console.log(`AggregationBuilderV2: Aggregation time for ${this.type} query ${Date.now()-this.startTimeAggregate}ms`)

        return { dataQuery, countQuery, debugInfo: this.debugInfo }
    }

    // ─── Field query orchestration ────────────────────────────────────────────


    /**
     * Recursively processes each field and builds the corresponding
     * $lookup, $group, $match, and $project fragments.
     */
    async createQueriesForFieldsRecursive(
        fields, projectResultData, groups, lookups,
        typeFields, filters, resultFilters, lookupFilters,
        level = 1
    ) {
        const processedFields = new Set();
        const createdFieldMatches = new Set();
        let match = [], lookupMatch = [], resultMatch = [];

        // 1. Initial setup for missing fields
        await this.addMissingFieldsFromFilters(filters, fields, match);

        // 2. Main field processing loop
        for (const field of fields) {
            const fieldDef = this.createFieldDefinition(field, this.type);
            const fieldName = fieldDef.name;

            if (!fieldName || processedFields.has(field)) continue;
            processedFields.add(field);

            if (fieldDef.reference) {
                await this._processReferenceField(
                    fieldDef, fieldName,
                    projectResultData, match, filters, groups, lookups
                );
            } else {
                await this._processRegularField(
                    fieldDef, fieldName, createdFieldMatches,
                    groups, match, resultMatch, lookupMatch,
                    filters, resultFilters, lookupFilters, typeFields
                );

                // Handle field projections
                this._applyProjection(fieldName, fieldDef, projectResultData);
            }
        }


        // 3. Process residual queries ($$restQuery)
        if (match.$$restQuery?.length > 0) {
            const restPart = this._buildRestQuery(match.$$restQuery);
            if (restPart) match.push(restPart);
            delete match.$$restQuery;
        }

        // 4. Handle nested filter groups (Recursive)
        if (filters?.groups?.length > 0) {
            for (const groupFilter of filters.groups) {
                const groupResult = await this.createQueriesForFieldsRecursive(
                    fields, projectResultData, groups, lookups,
                    typeFields, groupFilter, resultFilters, lookupFilters,
                    level + 1
                );

                if (!groupResult.match?.length) continue;

                // Wrap group results based on operator (AND/OR)
                const operator = `$${groupFilter.operator || 'and'}`;

                // Merge into current match level
                this._mergeMatch(match, groupResult.match, operator, filters.operator);
                this._mergeMatch(resultMatch, groupResult.resultMatch, operator, filters.operator);
                this._mergeMatch(lookupMatch, groupResult.lookupMatch, operator, filters.operator);
            }
        }

        // 5. Final wrap for parent OR context
        match = this.wrapWithOrIfNecessary(filters, match)
        resultMatch = this.wrapWithOrIfNecessary(resultFilters, resultMatch)
        lookupMatch = this.wrapWithOrIfNecessary(lookupFilters, lookupMatch)

        return { match, resultMatch, lookupMatch }
    }

    wrapWithOrIfNecessary(filters, match) {
        if (filters?.operator === 'or' && match.length > 1) {
            match = [{$or: match}];
        }
        return match;
    }

    /**
     * Helper: Merges group results into the main match array
     */
    _mergeMatch(match, newMatch, operator, parentOperator) {

        const newMatchFlat = newMatch.length === 1
            ? newMatch[0]
            : { [operator]: newMatch };


        if (parentOperator === 'or') {
            if (match.length > 0 && match[0].$or) {
                match[0].$or.push(newMatchFlat);
            } else if (match.length > 0) {
                // Re-wrap existing content into $or
                const existing = [...match];
                match.length = 0;
                match.push({ $or: [...existing, newMatchFlat] });
            } else {
                match.push(newMatchFlat);
            }
        } else {
            match.push(newMatchFlat);
        }
    }

    /**
     * Helper: Processes regular (non-reference) fields
     */
    async _processRegularField(fieldDef, fieldName, createdSet, groups, match, resM, lookM, f, resF, lookF, typeFields) {
        if (createdSet.has(fieldName)) return;
        createdSet.add(fieldName);

        if (fieldDef.dynamic?.action === 'alias' && fieldDef.dynamic.path) {
            const aliasRoot = fieldDef.dynamic.path.split('.')[0];
            groups[aliasRoot] = { $first: `$${aliasRoot}` };
            await this.createFilterForField({ ...fieldDef, name: fieldDef.dynamic.path }, match, { filters: f });
        } else {
            if (fieldName !== '_id') groups[fieldName] = { $first: `$${fieldName}` };

            if (typeFields?.[fieldName] || fieldName === '_id') {
                await this.createFilterForField(fieldDef, match, { filters: f });
                await this.createFilterForField(fieldDef, resM,  { filters: resF });
                await this.createFilterForField(fieldDef, lookM, { filters: lookF });
            }
        }
    }
    /**
     * Handles the full lookup/group/filter setup for a reference field.
     * Extracted from createQueriesForFieldsRecursive to keep that method readable.
     */
    async _processReferenceField(
        fieldDefinition, fieldName,
        projectResultData, match, filters, groups, lookups
    ) {
        let refFields      = fieldDefinition.fields
        let projectPipeline = {}
        let usePipeline    = false

        // If no explicit sub-fields are given, derive them from the referenced type's schema
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

                if (!refFieldName) continue

                if (fieldDefinition.fields) {
                    projectResultData[`${fieldName}.${refFieldName}`] = 1
                }

                if (refFieldDefinition) {
                    let localProjected = false

                    if (refFieldDefinition.fields && !refFieldDefinition.reference) {
                        // Nested sub-fields need a pipeline lookup
                        usePipeline = true
                        for (const subRefField of refFieldDefinition.fields) {
                            projectPipeline[`${refFieldName}.${subRefField}`] = 1
                        }
                    } else if (refFieldDefinition.localized && refFieldDefinition.projectLocal) {
                        // Project the localized field in the current language only
                        usePipeline    = true
                        localProjected = true
                        projectPipeline[refFieldName] = `$${refFieldName}.${this.options.lang}`
                    } else {
                        projectPipeline[refFieldName] = 1
                    }

                    if (!refFieldDefinition.reference) {

                        await this.createFilterForField(
                            {
                                name: fieldName,
                                subQuery: { type: fieldDefinition.type, name: refFieldName },
                                reference: false,
                                type: refFieldDefinition.type,
                                localized: refFieldDefinition.localized && !localProjected
                            },
                            match,
                            { exact: true, filters }
                        )
                    }
                }
            }
        }

        // Decide whether a lookup is needed or just a direct projection
        const onlyIdRequested =
            refFields?.length === 1 && refFields[0] === '_id'
        const lookupSuppressed =
            this.options.noLookupFields?.indexOf(fieldName) >= 0

        if (onlyIdRequested || lookupSuppressed) {
            projectResultData[`${fieldName}._id`] = `$${fieldName}`
            groups[fieldName] = { $first: `$${fieldName}` }
        } else {
            const lookup = this.createAndAddLookup(fieldDefinition, lookups, { usePipeline })
            if (lookup?.$lookup?.pipeline) {
                lookup.$lookup.pipeline.push({ $project: projectPipeline })
            }
            groups[fieldName] = this.createGroup(fieldDefinition)
        }
        await this.createFilterForField(fieldDefinition, match, { filters })

    }

    /**
     * Helper: Builds the rest query part
     */
    _buildRestQuery(restQueries) {
        const result = { $or: [], $and: [] };
        for (const q of restQueries) {
            if (q.operator === 'or') {
                result.$or.push(...q.$);
            } else {
                q.$.length === 1 ? result.$and.push(...q.$) : result.$and.push({ $or: q.$ });
            }
        }


        this.cleanupMatch(result);

        // Return null if both are empty to avoid empty objects in match
        if (!Object.keys(result).length) return null;
        return result;
    }

    /**
     * Helper: Handles field projection logic
     */
    _applyProjection(fieldName, fieldDef, projection) {
        if (fieldDef.fields) {
            this.projectByField(fieldName, fieldDef.fields, projection);
        } else if (fieldDef.projectLocal) {
            if (fieldDef.substr) {
                const path = `$${fieldName}${fieldDef.localized ? `.${this.options.lang}` : ''}`;
                projection[fieldName] = { $substrCP: [path, ...fieldDef.substr] };
            } else if (fieldDef.localized) {
                projection[fieldName] = `$${fieldName}.${this.options.lang}`;
            }
        } else {
            projection[fieldName] = 1;
        }
    }



    // ─── Filter utilities ─────────────────────────────────────────────────────

    /**
     * Finds filter keys that reference fields not present in the current field list
     * and adds the corresponding match conditions so they are not silently ignored.
     */
    async addMissingFieldsFromFilters(filters, fields, match) {
        if (!filters?.parts) return

        for (const key of Object.keys(filters.parts)) {
            const [topLevelField] = key.split('.')

            const alreadyIncluded = fields.some(field =>
                    field && (
                        (field.constructor === String && field.split('$')[0] === topLevelField) ||
                        (field.constructor === Object && Object.keys(field)[0] === topLevelField)
                    )
            )
            if (!alreadyIncluded) {
                const fieldDefinition = this.createFieldDefinition(topLevelField, this.type)
                //console.log(`add filter for ${key}`, fieldDefinition)
                if(topLevelField==='createdBy'){
                    if(this.options.includeUserFilter) {
                        fields.push(topLevelField)
                    }
                }else if (fieldDefinition.existsInDefinition) {

                    // TODO fileds.push might be better?
                    await this.createFilterForField(fieldDefinition, match, { filters })
                }else{
                    this.debugInfo.push({ message: `Field ${topLevelField} doesn't exist`, level: 'warn' })
                }
            }
        }
    }

    /** Removes empty or redundant $and/$or clauses from a match object. */
    cleanupMatch(match) {
        // Unwrap single-element $or into $and
        if (match.$or?.length === 1) {
            match.$and = [...(match.$and ?? []), match.$or[0]];
            delete match.$or;
        }

        // Remove empty or missing $or
        if (!match.$or?.length) delete match.$or;

        // Unwrap single-element $and when it's the only key
        if (match.$and?.length === 1 && Object.keys(match).length === 1) {
            Object.assign(match, match.$and[0]);
            delete match.$and;
        }

        // Remove empty $and
        if (match.$and?.length === 0) delete match.$and;
    }
}
