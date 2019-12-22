import GenericResolver from 'api/resolver/generic/genericResolver'
import Util from 'api/util'
import {getHostFromHeaders} from 'util/host'
import Cache from 'util/cache'

export const getCmsPage = async ({db, context, slug, editmode, _version, headers}) => {
    const host = getHostFromHeaders(headers)

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
        console.log(ors)

        cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'name', 'template', 'script', 'serverScript', 'dataResolver', 'resources', 'ssr', 'public', 'urlSensitiv', 'parseResolvedData', 'alwaysLoadAssets'], {
            match,
            limit: 1,
            _version
        })
        // minify template if no user is logged in
        if (cmsPages.results && cmsPages.results.length) {

            if (!editmode) {

                //console.log(template)

                //minify script
                //cmsPages.results[0].script = cmsPages.results[0].script.replace(/\t/g, ' ').replace(/ +(?= )/g,'')

                try {
                    // TODO: Include sub CMS component to reduce number of requests
                    // TODO: also check if template is html

                    const template = JSON.parse(cmsPages.results[0].template)
                    cmsPages.results[0].template = JSON.stringify(template, null, 0)
                } catch (e) {
                }
            }
        }

        //only cache if public
        if( cmsPages.results[0].public ) {
            Cache.set(cacheKey, cmsPages, 600000) // cache expires in 10 min
        }
    }
    return cmsPages
}

