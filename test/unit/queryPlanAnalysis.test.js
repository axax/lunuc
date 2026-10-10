import {
    analyseQueryPlan,
    classifyPredicates,
    fieldOrderFromMatch,
    collectFilterFields,
    isRedundantSuggestion
} from '../../api/util/queryPlanAnalysis.mjs'

const explain = (queryPlanner) => ({stages: [{$cursor: {queryPlanner}}]})
const findingByCode = (findings, code) => findings.find(f => f.code === code)

/* Real plan from the pokerhelden player page: the wildcard index is used, but
   bound to data.datumzeit (which narrows nothing) instead of data.teilnehmer
   (which would narrow 19922 documents down to 125), because only the first
   provides the sort. The $or over two fields is what blocks the good path. */
const PLAYER_PAGE_PIPELINE = [
    {$match: {$and: [
        {definition: {$eq: '643c2a74f759d85edc50e26c'}},
        {'data.status': {$not: /priv/i}},
        {'data.datumzeit': {$gte: 0}},
        {'data.datumzeit': {$lte: 4944619358028}},
        {$or: [
            {'data.teilnehmer._id': {$in: ['659573f78fdcf0ef55defdae']}},
            {'data.teilnehmer': {$in: ['659573f78fdcf0ef55defdae']}}
        ]}
    ]}},
    {$sort: {'data.datumzeit': -1}},
    {$limit: 10000}
]

const PLAYER_PAGE_PLANNER = {
    // parsedQuery is normalised alphabetically - data.datumzeit comes first here
    // although the developer wrote definition first.
    parsedQuery: {$and: [
        {$or: [
            {'data.teilnehmer': {$eq: '659573f78fdcf0ef55defdae'}},
            {'data.teilnehmer._id': {$eq: '659573f78fdcf0ef55defdae'}}
        ]},
        {definition: {$eq: '643c2a74f759d85edc50e26c'}},
        {'data.datumzeit': {$lte: 4944619358028}},
        {'data.datumzeit': {$gte: 0}},
        {'data.status': {$not: {$regex: 'priv', $options: 'i'}}}
    ]},
    winningPlan: {stage: 'LIMIT', inputStage: {stage: 'PROJECTION_SIMPLE', inputStage: {
        stage: 'FETCH',
        filter: {$and: [
            {$or: [
                {'data.teilnehmer': {$eq: '659573f78fdcf0ef55defdae'}},
                {'data.teilnehmer._id': {$eq: '659573f78fdcf0ef55defdae'}}
            ]},
            {'data.status': {$not: {$regex: 'priv', $options: 'i'}}}
        ]},
        inputStage: {stage: 'IXSCAN', indexName: 'definition_1_data.$**_1'}
    }}},
    rejectedPlans: [{}, {}, {}]
}

