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


        let tmpSlug = slug
        ors.push({slug})

        if (!Util.isUserLoggedIn(context)) {
            // if no user only match public entries
            match = {$and: [{$or: ors}, {public: true}]}
        } else {
            match = {$or: ors}
        }
        cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'name', 'template', 'script', 'serverScript', 'dataResolver', 'resources', 'ssr', 'public', 'urlSensitiv'], {
            match,
            limit: 1,
            _version
        })

        // minify template if no user is logged in
        if (cmsPages.results && cmsPages.results.length) {

            if (!editmode) {

                //console.log(template)

                try {
                    // TODO: Include sub CMS component to reduce number of requests
                    // TODO: also check if template is html

                    const template = JSON.parse(cmsPages.results[0].template)
                    cmsPages.results[0].template = JSON.stringify(template, null, 0)
                } catch (e) {
                }
            }
        }
        Cache.set(cacheKey, cmsPages, 600000) // cache expires in 10 min
    }
    return cmsPages
}

