import {narrowDefinitionProjection} from '../../extensions/genericdata/narrowDefinitionProjection.mjs'

describe('narrowDefinitionProjection', () => {
    it('reduces the definition to its _id', () => {
        const data = ['_id', 'definition', {data: ['titel']}]
        narrowDefinitionProjection(data, {})
        expect(data).toEqual(['_id', {definition: ['_id']}, {data: ['titel']}])
    })

    it('also reduces an explicit definition projection', () => {
        const data = ['_id', {definition: ['_id', 'name', 'structure']}]
        narrowDefinitionProjection(data, {genericType: 'X'})
        expect(data).toEqual(['_id', {definition: ['_id']}])
    })

    it('changes the given array in place (the builder uses it)', () => {
        const data = ['definition']
        const ref = data
        narrowDefinitionProjection(data, {})
        expect(data).toBe(ref)
    })

    it('keeps the definition when the caller wants it in the result', () => {
        const data = ['_id', 'definition']
        narrowDefinitionProjection(data, {removeDefinition: false})
        expect(data).toEqual(['_id', 'definition'])
    })

    it('leaves other entries alone', () => {
        const data = ['_id', 'definitionName', {data: ['definition']}, {definition: ['_id'], other: 1}]
        narrowDefinitionProjection(data, {})
        expect(data).toEqual(['_id', 'definitionName', {data: ['definition']}, {definition: ['_id'], other: 1}])
    })

    it('ignores anything that is not an array', () => {
        expect(() => {
            narrowDefinitionProjection(undefined, {})
            narrowDefinitionProjection(null, {})
            narrowDefinitionProjection('definition', {})
        }).not.toThrow()
    })
})
