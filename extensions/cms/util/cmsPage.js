import GenericResolver from 'api/resolver/generic/genericResolver'
import Util from 'api/util'
import {getHostFromHeaders} from 'util/host'
import Cache from 'util/cache'

export const getCmsPage = async ({db, context, slug, editmode, _version, headers}) => {
    let host = headers['x-host-rule']?headers['x-host-rule'].split(':')[0]:getHostFromHeaders(headers)

    if (host && host.startsWith('www.')) {
        host = host.substring(4)
    }


    const cacheKey = 'cmsPage-' + (_version ? _version + '-' : '') + slug + (host ? '-' + host : '')
    let cmsPages
    if (!editmode) {
        cmsPages = Cache.get(cacheKey)
    }
    if (!cmsPages) {


        let match, hostRule

        const ors = []

        if (host) {

            hostRule = {$regex: `(^|;)${host.replace(/\./g, '\\.')}=${slug}($|;)`, $options: 'i'}
            ors.push({hostRule})
        }
        ors.push({slug})

        /*const parts = slug.split('/')
        for(let i = parts.length; i>0;i--){
            ors.push({slug: `${parts.join('/')}/*`})
            parts.splice(-1,1)
        }*/

        if (!Util.isUserLoggedIn(context)) {
            // if no user only match public entries
            match = {$and: [{$or: ors}, {public: true}]}
        } else {
            match = {$or: ors}
        }
        cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'name', 'template', 'script', 'style', 'serverScript', 'dataResolver', 'resources', 'ssr', 'public', 'urlSensitiv', 'parseResolvedData', 'alwaysLoadAssets', 'compress'], {
            match,
            limit: 1,
            _version
        })
        // minify template if no user is logged in
        if (cmsPages.results && cmsPages.results.length) {

            if (!editmode) {

                //minify script
                if(cmsPages.results[0].compress) {
                    cmsPages.results[0].script = cmsPages.results[0].script.replace(/\t/g, ' ').replace(/ +(?= )/g,'').replace(/(^[ \t]*\n)/gm, "")
                    cmsPages.results[0].style = cmsPages.results[0].style
                        .replace(/\t/g, ' ') // remove tabs
                        .replace(/ +(?= )/g, '') // remove double whitespace
                        .replace(/(^[ \t]*\n)/gm, "") // remove empty lines
                        .replace(/;$\n/gm, ';') // remove line break after ;
                }
                try {
                    // TODO: Include sub CMS component to reduce number of requests
                    // TODO: also check if template is html

                    const template = JSON.parse(cmsPages.results[0].template)

                    if(cmsPages.results[0].compress) {
                        Util.findProperties(template, '$inlineEditor').forEach(element => {
                            delete element.$inlineEditor
                        })
                    }

                    cmsPages.results[0].template = JSON.stringify(template, null, 0)
                } catch (e) {
                    console.log(e)
                }
            }


            //only cache if public
            if (cmsPages.results[0].public) {
                Cache.set(cacheKey, cmsPages, 6000000) // cache expires in 1h40min
            }
        }

    }
    return cmsPages
}

