/*
 Optional "include" of embedded Cms components (opt-in per element: p.include = true).

 Normally every embedded Cms component is loaded by the client with its own cmsPage request
 after the parent page has been rendered (one network round trip per nesting level).
 With p.include the server resolves the component already together with the parent page and
 returns it in the field `includes`. The client puts it into its query cache under exactly the
 cache key the component would use (see writeCmsIncludesToCache in withCms.js), so the
 component renders without a request. If anything does not match, the component simply
 loads as before (cache miss) - an include can never break a page, at worst it is useless.

 A component can only be included if the server knows the variables the client would send:
 the request of an embedded component only contains slug, dynamic, props.$ and nosession.
 Therefore components with templated values (${...}) in slug or props.$, with
 forceInlineEditor or urlSensitiv are skipped.
 */
import {isTrue} from '../../../client/util/json.mjs'

// how deep included components may include other components (layout -> login box -> ...)
export const MAX_INCLUDE_DEPTH = 3
// max number of included components per request (all levels)
export const MAX_INCLUDES = 30

// the fields the client requests for an embedded component (CMS_PAGE_QUERY in cmsView.mjs)
const INCLUDE_FIELDS = ['slug', 'realSlug', 'urlSensitiv', 'author', 'keyword', 'description', 'template', 'script',
    'resources', 'resolvedData', 'style', 'html', 'meta', 'subscriptions', 'publicEdit', 'disableRendering', 'ssrStyle',
    'uniqueStyle', 'alwaysLoadAssets', 'parseResolvedData', 'fetchPolicy', 'includes']
const LOCALIZED_FIELDS = ['keyword', 'description']

const SPEC_CACHE = new Map()
const SPEC_CACHE_MAX = 500

const isDynamicValue = value => typeof value === 'string' &&
    (value.indexOf('${') >= 0 || value.indexOf('$.') >= 0 || value.indexOf('###') >= 0)

const toIncludeSpec = (p) => {
    let slug = p.component && Array.isArray(p.component) && p.component.length > 0 && p.component[0] ? p.component[0].slug : p.slug
    if (!slug || typeof slug !== 'string' || isDynamicValue(slug)) {
        return null
    }
    if (isTrue(p.forceInlineEditor) || p.urlSensitiv) {
        return null
    }
    let props = p.props
    if (typeof props === 'string') {
        if (isDynamicValue(props)) {
            return null
        }
        try {
            props = JSON.parse(props)
        } catch (e) {
            return null
        }
    }
    // same as getGqlVariables: only props.$ is sent to the server
    let propsStr = null
    if (props && props.$) {
        propsStr = JSON.stringify(props.$)
        if (isDynamicValue(propsStr)) {
            return null
        }
    }
    return {slug, props: propsStr}
}

/**
 * Cms components with p.include = true in a template (json string)
 * @param {String} template
 * @param {String} cacheKey identifies the template version (slug + modifiedAt), optional
 * @returns {Array<{slug: String, props: String|null}>}
 */
export const findCmsIncludes = (template, cacheKey) => {
    if (!template || typeof template !== 'string' || template.indexOf('"include"') < 0) {
        return []
    }
    if (cacheKey && SPEC_CACHE.has(cacheKey)) {
        return SPEC_CACHE.get(cacheKey)
    }
    let json
    try {
        json = JSON.parse(template)
    } catch (e) {
        return []
    }
    const specs = [], seen = new Set()
    const walk = (node) => {
        if (Array.isArray(node)) {
            for (const child of node) {
                walk(child)
            }
        } else if (node && typeof node === 'object') {
            if (node.t === 'Cms' && node.p && typeof node.p === 'object' && isTrue(node.p.include)) {
                const spec = toIncludeSpec(node.p)
                if (spec) {
                    const key = spec.slug + '|' + spec.props
                    if (!seen.has(key)) {
                        seen.add(key)
                        specs.push(spec)
                    }
                }
            }
            for (const key in node) {
                if (key !== 'p') {
                    walk(node[key])
                }
            }
        }
    }
    walk(json)

    if (cacheKey) {
        if (SPEC_CACHE.size >= SPEC_CACHE_MAX) {
            SPEC_CACHE.clear()
        }
        SPEC_CACHE.set(cacheKey, specs)
    }
    return specs
}

/**
 * The result of the cmsPage resolver reduced to what the client receives for an embedded component
 * (same fields and shape as the graphql response of CMS_PAGE_QUERY)
 */
export const cmsPageForInclude = (result) => {
    const cmsPage = {__typename: 'CmsPage'}
    for (const field of INCLUDE_FIELDS) {
        let value = result[field]
        if (value === undefined) {
            value = null
        }
        if (value && LOCALIZED_FIELDS.indexOf(field) >= 0 && typeof value === 'object') {
            value = {__typename: 'LocalizedString', ...value}
        }
        cmsPage[field] = value
    }
    // nested includes are returned flat with the top level page
    cmsPage.includes = null
    return cmsPage
}
