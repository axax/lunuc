import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import Async from 'client/components/Async'
import CmsViewContainer from './containers/CmsViewContainer'
import {Link} from 'react-router-dom'


const WebIcon = (props) => <Async {...props} expose="WebIcon"
                                  load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

const Typography = (props) => <Async {...props} expose="Typography"
                                     load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>


const cmsPageEditorUrl = (slug, _version) => {
    return `/${(_version && _version !== 'default' ? '@' + _version + '/' : '')}${slug}`
}

export default () => {

    Hook.on('HomeContainerRender', ({content, match, location, history}) => {
        content.splice(0,content.length)
        content.push(<CmsViewContainer match={match} dynamic={true} location={location} history={history} slug={'system/widget'}/>)
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Cms', to: ADMIN_BASE_URL + '/cms', auth: true, icon: <WebIcon/>})
    })

    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'CmsPage') {
            dataSource.forEach((d, i) => {
                if (d.slug) {
                    const item = data.results[i]
                    if( item ) {
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
        if (type === 'CmsPage' && event.target.name === 'name.'+_app_.lang && event.target.closest) {
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
