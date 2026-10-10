import Util from '../../api/util/index.mjs'
import {splitArrayValues} from '../../api/util/dbquery.mjs'

const parse = (f) => {
    const r = Util.parseFilterV2(f)
    delete r._parseMs
    return r
}

describe('parseFilterV2 array values', () => {
    test('array value with spaces stays one value (pokerhelden "Interlaken Liga")', () => {
        const r = parse('data.ort==[Interlaken Liga] data.titel==x')
        expect(r.parts['data.ort'].value).toBe('[Interlaken Liga]')
        expect(r.parts['data.titel'].value).toBe('x')
        expect(r.rest).toEqual([])
    })

    test('several array items with spaces', () => {
        expect(parse('data.ort==[Interlaken Liga, Bern]').parts['data.ort'].value).toBe('[Interlaken Liga, Bern]')
    })

    test('unchanged: array without spaces, quoted value, quoted array item', () => {
        expect(parse('data.ort==[Interlaken,Bern]').parts['data.ort'].value).toBe('[Interlaken,Bern]')
        const quoted = parse('data.ort=="Interlaken Liga"').parts['data.ort']
        expect(quoted.value).toBe('Interlaken Liga')
        expect(quoted.inDoubleQuotes).toBe(true)
        expect(parse('data.ort==["Interlaken Liga"]').parts['data.ort'].value).toBe('["Interlaken Liga"]')
    })

    test('unchanged: bracket inside a value, free text in brackets, missing closing bracket', () => {
        const regex = parse('name=~ab[cd] x')
        expect(regex.parts.name.value).toBe('ab[cd]')
        expect(regex.rest).toEqual([{value: 'x', comparator: '='}])
        expect(parse('[foo bar]').rest.map(r => r.value)).toEqual(['[foo', 'bar]'])
        const open = parse('data.ort==[Interlaken Liga')
        expect(open.parts['data.ort'].value).toBe('[Interlaken')
        expect(open.rest).toEqual([{value: 'Liga', comparator: '='}])
    })

    test('unchanged: groups and operators around an array value', () => {
        const r = parse('(data.ort==[A B] || data.ort==C) && definition.name==X')
        expect(JSON.stringify(r).includes('[A B]')).toBe(true)
        expect(JSON.stringify(r).includes('definition.name')).toBe(true)
    })
})

describe('splitArrayValues', () => {
    test('plain items are trimmed', () => {
        expect(splitArrayValues('a, b ,c')).toEqual(['a', 'b', 'c'])
    })
    test('commas inside quotes do not split, quotes are removed', () => {
        expect(splitArrayValues('"Bern, Stadt", Thun')).toEqual(['Bern, Stadt', 'Thun'])
        expect(splitArrayValues('"Interlaken Liga"')).toEqual(['Interlaken Liga'])
    })
    test('unchanged behaviour for single values and empty input', () => {
        expect(splitArrayValues('Interlaken Liga')).toEqual(['Interlaken Liga'])
        expect(splitArrayValues('')).toEqual([''])
    })
})
