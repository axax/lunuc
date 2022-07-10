import React from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'

const {ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_TEMPLATE,
    CAPABILITY_MANAGE_CMS_CONTENT
} from './constants/index.mjs'
import Async from 'client/components/Async'
import CmsViewContainer from './containers/CmsViewContainer'
import CmsReducer from './reducers/CmsReducer'

const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer')}/>


// Extend Util to use in template
/*Util.xx = () => {
    return 'yy'
}*/

// add redux reducer
Hook.on('reducer', ({reducers}) => {
    reducers.cms = CmsReducer
})

export default () => {


    // Hook to add user capabilities
    Hook.on('userCapabilities', ({capabilities}) => {
        capabilities.push(CAPABILITY_MANAGE_CMS_PAGES, CAPABILITY_MANAGE_CMS_TEMPLATE, CAPABILITY_MANAGE_CMS_CONTENT)
    })

    // add routes
    Hook.on('Routes', ({routes, container}) => {
        routes.push({
            private: true,
            exact: true,
            path: ADMIN_BASE_URL + '/cms/:page*',
            component: (p) => {
                //_app_._cmsLastSearch = decodeURI(p.location.search)
                return <TypesContainer baseUrl={ADMIN_BASE_URL + "/cms/"} fixType="CmsPage"
                                       title="Inhaltseiten" {...p} />
            }
        })
        routes.push({
            // match everything but paths that start with ADMIN_BASE_URL
            exact: false, path: '/:slug*', render: ({match, location, history}) => {
                Hook.call('CMSSlug', {match})
                let slug = match.params.slug ? decodeURI(match.params.slug) : ''

                if(slug.endsWith('/')){
                    slug = slug.substring(0,slug.length-1)
                }

                const pos = slug.indexOf('/' + PRETTYURL_SEPERATOR + '/')
                if (pos >= 0) {
                    slug = slug.substring(0, pos)
                }

                if (slug.split('/')[0] !== container.adminBaseUrlPlain) {
                    return <CmsViewContainer location={location} history={history} slug={slug}/>
                }

                return null
            }
        })
    }, 99)
}
