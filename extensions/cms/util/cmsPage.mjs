import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Util from '../../../api/util/index.mjs'
import DomAdminUtil from '../../../client/util/domAdmin.mjs'
import {getHostFromHeaders} from '../../../util/host.mjs'
import Cache from '../../../util/cache.mjs'
import {preprocessCss} from './cssPreprocessor.mjs'
import {getBestMatchingHostRule} from '../../../util/hostrules.mjs'
import Hook from '../../../util/hook.cjs'


export const getCmsPageCacheKey = ({_version, slug, host, inEditor, hostrule}) => {
    return 'cmsPage-' + (_version ? _version + '-' : 'default-') + slug +
        (host ? '-' + host : '') +
        (inEditor ? '-inEditor' : '') +
        (hostrule && hostrule.host ? '-' + hostrule.host : '')
}

function pathMatches(path, pathPatterns) {
    return pathPatterns.some(pattern => {
        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1) // remove trailing '*'
            return path.startsWith(prefix)
        }
        return path === pattern // exact match if no '*'
    })
}

export const getCmsPage = async ({db, context, headers, ...params}) => {

    if (Hook.hooks['beforeCmsPage'] && Hook.hooks['beforeCmsPage'].length) {
        for (let i = 0; i < Hook.hooks['beforeCmsPage'].length; ++i) {
            await Hook.hooks['beforeCmsPage'][i].callback({db, context, headers, params})
        }
    }

    const {slug, editmode, checkHostrules, inEditor, _version, ignorePublicState} = params

    let host = getHostFromHeaders(headers)

    /*if (host.startsWith('www.')) {
        host = host.substring(4)
    }*/

    // hostrule is resolved on every request (cheap in-memory lookup)
    // because usedHostrule must be fresh even on cache hits
    let hostrule
    if (checkHostrules) {
        hostrule = getBestMatchingHostRule(host, false, true).hostrule
    }

    // cache key only depends on request parameters, not on the resolved slugMatch,
    // so the cache lookup can happen before any slugMatch computation
    const cacheKey = getCmsPageCacheKey({_version, slug, host, inEditor, hostrule})

    let cmsPages
    if (!editmode) {
        cmsPages = Cache.get(cacheKey)
    }
    if (!cmsPages) {

        let slugMatch = {slug}

        if (hostrule && hostrule.slugContext && !(slug + '/').startsWith(hostrule.slugContext + '/')) {

            const modSlug = hostrule.slugContext + (slug.length > 0 ? '/' : '') + slug
            let slugFallback = hostrule.slugFallback
            if (slugFallback?.constructor !== Object) {
                slugFallback = {default: slugFallback === true}
            }

            // Additional slugContexts to OR-match against, e.g. slugFallback.slugContexts = ['ctxA', 'ctxB']
            // Empty or non-string entries are filtered out to avoid invalid slug variants
            const extraContexts = Array.isArray(slugFallback.slugContexts)
                ? slugFallback.slugContexts.filter(ctx => typeof ctx === 'string' && ctx.length > 0)
                : []

            // Build all slug candidates and remove potential duplicates
            const uniqueModSlugs = [...new Set([
                modSlug,
                ...extraContexts.map(ctx => ctx + (slug.length > 0 ? '/' : '') + slug)
            ])]

            if (slugFallback.default === true || (Array.isArray(slugFallback.exceptions) && pathMatches(slug, slugFallback.exceptions))) {
                // $in is more efficient than $or for equality matches on the same field
                slugMatch = {slug: {$in: [...uniqueModSlugs, slug]}}
            } else if (uniqueModSlugs.length > 1) {
                slugMatch = {slug: {$in: uniqueModSlugs}}
            } else {
                slugMatch = {slug: uniqueModSlugs[0]}
            }
        }

        let match

        /*const parts = slug.split('/')
        for(let i = parts.length; i>0;i--){
            ors.push({slug: `${parts.join('/')}/*`})
            parts.splice(-1,1)
        }*/

        if (!ignorePublicState && !Util.isUserLoggedIn(context)) {
            // if no user only match public entries
            match = {$and: [slugMatch, {public: true}]}
        } else {
            match = slugMatch
        }

        cmsPages = await GenericResolver.entities(db, {headers, context}, 'CmsPage',
            ['slug',
                'ownerGroup',
                'name',
                'keyword',
                'author',
                'description',
                'template',
                'script',
                'style',
                'serverScript',
                'dataResolver',
                'manual',
                'resources',
                'ssr',
                'public',
                'urlSensitiv',
                'parseResolvedData',
                'fetchPolicy',
                'alwaysLoadAssets',
                'loadPageOptions',
                'ssrStyle',
                'uniqueStyle',
                'publicEdit',
                'disableRendering',
                'compress'],
            {
                match,
                limit: 1,
                includeCount: false,
                noLookupFields: ['createdBy', 'ownerGroup'],
                _version
            })

        // minify template if no user is logged in
        if (cmsPages.results && cmsPages.results.length) {

            if (!editmode) {
                const result = cmsPages.results[0]
                //minify script

                if (result.ssrStyle) {
                    result.style = preprocessCss(result.style)
                }
                if (result.compress) {

                    if (result.script) {
                        result.script = result.script
                            .replace(/\t/g, ' ') // remove tabs
                            .replace(/ {2,}/g, ' ') // collapse multiple spaces (faster than lookahead)
                            .replace(/(^[ \t]*\n)/gm, '') // remove empty lines
                    }

                    if (result.style && !result.ssrStyle) {
                        result.style = result.style
                            .replace(/\/\*[\s\S]*?\*\//gm, '') // remove block comments first, so the following steps don't minify text that gets removed anyway
                            .replace(/\t/g, ' ') // remove tabs
                            .replace(/ {2,}/g, ' ') // collapse multiple spaces (faster than lookahead)
                            .replace(/(^[ \t]*\n)/gm, '') // remove empty lines
                            .replace(/^\s+|\s+$/gm, '') // remove whitespace at beginning/end of line
                            .replace(/,$\n/gm, ',') // remove line break after ,

                        if (!inEditor) {
                            result.style = result.style.replace(/\/\/<\!\!#REMOVE([\s\S]*?)\/\/\!\!#REMOVE>/gm, '') // remove any character between marker
                        }

                    }

                    // Only parse/stringify the template when compress is enabled.
                    // Without compress the parse/stringify round trip had no effect
                    // besides whitespace minification and is expensive for large templates.
                    try {
                        // TODO: Include sub CMS component to reduce number of requests
                        // TODO: also check if template is html

                        const template = JSON.parse(result.template)

                        if (!result.publicEdit) {
                            DomAdminUtil.findProperties(template, '$inlineEditor').forEach(({element}) => {
                                delete element.$inlineEditor
                            })
                        }

                        result.template = JSON.stringify(template)
                    } catch (e) {
                        console.warn(`${result.slug} is not a valid json template`)
                    }
                }
            }


            //only cache if public
            if (!editmode && cmsPages.results[0].public) {
                if (slug !== cmsPages.results[0].slug) {
                    const cacheKeyAlias = getCmsPageCacheKey({_version, slug: cmsPages.results[0].slug, host, hostrule})
                    Cache.setAlias(cacheKeyAlias, cacheKey)
                }
                Cache.set(cacheKey, cmsPages, 6000000) // cache expires in 1h40min
            }
        } else {
            console.warn(`CmsPage not found ${slug}. host=${host} match=${JSON.stringify(match)}`)

            // negative caching: avoid hitting the db for every request to a non existing page
            // (e.g. bots scanning random urls). short ttl so newly created pages show up quickly
            if (!editmode) {
                Cache.set(cacheKey, cmsPages, 60000) // cache "not found" for 1 min
            }
        }
    }

    // always return a shallow copy so callers can't mutate the cached object
    // and usedHostrule is always fresh (even on cache hits)
    return {...cmsPages, usedHostrule: hostrule}
}