describe('queryPlanAnalysis', () => {

    describe('fieldOrderFromMatch', () => {
        it('keeps the order the developer wrote, not the normalised one', () => {
            expect(fieldOrderFromMatch(PLAYER_PAGE_PIPELINE)).toEqual([
                'definition', 'data.status', 'data.datumzeit',
                'data.teilnehmer._id', 'data.teilnehmer'
            ])
        })

        it('survives a pipeline without a $match', () => {
            expect(fieldOrderFromMatch([{$sort: {_id: -1}}])).toEqual([])
            expect(fieldOrderFromMatch(undefined)).toEqual([])
        })
    })

    describe('collectFilterFields', () => {
        it('finds field names at any nesting depth', () => {
            const fields = collectFilterFields(PLAYER_PAGE_PLANNER.winningPlan
                .inputStage.inputStage.filter)
            expect(fields).toEqual(['data.teilnehmer', 'data.teilnehmer._id', 'data.status'])
        })

        it('does not trip over a RegExp value', () => {
            expect(collectFilterFields({feld: {$not: /abc/i}})).toEqual(['feld'])
        })
    })

    describe('classifyPredicates', () => {
        it('separates equality, range and $or-blocked fields', () => {
            const {equality, range, orFields} = classifyPredicates(PLAYER_PAGE_PLANNER.parsedQuery)
            expect(equality).toEqual(['definition'])
            expect(range).toEqual(['data.datumzeit'])
            expect(orFields).toEqual(['data.teilnehmer', 'data.teilnehmer._id'])
        })

        it('treats an $or over a single field as an equality, since it stays indexable', () => {
            const {equality, orFields} = classifyPredicates(
                {$or: [{status: {$eq: 'a'}}, {status: {$eq: 'b'}}]})
            expect(equality).toEqual(['status'])
            expect(orFields).toEqual([])
        })

        it('ignores operators that produce no index bounds', () => {
            const {equality, range} = classifyPredicates(
                {$and: [{a: {$eq: 1}}, {b: {$ne: 2}}, {c: {$nin: [3]}}, {d: {$gt: 4}}]})
            expect(equality).toEqual(['a'])
            expect(range).toEqual(['d'])
        })
    })

    describe('analyseQueryPlan on the player page query', () => {
        const findings = analyseQueryPlan(
            explain(PLAYER_PAGE_PLANNER), PLAYER_PAGE_PIPELINE, {documentCount: 19922})

        it('names the residual fields instead of the $and wrapper', () => {
            const residual = findingByCode(findings, 'residualFilter')
            expect(residual.fields).toEqual(['data.teilnehmer', 'data.teilnehmer._id', 'data.status'])
            expect(residual.message).toContain('data.teilnehmer')
            expect(residual.message).not.toContain('$and')
        })

        it('reports the $or as the blocker', () => {
            const or = findingByCode(findings, 'orAcrossFields')
            expect(or.fields).toEqual(['data.teilnehmer', 'data.teilnehmer._id'])
        })

        it('puts definition first and leaves the $or fields out of the key', () => {
            const {suggestedIndex} = findingByCode(findings, 'residualFilter')
            expect(Object.keys(suggestedIndex)).toEqual(['definition', 'data.datumzeit'])
            expect(suggestedIndex).toEqual({definition: 1, 'data.datumzeit': -1})
        })

        it('flags the redundant index candidates', () => {
            expect(findingByCode(findings, 'manyCandidates')).toBeDefined()
        })

        it('does not claim a blocking sort - the index provides the order', () => {
            expect(findingByCode(findings, 'blockingSort')).toBeUndefined()
        })
    })

    describe('analyseQueryPlan, remaining cases', () => {
        it('reports nothing for an optimal plan', () => {
            const planner = {
                parsedQuery: {$and: [{public: {$eq: true}}, {slug: {$eq: 'a/b'}}]},
                winningPlan: {stage: 'LIMIT', inputStage: {stage: 'FETCH',
                    inputStage: {stage: 'IXSCAN', indexName: 'public_1_slug_1__id_-1'}}},
                rejectedPlans: [{}, {}]
            }
            expect(analyseQueryPlan(explain(planner), [{$sort: {_id: -1}}],
                {documentCount: 500000})).toEqual([])
        })

        it('suggests an ESR key for a collection scan with a sort', () => {
            const planner = {
                parsedQuery: {$and: [{status: {$eq: 'open'}}, {betrag: {$gt: 100}}]},
                winningPlan: {stage: 'SORT', sortPattern: {createdAt: -1},
                    inputStage: {stage: 'COLLSCAN'}},
                rejectedPlans: []
            }
            const pipeline = [{$match: {$and: [{status: 'open'}, {betrag: {$gt: 100}}]}},
                {$sort: {createdAt: -1}}]
            const findings = analyseQueryPlan(explain(planner), pipeline, {documentCount: 250000})

            expect(findingByCode(findings, 'collscan').suggestedIndex)
                .toEqual({status: 1, createdAt: -1, betrag: 1})
            expect(findingByCode(findings, 'blockingSort')).toBeDefined()
        })

        it('stays quiet on a small collection', () => {
            const planner = {
                parsedQuery: {a: {$eq: 1}},
                winningPlan: {stage: 'COLLSCAN'}, rejectedPlans: []
            }
            expect(analyseQueryPlan(explain(planner), [], {documentCount: 200})).toEqual([])
        })

        it('reads the SBE plan shape', () => {
            const planner = {
                parsedQuery: {kunde: {$eq: 'x'}},
                winningPlan: {queryPlan: {stage: 'COLLSCAN'}, slotBasedPlan: {}},
                rejectedPlans: []
            }
            expect(findingByCode(analyseQueryPlan(explain(planner), [], {documentCount: 50000}),
                'collscan')).toBeDefined()
        })

        it('flags server-side javascript as unindexable', () => {
            const planner = {
                parsedQuery: {$and: [{definition: {$eq: 'x'}},
                    {$expr: {$function: {body: 'function(){}'}}}]},
                winningPlan: {stage: 'IXSCAN'}, rejectedPlans: []
            }
            expect(findingByCode(analyseQueryPlan(explain(planner), [], {documentCount: 80000}),
                'notIndexable')).toBeDefined()
        })

        it('returns nothing for an unusable explain', () => {
            expect(analyseQueryPlan({}, [])).toEqual([])
            expect(analyseQueryPlan(undefined, undefined)).toEqual([])
        })
    })
})

