import {ObjectId} from 'mongodb'
import {
    containsFunction,
    collectEqualityFields,
    collectRegexFields,
    pickHintIndex,
    findQueryHint,
    coverableMatchFields,
    pickCoveringIndex,
    findCoveringIndex
} from '../../api/util/queryHint.mjs'

const GENERIC_DATA_INDEXES = [
    {name: '_id_', key: {_id: 1}},
    {name: 'definition_1__id_1', key: {definition: 1, _id: 1}, unique: true},
    {name: 'definition_1_data.$**_1', key: {definition: 1, 'data.$**': 1}},
    {name: 'ownerGroup_1', key: {ownerGroup: 1}},
    {name: 'createdBy_1', key: {createdBy: 1}}
]

const KEY_VALUE_INDEXES = [
    {name: '_id_', key: {_id: 1}},
    {name: 'key_1', key: {key: 1}, unique: true}
]

const collectionWith = (name, indexes) => ({collectionName: name, indexes: async () => indexes})

/* Match from the slow pokerraum admin search ("hobel hero") */
const deepSearchMatch = () => ({
    $and: [
        {$or: [
            {createdBy: {$in: [new ObjectId('6437ceb0a17a2490b3af0c29')]}},
            {ownerGroup: {$in: [new ObjectId('6432781cd6c269c1dec71019')]}}
        ]},
        {definition: {$eq: new ObjectId('643c2a74f759d85edc50e26c')}},
        {$expr: {$function: {body: 'function(){}', args: ['$data', {$literal: ['x']}], lang: 'js'}}}
    ]
})

/* KeyValueGlobal search "imap": the _id scan won although key_1 filters on the keys */
const keyRegexPipeline = () => [
    {$match: {key: {$regex: '[iíìîï]m[aáàâåãä]p', $options: 'i'}}},
    {$sort: {_id: -1}},
    {$limit: 10000},
    {$facet: {results: [{$limit: 10}], count: [{$count: 'count'}]}}
]

