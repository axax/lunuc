import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config-client'

const {ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_TEMPLATE,
    CAPABILITY_MANAGE_CMS_CONTENT
} from './constants'
import Async from 'client/components/Async'
import CmsViewContainer from './containers/CmsViewContainer'
import CmsEditorReducer from './reducers/CmsEditorReducer'
import CmsReducer from './reducers/CmsReducer'

const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer')}/>


const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../client/components/layout/ErrorPage')}/>

// Extend Util to use in template
/*Util.xx = () => {
    return 'yy'
}*/

// add redux reducer
Hook.on('reducer', ({reducers}) => {
    reducers.cmsEditor = CmsEditorReducer
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
                _app_._cmsLastSearch = decodeURI(p.location.search)
                return <TypesContainer baseUrl={ADMIN_BASE_URL + "/cms/"} fixType="CmsPage"
                                       title="Content Management" {...p} />
            }
        })
        routes.push({
            // match everything but paths that start with ADMIN_BASE_URL
            exact: false, path: '/:slug*', render: ({match, location, history}) => {
                Hook.call('CMSSlug', {match})
                let slug = match.params.slug
                const pos = (slug ? slug.indexOf('/' + PRETTYURL_SEPERATOR + '/') : -1)
                if (pos >= 0) {
                    slug = slug.substring(0, pos)
                    /*const subpage = slug.substring(pos + 3)
                    location.search += '&_subpage=' + subpage*/
                }

                if (slug === undefined || (slug && slug.split('/')[0] !== container.adminBaseUrlPlain)) {
                    return <CmsViewContainer match={match} location={location} history={history} slug={slug || ''}/>
                }

                if(_app_.redirect404 && _app_.redirect404!==location.pathname){
                    location.replace(_app_.redirect404)
                    return null
                }
                return <ErrorPage/>
            }
        })
    }, 99)
}
