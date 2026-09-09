import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Util from '../../../api/util/index.mjs'
import DomAdminUtil from '../../../client/util/domAdmin.mjs'
import {getHostFromHeaders} from '../../../util/host.mjs'
import Cache from '../../../util/cache.mjs'
import {preprocessCss} from './cssPreprocessor.mjs'
import {getBestMatchingHostRule} from '../../../util/hostrules.mjs'
import Hook from '../../../util/hook.cjs'


export const getCmsPageCacheKey = ({_version, slug, host, inEditor, hostrule, includeNonPublic}) => {
    return 'cmsPage-' + (_version ? _version + '-' : 'default-') + slug +
        (host ? '-' + host : '') +
        (inEditor ? '-inEditor' : '') +
        (hostrule && hostrule.host ? '-' + hostrule.host : '') +
        // A request that may see non-public pages runs a different match, so it
        // must not share an entry with an anonymous one. Without this a negative
        // entry cached by a visitor (or a bot) hides an unpublished page from an
        // editor for the whole negative TTL.
        // Appended AFTER the slug on purpose: cache invalidation in
        // resolver/index.mjs uses Cache.clearStartWith() on the
        // 'cmsPage-<version>-<slug>' prefix, which keeps matching this way.
        (includeNonPublic ? '-nonpublic' : '')
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

// Fields loaded for a CmsPage. Module level on purpose: the lookup below can run
// once per slug candidate, and two inline copies of this list would silently
// drift apart - a newly added field would then be missing on fallback pages only.
const CMS_PAGE_FIELDS = [
    'slug',
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
    'compress'
]

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

    // Decides whether {public: true} ends up in the match below - and therefore
    // belongs in the cache key. Single source of truth for both.
    const includeNonPublic = !!(ignorePublicState || Util.isUserLoggedIn(context))

    // cache key only depends on request parameters, not on the resolved slug
    // candidates, so the cache lookup can happen before any candidate computation
    const cacheKey = getCmsPageCacheKey({_version, slug, host, inEditor, hostrule, includeNonPublic})

    let cmsPages
    if (!editmode) {
        cmsPages = Cache.get(cacheKey)
    }
    if (!cmsPages) {

        // Slug candidates in descending priority. The first candidate that resolves
        // to a page wins, so the order of this array IS the precedence rule:
        // hostrule.slugContext, then slugFallback.slugContexts in config order,
        // then - only if slugFallback allows it - the bare slug.
        //
        // They must NOT be collapsed into a single $in: sort:false keeps the $sort
        // stage out of the pipeline, so MongoDB walks the slug index bounds in
        // index (= alphabetical) order and returns whichever candidate it happens
        // to hit first, not the one that should take precedence.
        let slugCandidates

        if (hostrule && hostrule.slugContext && !(slug + '/').startsWith(hostrule.slugContext + '/')) {

            const modSlug = hostrule.slugContext + (slug.length > 0 ? '/' : '') + slug
            let slugFallback = hostrule.slugFallback
            if (slugFallback?.constructor !== Object) {
                slugFallback = {default: slugFallback === true}
            }

            // Additional slugContexts, tried after the hostrule's own slugContext,
            // e.g. slugFallback.slugContexts = ['ctxA', 'ctxB'].
            // Empty or non-string entries are filtered out to avoid invalid slug variants
            const extraContexts = Array.isArray(slugFallback.slugContexts)
                ? slugFallback.slugContexts.filter(ctx => typeof ctx === 'string' && ctx.length > 0)
                : []

            slugCandidates = [
                modSlug,
                ...extraContexts.map(ctx => ctx + (slug.length > 0 ? '/' : '') + slug)
            ]

            // The bare slug becomes a candidate ONLY when slugFallback opts in -
            // never implicitly, and never ahead of a slugContext.
            if (slugFallback.default === true || (Array.isArray(slugFallback.exceptions) && pathMatches(slug, slugFallback.exceptions))) {
                slugCandidates.push(slug)
            }

            // drop duplicates, keeping the first (= highest priority) occurrence
            slugCandidates = [...new Set(slugCandidates)]
        } else {
            // No slugContext applies - either there is no hostrule, or the slug
            // already carries the context. The requested slug is the only candidate.
            slugCandidates = [slug]
        }

        // slug is a unique index, so one candidate resolves to at most one page.
        // That is what makes sort:false safe: with a single slug per query there is
        // nothing left for a $sort to disambiguate, and the index scan can stop at
        // the first hit instead of sorting in memory.
        const queryCmsPage = (candidateSlug) => GenericResolver.entities(db, {headers, context}, 'CmsPage',
            CMS_PAGE_FIELDS,
            {
                // if no user only match public entries
                match: includeNonPublic
                    ? {slug: candidateSlug}
                    : {$and: [{slug: candidateSlug}, {public: true}]},
                sort: false,
                limit: 1,
                includeCount: false,
                noLookupFields: ['createdBy', 'ownerGroup'],
                _version
            })

        for (const candidateSlug of slugCandidates) {
            cmsPages = await queryCmsPage(candidateSlug)
            if (cmsPages.results && cmsPages.results.length) {
                break
            }
        }

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
                    const cacheKeyAlias = getCmsPageCacheKey({_version, slug: cmsPages.results[0].slug, host, hostrule, includeNonPublic})
                    Cache.setAlias(cacheKeyAlias, cacheKey)
                }
                Cache.set(cacheKey, cmsPages, 6000000) // cache expires in 1h40min
            }
        } else {
            console.warn(`CmsPage not found ${slug}. host=${host} slugCandidates=${JSON.stringify(slugCandidates)} includeNonPublic=${includeNonPublic}`)

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