describe('queryHint', () => {
    test('detects $function', () => {
        expect(containsFunction(deepSearchMatch())).toBe(true)
        expect(containsFunction({definition: 'x'})).toBe(false)
    })

    test('only top-level / $and equalities count, not $or', () => {
        expect([...collectEqualityFields(deepSearchMatch())]).toEqual(['definition'])
    })

    test('regex fields: $regex and RegExp count, $not does not', () => {
        const match = {$and: [{slug: /^a\//i}, {name: {$regex: 'x', $options: 'i'}}, {other: {$not: {$regex: 'y'}}}]}
        expect([...collectRegexFields(match)]).toEqual(['slug', 'name'])
    })

    test('picks definition_1__id_1 and ignores the wildcard index', () => {
        expect(pickHintIndex(GENERIC_DATA_INDEXES, new Set(['definition']))).toBe('definition_1__id_1')
    })

    test('no index for an unindexed field', () => {
        expect(pickHintIndex(GENERIC_DATA_INDEXES, new Set(['data.name']))).toBe(null)
    })

    test('$function: equality index as hint', async () => {
        const collection = collectionWith('GenericData_t1', GENERIC_DATA_INDEXES)
        expect(await findQueryHint(collection, [{$match: deepSearchMatch()}, {$sort: {data: 1}}]))
            .toEqual({hint: 'definition_1__id_1', reason: 'function'})
        // plain equality match without $function: now the wildcard rule applies
        expect(await findQueryHint(collection, [{$match: {definition: new ObjectId()}}]))
            .toEqual({hint: 'definition_1__id_1', reason: 'wildcard'})
    })

    test('regex on an indexed field with _id sort: that index as hint', async () => {
        const collection = collectionWith('KeyValueGlobal_t1', KEY_VALUE_INDEXES)
        expect(await findQueryHint(collection, keyRegexPipeline())).toEqual({hint: 'key_1', reason: 'regex'})
    })

    test('regex: no hint when sorting by another field', async () => {
        const collection = collectionWith('KeyValueGlobal_t2', KEY_VALUE_INDEXES)
        const pipeline = keyRegexPipeline()
        pipeline[1] = {$sort: {modifiedAt: -1}}
        expect(await findQueryHint(collection, pipeline)).toBe(null)
    })

    test('regex: no hint when an indexed equality exists - the planner decides', async () => {
        const collection = collectionWith('GenericData_t2', [...GENERIC_DATA_INDEXES, {name: 'slug_1', key: {slug: 1}}])
        const pipeline = [{$match: {$and: [{definition: new ObjectId()}, {slug: {$regex: 'x'}}]}}, {$sort: {_id: -1}}]
        expect(await findQueryHint(collection, pipeline)).toBe(null)
    })

    test('regex on an unindexed field: no hint', async () => {
        const collection = collectionWith('KeyValueGlobal_t3', KEY_VALUE_INDEXES)
        expect(await findQueryHint(collection, [{$match: {value: {$regex: 'x'}}}, {$sort: {_id: -1}}])).toBe(null)
    })

    test('a failing listIndexes means no hint, and is retried next time', async () => {
        let calls = 0
        const collection = {collectionName: 'Broken_t', indexes: async () => { calls++; throw new Error('boom') }}
        expect(await findQueryHint(collection, keyRegexPipeline())).toBe(null)
        expect(await findQueryHint(collection, keyRegexPipeline())).toBe(null)
        expect(calls).toBe(2)
    })
})

describe('covering index for a separate count', () => {
    test('equality and range conditions are coverable', () => {
        const fields = coverableMatchFields({$and: [{definition: new ObjectId()}, {_id: {$lt: new ObjectId()}}]})
        expect([...fields]).toEqual(['definition', '_id'])
    })

    test('regex, $or, $expr and $exists are not', () => {
        expect(coverableMatchFields({slug: {$regex: 'x'}})).toBe(null)
        expect(coverableMatchFields({$or: [{a: 1}, {b: 1}]})).toBe(null)
        expect(coverableMatchFields({$expr: {$eq: ['$a', 1]}})).toBe(null)
        expect(coverableMatchFields({a: {$exists: true}})).toBe(null)
        expect(coverableMatchFields({})).toBe(null)
    })

    test('blog match is covered by definition_1__id_1, not by the wildcard index', () => {
        expect(pickCoveringIndex(GENERIC_DATA_INDEXES, new Set(['definition']))).toBe('definition_1__id_1')
    })

    test('a field outside the index key means not covered', () => {
        expect(pickCoveringIndex(GENERIC_DATA_INDEXES, new Set(['definition', 'modifiedAt']))).toBe(null)
    })

    test('findCoveringIndex end to end', async () => {
        const collection = collectionWith('GenericData_t3', GENERIC_DATA_INDEXES)
        expect(await findCoveringIndex(collection, {definition: new ObjectId()})).toBe('definition_1__id_1')
        expect(await findCoveringIndex(collection, deepSearchMatch())).toBe(null)
    })
})

describe('hidden indexes', () => {
    const indexes = [
        {name: '_id_', key: {_id: 1}},
        {name: 'group_1', key: {group: 1}, hidden: true},
        {name: 'group_1_mimeType_1', key: {group: 1, mimeType: 1}},
        {name: 'key_1', key: {key: 1}, hidden: true}
    ]

    test('are never used as hint', () => {
        expect(pickHintIndex(indexes, new Set(['group']))).toBe('group_1_mimeType_1')
        expect(pickHintIndex(indexes, new Set(['key']))).toBe(null)
    })

    test('are never used as covering index', () => {
        expect(pickCoveringIndex(indexes, new Set(['group']))).toBe('group_1_mimeType_1')
        expect(pickCoveringIndex(indexes, new Set(['key']))).toBe(null)
    })
})

describe('wildcard index without path bound', () => {
    const indexes = GENERIC_DATA_INDEXES
    const def = () => ({definition: {$eq: new ObjectId('643c2a74f759d85edc50e26c')}})

    test('only negations on data.*: plain equality index as hint (pokerhelden title list)', async () => {
        const pipeline = [{$match: {$and: [def(), {'data.status': {$ne: 'private'}}]}}, {$limit: 10000}]
        expect(await findQueryHint(collectionWith('GD_w1', indexes), pipeline))
            .toEqual({hint: 'definition_1__id_1', reason: 'wildcard'})
    })

    test('a bounding condition on data.* leaves the choice to the planner', async () => {
        const eq = [{$match: {$and: [def(), {'data.status': 'public'}]}}]
        const range = [{$match: {$and: [def(), {'data.datumzeit': {$gte: 0}}]}}]
        const inOr = [{$match: {$and: [def(), {$or: [{'data.teilnehmer': 'x'}, {'data.teilnehmer._id': 'x'}]}]}}]
        const negInOr = [{$match: {$and: [def(), {$or: [{'data.a': {$ne: 1}}, {'data.b': {$ne: 2}}]}]}}]
        for (const pipeline of [eq, range, inOr, negInOr]) {
            expect(await findQueryHint(collectionWith('GD_w2', indexes), pipeline)).toBe(null)
        }
    })

    test('no hint when sorting by a wildcard path or by another field', async () => {
        const byData = [{$match: {$and: [def(), {'data.status': {$ne: 'private'}}]}}, {$sort: {'data.datumzeit': -1}}]
        const byModified = [{$match: def()}, {$sort: {modifiedAt: -1}}]
        expect(await findQueryHint(collectionWith('GD_w3', indexes), byData)).toBe(null)
        expect(await findQueryHint(collectionWith('GD_w3', indexes), byModified)).toBe(null)
    })

    test('no hint with $expr, or when there is no wildcard index', async () => {
        const expr = [{$match: {$and: [def(), {$expr: {$gt: ['$data.a', 1]}}]}}]
        expect(await findQueryHint(collectionWith('GD_w4', indexes), expr)).toBe(null)
        const plainOnly = indexes.filter(i => !i.name.includes('$**'))
        expect(await findQueryHint(collectionWith('GD_w5', plainOnly), [{$match: def()}])).toBe(null)
    })
})
