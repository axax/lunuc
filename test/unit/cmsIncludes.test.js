import {findCmsIncludes, cmsPageForInclude} from '../../extensions/cms/util/cmsIncludes.mjs'

const cms = (p, c) => ({t: 'Cms', p, ...(c && {c})})

describe('cmsIncludes', () => {

    it('finds components with include flag (component picker and deprecated slug)', () => {
        const template = JSON.stringify({
            c: [
                cms({component: [{slug: 'site/layout'}], include: true, props: {title: 'Site'}}),
                {t: 'div', c: [cms({slug: 'core/gotop', include: 'true'})]}
            ]
        })
        expect(findCmsIncludes(template)).toEqual([
            {slug: 'site/layout', props: null},
            {slug: 'core/gotop', props: null}
        ])
    })

    it('includes components inside the children of a component and inside loops', () => {
        const template = JSON.stringify(cms({slug: 'a', include: true}, [
            {$for: {d: 'items', c: cms({slug: 'b', include: true})}}
        ]))
        expect(findCmsIncludes(template).map(s => s.slug)).toEqual(['a', 'b'])
    })

    it('ignores components without include flag', () => {
        const template = JSON.stringify([cms({slug: 'a'}), cms({slug: 'b', include: false}), cms({slug: 'c', include: 'false'})])
        expect(findCmsIncludes(template)).toEqual([])
    })

    it('sends static server props (props.$) like getGqlVariables', () => {
        const template = JSON.stringify([cms({slug: 'a', include: true, props: {title: '${x}', $: {limit: 5, cat: 'Indoor'}}})])
        expect(findCmsIncludes(template)).toEqual([{slug: 'a', props: JSON.stringify({limit: 5, cat: 'Indoor'})}])
    })

    it('skips components whose request the server can not know', () => {
        const template = JSON.stringify([
            cms({slug: 'dyn-props', include: true, props: {$: {cat: '${cat1}'}}}),
            cms({slug: 'loop-props', include: true, props: {$: {cat: '$.item{item.cat}'}}}),
            cms({slug: 'raw-props', include: true, props: {$: {page: '###${page}###'}}}),
            cms({slug: '${dynamicSlug}', include: true}),
            cms({slug: 'inline-editor', include: true, forceInlineEditor: true}),
            cms({slug: 'url-sensitiv', include: true, urlSensitiv: 'full'}),
            cms({slug: 'ok', include: true, props: {title: '${only.client.side}'}})
        ])
        expect(findCmsIncludes(template)).toEqual([{slug: 'ok', props: null}])
    })

    it('parses props given as json string', () => {
        const template = JSON.stringify([cms({slug: 'a', include: true, props: JSON.stringify({$: {a: 1}})})])
        expect(findCmsIncludes(template)).toEqual([{slug: 'a', props: '{"a":1}'}])
    })

    it('returns each component only once', () => {
        const template = JSON.stringify([cms({slug: 'a', include: true}), cms({slug: 'a', include: true})])
        expect(findCmsIncludes(template)).toHaveLength(1)
    })

    it('handles invalid or empty templates', () => {
        expect(findCmsIncludes('')).toEqual([])
        expect(findCmsIncludes(null)).toEqual([])
        expect(findCmsIncludes('{"include": true, broken')).toEqual([])
        expect(findCmsIncludes('<div>html template</div>')).toEqual([])
    })

    it('caches the result per cache key', () => {
        const template = JSON.stringify([cms({slug: 'a', include: true})])
        const first = findCmsIncludes(template, 'test|cache|1')
        expect(findCmsIncludes(template, 'test|cache|1')).toBe(first)
    })

    it('returns the fields of the client query only', () => {
        const cmsPage = cmsPageForInclude({
            slug: 'a', realSlug: 'a', template: '{}', resolvedData: '{}', script: '', style: '',
            keyword: {de: 'Licht'}, dataResolver: 'secret', serverScript: 'secret', editable: false,
            includes: '[{"nested":true}]'
        })
        expect(cmsPage.__typename).toBe('CmsPage')
        expect(cmsPage.template).toBe('{}')
        expect(cmsPage.keyword).toEqual({__typename: 'LocalizedString', de: 'Licht'})
        expect(cmsPage.description).toBeNull()
        expect(cmsPage.includes).toBeNull()
        expect(cmsPage).not.toHaveProperty('dataResolver')
        expect(cmsPage).not.toHaveProperty('serverScript')
        expect(cmsPage).not.toHaveProperty('editable')
    })
})