/* KeyValueGlobal search "imap" (175 documents, 2.5 s): the _id scan fetches
   every document and filters afterwards, key_1 would filter on the index keys. */
const KEY_REGEX = {$regex: '[iíìîï]m[aáàâåãä]p', $options: 'i'}
const KEY_VALUE_EXPLAIN = explain({
    parsedQuery: {key: KEY_REGEX},
    winningPlan: {
        stage: 'LIMIT',
        inputStage: {
            stage: 'PROJECTION_SIMPLE',
            inputStage: {
                stage: 'FETCH', filter: {key: KEY_REGEX},
                inputStage: {stage: 'IXSCAN', keyPattern: {_id: 1}, indexName: '_id_', direction: 'backward',
                    indexBounds: {_id: ['[MaxKey, MinKey]']}}
            }
        }
    },
    rejectedPlans: [{
        stage: 'PROJECTION_SIMPLE',
        inputStage: {
            stage: 'SORT', sortPattern: {_id: -1},
            inputStage: {
                stage: 'FETCH',
                inputStage: {stage: 'IXSCAN', filter: {key: KEY_REGEX}, keyPattern: {key: 1}, indexName: 'key_1',
                    indexBounds: {key: ['["", {})', '[/[iíìîï]m[aáàâåãä]p/i, /[iíìîï]m[aáàâåãä]p/i]']}}
            }
        }
    }]
})
const KEY_VALUE_PIPELINE = [{$match: {key: KEY_REGEX}}, {$sort: {_id: -1}}, {$limit: 10000}]

describe('analyseQueryPlan on the KeyValueGlobal regex search', () => {
    const findings = analyseQueryPlan(KEY_VALUE_EXPLAIN, KEY_VALUE_PIPELINE, {documentCount: 175})

    test('reports the rejected plan that filters on the index keys', () => {
        const finding = findingByCode(findings, 'betterPlanRejected')
        expect(finding?.index).toBe('key_1')
    })

    test('does not suggest the _id index that exists anyway', () => {
        expect(findingByCode(findings, 'residualFilter')?.suggestedIndex).toBe(undefined)
    })
})

describe('isRedundantSuggestion', () => {
    test('_id alone is always redundant', () => {
        expect(isRedundantSuggestion({_id: -1}, [])).toBe(true)
    })

    test('a prefix of an existing index, forward or reversed, is redundant', () => {
        expect(isRedundantSuggestion({definition: 1}, [{definition: 1, _id: 1}])).toBe(true)
        expect(isRedundantSuggestion({a: -1, b: -1}, [{a: 1, b: 1}])).toBe(true)
    })

    test('a new key or mixed directions are not', () => {
        expect(isRedundantSuggestion({definition: 1, 'data.name': 1}, [{definition: 1, _id: 1}])).toBe(false)
        expect(isRedundantSuggestion({a: 1, b: -1}, [{a: 1, b: 1}])).toBe(false)
    })
})

/* onyou.ch blog: fine index, but the $facet count reads 3787 documents for 10 results */
const BLOG_EXPLAIN = explain({
    parsedQuery: {definition: {$eq: '5d5e6001234dc4576d191dfd'}},
    winningPlan: {
        stage: 'LIMIT',
        inputStage: {stage: 'FETCH', inputStage: {stage: 'IXSCAN', keyPattern: {definition: 1, _id: 1},
            indexName: 'definition_1__id_1', indexBounds: {definition: ['[x, x]'], _id: ['[MinKey, MaxKey]']}}}
    },
    rejectedPlans: []
})
const BLOG_PIPELINE = [
    {$match: {definition: '5d5e6001234dc4576d191dfd'}},
    {$limit: 10000},
    {$facet: {results: [{$limit: 10}], count: [{$count: 'count'}]}}
]

/* thal.ch search: empty root match, every filter inside the facet */
const FACET_ONLY_EXPLAIN = explain({
    parsedQuery: {},
    winningPlan: {stage: 'LIMIT', inputStage: {stage: 'FETCH', inputStage: {stage: 'IXSCAN', keyPattern: {_id: 1},
        indexName: '_id_', indexBounds: {_id: ['[MaxKey, MinKey]']}}}},
    rejectedPlans: []
})
const FACET_ONLY_PIPELINE = [
    {$sort: {_id: -1}},
    {$limit: 5000},
    {$facet: {results: [{$match: {slug: {$regex: '^digithal/'}}}, {$limit: 10}]}}
]

