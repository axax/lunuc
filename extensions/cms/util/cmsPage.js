import GenericResolver from 'api/resolver/generic/genericResolver'
import Util from 'api/util'
import DomAdminUtil from 'client/util/domAdmin'
import {getHostFromHeaders} from 'util/host'
import Cache from 'util/cache'
import {preprocessCss} from './cssPreprocessor'
import {loadAllHostrules} from 'util/hostrules'

const hostrules = loadAllHostrules(false)


export const getCmsPage = async ({db, context, slug, editmode, checkHostrules, _version, headers}) => {
    let host = headers && headers['x-host-rule'] ? headers['x-host-rule'].split(':')[0] : getHostFromHeaders(headers)

    if(!host){
        host = ''
    }
    if (host && host.startsWith('www.')) {
        host = host.substring(4)
    }

    let slugMatch = {}
    let modSlug

    if(checkHostrules) {
        const hostArr = host.split('.')
        const hostsChecks = [host]

        if (hostArr.length > 2) {
            // is subdomain

            // add top level domain
            hostsChecks.push( hostArr[hostArr.length-2]+'.'+hostArr[hostArr.length-1])
        }

        for(let i = 0;i < hostsChecks.length; i++) {
            const currentHost = hostsChecks[i]
            if (hostrules[currentHost] && hostrules[currentHost].slugContext && (slug + '/').indexOf(hostrules[currentHost].slugContext+'/')!== 0) {
                modSlug = hostrules[currentHost].slugContext + (slug.length > 0 ? '/' : '') + slug
                if (hostrules[currentHost].slugFallback) {
                    slugMatch = {$or: [{slug: modSlug}, {slug}]}
                } else {
                    slugMatch = {slug: modSlug}
                }
                break
            }
        }
    }




    if(!modSlug){
        modSlug = slug
        slugMatch = {slug}
    }

    const cacheKey = 'cmsPage-' + (_version ? _version + '-' : '') + slug + (host ? '-' + host : '')
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

        if (!Util.isUserLoggedIn(context)) {
            // if no user only match public entries
            match = {$and: [slugMatch, {public: true}]}
        } else {
            match = slugMatch
        }
        cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'name', 'template', 'script', 'style', 'serverScript', 'dataResolver', 'resources', 'ssr', 'public', 'urlSensitiv', 'parseResolvedData', 'alwaysLoadAssets', 'loadPageOptions', 'ssrStyle','publicEdit', 'compress'], {
            match,
            limit: 1,
            includeCount: false,
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
                if(slug !== cmsPages.results[0].slug){
                    const cacheKeyAlias = 'cmsPage-' + (_version ? _version + '-' : '') + cmsPages.results[0].slug + (host ? '-' + host : '')
                    Cache.setAlias(cacheKeyAlias, cacheKey)
                }
                Cache.set(cacheKey, cmsPages, 6000000) // cache expires in 1h40min
            }
        }

    }
    return cmsPages
}

