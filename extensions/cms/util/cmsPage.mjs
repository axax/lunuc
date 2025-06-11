import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Util from '../../../api/util/index.mjs'
import DomAdminUtil from '../../../client/util/domAdmin.mjs'
import {getHostFromHeaders} from '../../../util/host.mjs'
import Cache from '../../../util/cache.mjs'
import {preprocessCss} from './cssPreprocessor.mjs'
import {getBestMatchingHostRule} from '../../../util/hostrules.mjs'
import Hook from '../../../util/hook.cjs'


export const getCmsPageCacheKey = ({_version, slug, host, inEditor})=>{
    return 'cmsPage-' + (_version ? _version + '-' : '') + slug + (host ? '-' + host : '') + (inEditor ? '-inEditor': '')
}

export const getCmsPage = async ({db, context, headers, ...params}) => {

    if (Hook.hooks['beforeCmsPage'] && Hook.hooks['beforeCmsPage'].length) {
        for (let i = 0; i < Hook.hooks['beforeCmsPage'].length; ++i) {
            await Hook.hooks['beforeCmsPage'][i].callback({db, context, headers, params})
        }
    }

    const {slug, editmode, checkHostrules, inEditor, _version, ignorePublicState} = params

    let host = getHostFromHeaders(headers)

    if (!host) {
        host = ''
    }
    if (host.startsWith('www.')) {
        host = host.substring(4)
    }

    let slugMatch = {slug}
    let hostrule

    if (checkHostrules) {

        hostrule = getBestMatchingHostRule(host, false, true).hostrule
        if(hostrule.slugContext && (slug + '/').indexOf(hostrule.slugContext + '/') !== 0)
        {
            const modSlug = hostrule.slugContext + (slug.length > 0 ? '/' : '') + slug
            let slugFallback = hostrule.slugFallback
            if(slugFallback?.constructor!==Object){
                slugFallback = {default:slugFallback===true}
            }

            if (slugFallback.default===true || (Array.isArray(slugFallback.exceptions) && slugFallback.exceptions.indexOf(slug)>=0)) {
                slugMatch = {$or: [{slug: modSlug}, {slug}]}
            } else {
                slugMatch = {slug: modSlug}
            }
        }
    }

    const cacheKey = getCmsPageCacheKey({_version, slug, host, inEditor})

    let cmsPages
    if (!editmode) {
        cmsPages = Cache.get(cacheKey)
    }
    if (!cmsPages) {


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

        cmsPages = await GenericResolver.entities(db, {headers,context}, 'CmsPage',
            ['slug',
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
                noUserLookup: true,
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
                    result.script = result.script.replace(/\t/g, ' ').replace(/ +(?= )/g, '').replace(/(^[ \t]*\n)/gm, "")

                    if (!result.ssrStyle) {
                        result.style = result.style
                            .replace(/\t/g, ' ') // remove tabs
                            .replace(/ +(?= )/g, '') // remove double whitespace
                            .replace(/(^[ \t]*\n)/gm, "") // remove empty lines
                            .replace(/^\s+|\s+$/gm, '') // remove whitespace at beginning of line
                            .replace(/,$\n/gm, ',') // remove line break after ,
                            .replace(/\/\*[\s\S]*?\*\//gm, '') // remove block comments /**/

                        if (!inEditor) {
                            result.style = result.style.replace(/\/\/<\!\!#REMOVE([\s\S]*?)\/\/\!\!#REMOVE>/gm, '') // remove any character between marker
                        }

                    }
                }
                try {
                    // TODO: Include sub CMS component to reduce number of requests
                    // TODO: also check if template is html

                    const template = JSON.parse(result.template)

                    if (result.compress && !result.publicEdit) {
                        DomAdminUtil.findProperties(template, '$inlineEditor').forEach(({element}) => {
                            delete element.$inlineEditor
                        })
                    }

                    result.template = JSON.stringify(template, null, 0)
                } catch (e) {
                    console.warn(`${result.slug} is not a valid json template`)
                }
            }


            //only cache if public
            if (!editmode && cmsPages.results[0].public) {
                if (slug !== cmsPages.results[0].slug) {
                    const cacheKeyAlias = getCmsPageCacheKey({_version, slug: cmsPages.results[0].slug, host})
                    Cache.setAlias(cacheKeyAlias, cacheKey)
                }
                Cache.set(cacheKey, cmsPages, 6000000) // cache expires in 1h40min
            }
        }else{
            console.warn(`CmsPage not found ${slug}. host=${host} match=${JSON.stringify(match)}`)
        }
        cmsPages.usedHostrule = hostrule
    }
    return cmsPages
}

