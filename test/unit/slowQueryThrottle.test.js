import {ObjectId} from 'mongodb'
import {
    pipelineShape,
    shapeKeyOf,
    claimSlowQueryLog,
    SLOW_QUERY_LOG_INTERVAL_MS
} from '../../extensions/log/slowQueryThrottle.mjs'

const blog = (definition, limit) => [
    {$match: {definition: {$eq: definition}}},
    {$limit: 10000},
    {$facet: {results: [{$limit: limit}], count: [{$count: 'count'}]}}
]

describe('slowQueryThrottle', () => {
    test('same structure with other values gives the same shape', () => {
        const a = shapeKeyOf('GenericData', blog(new ObjectId(), 10))
        const b = shapeKeyOf('GenericData', blog(new ObjectId(), 999))
        expect(a).toBe(b)
    })

    test('another field, operator or collection gives another shape', () => {
        const base = shapeKeyOf('GenericData', blog(new ObjectId(), 10))
        expect(shapeKeyOf('GenericData', [{$match: {slug: {$eq: 'x'}}}])).not.toBe(base)
        expect(shapeKeyOf('GenericData', [{$match: {definition: {$ne: 'x'}}}, {$limit: 1}])).not.toBe(base)
        expect(shapeKeyOf('Media', blog(new ObjectId(), 10))).not.toBe(base)
    })

    test('arrays of values collapse, arrays of stages keep their structure', () => {
        expect(pipelineShape({$in: [1, 2, 3]})).toEqual({$in: '[?]'})
        expect(pipelineShape({$in: [new ObjectId(), new ObjectId()]})).toEqual({$in: '[?]'})
        expect(pipelineShape([{$limit: 1}, {$skip: 2}])).toEqual([{$limit: '?'}, {$skip: '?'}])
    })

    test('first slow run is logged, repeats within the interval are counted', () => {
        const shapes = new Map()
        const t0 = 1_000_000
        const first = claimSlowQueryLog('k', t0, shapes)
        expect(first.suppressed).toBe(0)
        first.done()
        expect(claimSlowQueryLog('k', t0 + 1000, shapes)).toBe(null)
        expect(claimSlowQueryLog('k', t0 + 2000, shapes)).toBe(null)
        const next = claimSlowQueryLog('k', t0 + SLOW_QUERY_LOG_INTERVAL_MS + 1, shapes)
        expect(next.suppressed).toBe(2)
    })

    test('no second explain while one is still running, even after the interval', () => {
        const shapes = new Map()
        const first = claimSlowQueryLog('k', 0, shapes)
        expect(claimSlowQueryLog('k', SLOW_QUERY_LOG_INTERVAL_MS + 1, shapes)).toBe(null)
        first.done()
        expect(claimSlowQueryLog('k', SLOW_QUERY_LOG_INTERVAL_MS * 2 + 2, shapes).suppressed).toBe(1)
    })

    test('different shapes do not throttle each other', () => {
        const shapes = new Map()
        expect(claimSlowQueryLog('a', 0, shapes) !== null).toBe(true)
        expect(claimSlowQueryLog('b', 0, shapes) !== null).toBe(true)
    })
})
