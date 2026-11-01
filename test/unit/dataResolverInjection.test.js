/*
 * Values from the request (params, props, referer) are inserted into the JSON text of a data
 * resolver segment. They must not be able to add or override keys - "d" and "$if" are executed
 * as code by the type resolver.
 */
import assert from 'node:assert'
import {templateSegment, findSegmentStructureChange, compileCached} from '../../extensions/cms/util/dataResolverCore.mjs'

const run = (raw, params) => templateSegment(JSON.parse(JSON.stringify(raw)), {
    scope: {params, props: {}, page: {slug: 'x'}}, resolvedData: {}, context: {}, editmode: false, dynamic: false
})

describe('data resolver injection', () => {

    it('normal values are inserted', () => {
        const seg = run({t: 'GenericData', d: ['data'], p: '${params.page || 1}'}, {page: '3'})
        assert.strictEqual(seg.p, '3')
        assert.strictEqual(seg.t, 'GenericData')
    })

    it('a quoted value can not add keys', () => {
        assert.throws(() => run({t: 'GenericData', p: '${params.page || 1}'},
            {page: '1","d":"(()=>{throw new Error(process.env.HOME)})()","x":"'}), /Invalid parameters/)
    })

    it('a quoted value can not override existing keys', () => {
        assert.throws(() => run({t: 'GenericData', d: ['data'], restriction: {type: 'user'}, p: '${params.page || 1}'},
            {page: '1","t":"User","d":["password"],"restriction":null,"x":"'}), /Invalid parameters/)
    })

    it('an unquoted (###) value can not add keys', () => {
        assert.throws(() => run({t: 'GenericData', l: '###${params.l}###'},
            {l: '1,"$if":"process.exit()"'}), /Invalid parameters/)
    })

    it('an unquoted (###) value may become an object or array', () => {
        const seg = run({t: 'GenericData', f: '###${params.f}###'}, {f: '{"a":1}'})
        assert.deepStrictEqual(seg.f, {a: 1})
    })

    it('templated keys are allowed', () => {
        assert.strictEqual(findSegmentStructureChange(
            {t: 'x', "${a?'before':'#'}": [1]}, {t: 'x', before: [1]}), null)
        assert.ok(findSegmentStructureChange(
            {t: 'x', "${a?'before':'#'}": [1]}, {t: 'x', before: [1], d: 'code'}))
    })

    it('static strings with backslashes are not reported', () => {
        assert.strictEqual(findSegmentStructureChange({f: 'a!~/x\\\\sy/'}, {f: 'a!~/x\\sy/'}), null)
    })
})

describe('data resolver code fields', () => {
    it('a templated $if is a value, not code', () => {
        assert.strictEqual(run({t: 'X', $if: '${params.rlist}'}, {rlist: 'process.exit()'}).$if, true)
        assert.strictEqual(run({t: 'X', $if: "${params.page=='orders'}"}, {page: 'x'}).$if, false)
        assert.strictEqual(run({t: 'X', $if: "${params.page=='orders'}"}, {page: 'orders'}).$if, true)
    })
    it('a static $if stays code', () => {
        assert.strictEqual(run({t: 'X', $if: 'data.x', p: '${params.p}'}, {p: '1'}).$if, 'data.x')
    })
    it('a templated d is refused', () => {
        assert.throws(() => run({t: 'X', d: '${params.d}'}, {d: 'process.env'}), /not allowed/)
    })
})

describe('compiled function cache', () => {
    it('returns the same function for the same code', () => {
        const a = compileCached('return 1+1')
        assert.strictEqual(compileCached('return 1+1'), a)
        assert.strictEqual(a(), 2)
        assert.notStrictEqual(compileCached('return 2+2'), a)
    })
})