describe('analyseQueryPlan $facet findings', () => {
    test('reports the facet count reading every match', () => {
        const finding = findingByCode(
            analyseQueryPlan(BLOG_EXPLAIN, BLOG_PIPELINE, {documentCount: 20038, resultTotal: 3787, resultCount: 10}),
            'facetCountReadsAll')
        expect(finding?.resultTotal).toBe(3787)
    })

    test('stays quiet for a small total or a page close to the total', () => {
        const small = analyseQueryPlan(BLOG_EXPLAIN, BLOG_PIPELINE, {resultTotal: 120, resultCount: 10})
        const full = analyseQueryPlan(BLOG_EXPLAIN, BLOG_PIPELINE, {resultTotal: 900, resultCount: 100})
        expect(findingByCode(small, 'facetCountReadsAll')).toBe(undefined)
        expect(findingByCode(full, 'facetCountReadsAll')).toBe(undefined)
    })

    test('stays quiet without a facet count (split query)', () => {
        const pipeline = [{$match: {definition: 'x'}}, {$limit: 10}]
        const findings = analyseQueryPlan(BLOG_EXPLAIN, pipeline, {resultTotal: 3787, resultCount: 10})
        expect(findingByCode(findings, 'facetCountReadsAll')).toBe(undefined)
    })

    test('reports filters that only sit inside the facet', () => {
        const findings = analyseQueryPlan(FACET_ONLY_EXPLAIN, FACET_ONLY_PIPELINE, {documentCount: 1254})
        expect(findingByCode(findings, 'filterOnlyInFacet')?.code).toBe('filterOnlyInFacet')
    })

    test('no filterOnlyInFacet when the root match has conditions', () => {
        const findings = analyseQueryPlan(BLOG_EXPLAIN, [{$match: {definition: 'x'}}, ...FACET_ONLY_PIPELINE.slice(1)])
        expect(findingByCode(findings, 'filterOnlyInFacet')).toBe(undefined)
    })
})

describe('analyseQueryPlan unbounded wildcard', () => {
    const planWith = (pathBounds) => explain({
        parsedQuery: {$and: [{definition: {$eq: 'x'}}, {'data.status': {$not: {$eq: 'private'}}}]},
        winningPlan: {stage: 'FETCH', filter: {'data.status': {$not: {$eq: 'private'}}},
            inputStage: {stage: 'IXSCAN', keyPattern: {definition: 1, $_path: 1}, indexName: 'definition_1_data.$**_1',
                indexBounds: {definition: ['[x, x]'], $_path: pathBounds}}},
        rejectedPlans: []
    })

    test('reports a wildcard scan without path bound', () => {
        const findings = analyseQueryPlan(planWith(['[MinKey, MaxKey]']), [{$match: {}}], {documentCount: 20000})
        expect(findingByCode(findings, 'unboundedWildcard')?.index).toBe('definition_1_data.$**_1')
    })

    test('stays quiet when the path is bound', () => {
        const findings = analyseQueryPlan(planWith(['["data.datumzeit", "data.datumzeit"]']), [{$match: {}}], {documentCount: 20000})
        expect(findingByCode(findings, 'unboundedWildcard')).toBe(undefined)
    })
})

describe('isRedundantSuggestion with wildcard indexes', () => {
    const scanForm = {definition: 1, $_path: 1, 'data.datumzeit': 1}
    const definitionForm = {definition: 1, 'data.$**': 1}

    test('prefix + one wildcard path is served by the wildcard index (pokerhelden player page)', () => {
        expect(isRedundantSuggestion({definition: 1, 'data.datumzeit': -1}, [scanForm])).toBe(true)
        expect(isRedundantSuggestion({definition: 1, 'data.ort': 1}, [definitionForm])).toBe(true)
    })

    test('several wildcard paths, another prefix or a field outside the root are not', () => {
        expect(isRedundantSuggestion({definition: 1, 'data.ort': 1, 'data.datumzeit': -1}, [definitionForm])).toBe(false)
        expect(isRedundantSuggestion({createdBy: 1, 'data.ort': 1}, [definitionForm])).toBe(false)
        expect(isRedundantSuggestion({definition: 1, modifiedAt: -1}, [definitionForm])).toBe(false)
    })
})
