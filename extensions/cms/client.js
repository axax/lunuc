import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import {
    CAPABILITY_MANAGE_CMS_PAGES
} from './constants'
import Async from 'client/components/Async'
import CmsViewContainer from './containers/CmsViewContainer'

const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer')}/>

const WebIcon = (props) => <Async {...props} expose="WebIcon"
                                  load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../client/components/layout/ErrorPage')}/>


export default () => {

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Cms', to: ADMIN_BASE_URL + '/cms', auth: true, icon: <WebIcon />})
    })

    // Hook to add user capabilities
    Hook.on('userCapabilities', ({capabilities}) => {
        capabilities.push(CAPABILITY_MANAGE_CMS_PAGES)
    })

    // add routes
    Hook.on('Routes', ({routes, container}) => {
        routes.push({
            private: true,
            exact: true,
            path: ADMIN_BASE_URL + '/cms/:page*',
            component: (p) => <TypesContainer baseUrl={ADMIN_BASE_URL + "/cms/"} fixType="CmsPage" {...p} />
        })
        routes.push({
            // match everything but paths that start with ADMIN_BASE_URL
            exact: false, path: '/:slug*', render: ({match}) => {
                if (match.params.slug === undefined || (match.params.slug && match.params.slug.split('/')[0] !== container.adminBaseUrlPlain)) {
                    return <CmsViewContainer match={match} slug={match.params.slug || ''}/>;
                }
                return <ErrorPage/>
            }
        })
    }, 99)

    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data}) => {
        if (type === 'CmsPage') {
            dataSource.forEach((d, i) => {
                if (d.slug) {
                    d.slug = <span style={{
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        color: '#663366',
                        textDecoration: 'underline'
                    }}>{data.results[i].slug}</span>
                }
            })
        }
    })

    // add an entry actions
    Hook.on('TypeTableEntryAction', ({type, actions, item, container}) => {
        if (type === 'CmsPage') {
            actions.push({
                name: 'View cms page',
                onClick: () => {
                    const {_version} = container.pageParams
                    container.props.history.push('/' + (_version && _version !== 'default' ? '@' + _version + '/' : '') + (item.slug ? item.slug : ''))
                },
                icon: <WebIcon />
            })
        }
    })

    // add a click event
    Hook.on('TypeTableEntryClick', ({type, item, container}) => {
        if (type === 'CmsPage') {
            const {_version} = container.pageParams
            container.props.history.push('/' + (_version && _version !== 'default' ? '@' + _version + '/' : '') + (item.slug ? item.slug : ''))
        }
    })
}