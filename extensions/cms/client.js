import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'

const {ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import {
    CAPABILITY_MANAGE_CMS_PAGES
} from './constants'
import Async from 'client/components/Async'
import CmsViewContainer from './containers/CmsViewContainer'
import {Link} from 'react-router-dom'
import CmsReducer from './reducers/CmsReducer'
import Util from 'client/util'

const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer')}/>

const WebIcon = (props) => <Async {...props} expose="WebIcon"
                                  load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

const Typography = (props) => <Async {...props} expose="Typography"
                                     load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>


const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../client/components/layout/ErrorPage')}/>

const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>

// Extend Util to use in template
Util.xx = () => {
    return 'yy'
}


// add redux reducer
Hook.on('reducer', ({reducers}) => {
    reducers.cms = CmsReducer
})

const cmsPageEditorUrl = (slug, _version) => {
    return `/${(_version && _version !== 'default' ? '@' + _version + '/' : '')}${slug}`
}

export default () => {

    Hook.on('HomeContainerRender', ({content}) => {
        content.push(<div key="test">CMSComponent</div>)
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Cms', to: ADMIN_BASE_URL + '/cms', auth: true, icon: <WebIcon/>})
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
            component: (p) => {
                _app_._cmsLastSearch = p.location.search
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
                    return <CmsViewContainer match={match} location={location} history={history} slug={slug || ''}/>;
                }
                return <ErrorPage/>
            }
        })
    }, 99)

    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'CmsPage') {
            dataSource.forEach((d, i) => {
                if (d.slug) {
                    const item = data.results[i]
                    d.slug = <Link
                        to={cmsPageEditorUrl(item.slug, container.pageParams._version)}>
                        <span
                            style={{
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: '#663366',
                                textDecoration: 'underline'
                            }}>{item.slug || <WebIcon/>}</span></Link>
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
                    container.props.history.push(cmsPageEditorUrl(item.slug, container.pageParams._version))
                },
                icon: <WebIcon/>
            })
        }
    })

    //            slug = slug.trim().toLowerCase().replace(/[\W_]+/g,"_")

    // remove cacheKey column
    Hook.on('TypeTableColumns', ({columns}) => {
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i]
            if (col.id === 'cacheKey') {
                columns.splice(i, 1)
                return
            }
        }
    })

    // add default slug
    Hook.on('TypeCreateEditBlur', ({event, type}) => {
        if (type === 'CmsPage' && event.target.name === 'name' && event.target.closest) {
            const form = event.target.closest('form')
            const slugInput = form.querySelector('input[name=slug]')

            if (slugInput && !slugInput.value) {
                const value = event.target.value.trim().toLowerCase().replace(/[\W_]+/g, "_")

                const lastValue = slugInput.value

                setTimeout(() => {
                    const event = new Event('input', {bubbles: true})

                    slugInput.value = value
                    let tracker = slugInput._valueTracker
                    if (tracker) {
                        tracker.setValue(lastValue)
                    }
                    slugInput.dispatchEvent(event)

                    slugInput.focus()
                }, 10)
            }
        }
    })


    Hook.on('TypeCreateEdit', function ({type, props, formFields, dataToEdit, meta, parentRef}) {

        if (type === 'CmsPage') {

            const newFields = Object.assign({}, formFields)

            delete newFields.template
            delete newFields.script
            delete newFields.serverScript
            delete newFields.dataResolver

            // override default
            props.children = [dataToEdit && <Typography key="CmsPageLabel" variant="subtitle1" gutterBottom>
                <Link
                    to={cmsPageEditorUrl(dataToEdit.slug, meta._version)}>
                        <span
                            style={{
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: '#663366',
                                textDecoration: 'underline'
                            }}>Go to CMS Editor</span></Link>
            </Typography>,
                <GenericForm key="CmsPageForm" autoFocus innerRef={ref => {
                    parentRef.createEditForm = ref
                }} onBlur={event => {
                    Hook.call('TypeCreateEditBlur', {type, event})
                }} primaryButton={false} fields={newFields} values={dataToEdit}/>]
        }
    })


    // add a click event
    /*Hook.on('TypeTableEntryClick', ({type, item, container}) => {
     if (type === 'CmsPage') {
     const {_version} = container.pageParams
     container.props.history.push('/' + (_version && _version !== 'default' ? '@' + _version + '/' : '') + (item.slug ? item.slug.split(';')[0] : ''))
     }
     })*/
}
