import React from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'

const {ADMIN_BASE_URL} = config
import {
    CAPABILITY_VIEW_CMS_EDITOR,
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_TEMPLATE,
    CAPABILITY_MANAGE_CMS_CONTENT
} from './constants/index.mjs'
import Async from 'client/components/Async'
import CmsViewContainer from './containers/CmsViewContainer'
import JsonDom from './components/JsonDom'
import {render} from 'react-dom'
import {removePrettyUrlPart} from './util/cmsView.mjs'

const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer')}/>


// Extend Util to use in template
/*Util.xx = () => {
    return 'yy'
}*/


export default () => {

    _app_.JsonDom = {
        render: (props) =>{
            render(
                <JsonDom {...props}/>,
                document.body
            )
        }
    }

    // Hook to add user capabilities
    Hook.on('userCapabilities', ({capabilities}) => {
        capabilities.push(CAPABILITY_VIEW_CMS_EDITOR, CAPABILITY_MANAGE_CMS_PAGES, CAPABILITY_MANAGE_CMS_TEMPLATE, CAPABILITY_MANAGE_CMS_CONTENT)
    })

    // add routes
    Hook.on('Routes', ({routes, container}) => {
        routes.push({
            private: true,
            exact: true,
            path: ADMIN_BASE_URL + '/cms/:page*',
            layout:'base',
            component: (p) => {
                _app_._cmsLastSearch = decodeURI(p.location.search)
                return <TypesContainer baseUrl={ADMIN_BASE_URL + "/cms/"} fixType="CmsPage"
                                       title="Inhaltseiten" {...p} />
            }
        })
        routes.push({
            // match everything but paths that start with ADMIN_BASE_URL
            exact: false, path: '/:slug*', render: ({match, location, history, route}) => {
                Hook.call('CMSSlug', {match})

                let slug = match.params.slug || ''
                if(slug){
                    try {
                        slug = decodeURI(slug)
                    }catch (e){
                        console.warn(e)
                    }
                }

                const cmsViewProps = {location,history,user:_app_.user}
                if(slug.startsWith('[admin]')){
                    slug=slug.substring(8)
                    cmsViewProps.editMode = false
                    route.layout='base'
                    route.layoutProps= {contentStyle:{padding:0}}
                } else {
                    delete route.layout
                    delete route.layoutProps
                }
                slug = removePrettyUrlPart(slug)

                if (slug.split('/')[0] !== container.adminBaseUrlPlain) {
                    cmsViewProps.slug=slug
                    return <CmsViewContainer {...cmsViewProps}/>
                }

                return null
            }
        })
    }, 99)
}
