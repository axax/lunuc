import React, {useContext} from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'
const {ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import CmsViewContainer from './containers/CmsViewContainer'
import {Link} from 'client/util/route'
import {_t, registerTrs} from '../../util/i18n.mjs'
import {
    Button,
    Select,
    SimpleMenu,
    Switch,
    ResponsiveDrawerLayout,
    Typography,
    WebIcon
} from 'ui/admin'
import {translations} from './translations/admin'
import TypesContainer from 'client/containers/TypesContainer'
import GenericForm from 'client/components/GenericForm'
import JsonDom from './components/JsonDom'
import {AppContext} from 'client/components/AppContext'
import {translations as adminTranslations} from 'client/translations/admin'

registerTrs(translations, 'CmsViewEditorContainer')
registerTrs(adminTranslations, 'AdminTranslations')


const cmsPageEditorUrl = (slug, _version) => {
    return `/${(_version && _version !== 'default' ? '@' + _version + '/' : '')}${slug}`
}



const addAdminComponents = (components) => {
    /* Admin Elements */
    components['AdminButton'] = Button
    components['AdminSelect'] = Select
    components['AdminSwitch'] = Switch
    components['AdminSimpleMenu'] = SimpleMenu
    components['DrawerLayout'] = ResponsiveDrawerLayout
    components['TypesContainer'] = (props) => <TypesContainer title={false} baseUrl={location.pathname} {...props}/>

}

/*export class AdminComponents extends React.Component {

    constructor(props) {
        super(props)
        addAdminComponents(JsonDom.components)
    }

    render() {
        return this.props.children
    }
}*/

export default () => {

    Hook.on('JsonDom', ({components}) => {
        addAdminComponents(components)
    })

    Hook.on('HomeContainerRender', ({content, match, location, history}) => {
        const globalContext = useContext(AppContext)
        const {user} = globalContext.state

        content.splice(0,content.length)
        content.push(<CmsViewContainer key="widgets" user={user} match={match} dynamic={true} urlSensitiv={true} location={location} history={history} slug={'system/widget'}/>)
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: _t('CmsMenu.pages'), to: ADMIN_BASE_URL + '/cms', auth: true, icon: <WebIcon/>})
    })

    Hook.on('TypeTableColumns', ({type, columns}) => {
        if (type === 'CmsPage') {
            columns.splice(1, 0, {title: 'Vorschau', id: 'preview'})
        }
    })

    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'CmsPage' && window.toolbar.visible) {
            dataSource.forEach((d, i) => {
                if (d.slug) {
                    const item = data.results[i]
                    if( item ) {
                        d.preview =  <Link to={cmsPageEditorUrl(item.slug, container.pageParams._version)}>
                            <img style={{maxWidth: '6rem', maxHeight: '6rem', objectFit: 'cover'}}
                                         src={`/lunucapi/generate/png?url=/${item.slug}${encodeURI('?preview=true')}&width=1200&height=800&cache=true&cacheExpire=${new Date(item.modifiedAt).getTime()}`}/>
                        </Link>

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
            delete newFields.style

            // override default
            props.children = [dataToEdit && <Typography key="CmsPageLabel" variant="subtitle1" gutterBottom>
                <Link
                    to={cmsPageEditorUrl(dataToEdit.slug, meta.TypeContainer.pageParams._version)}>
                        <span
                            style={{
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                color: '#663366',
                                textDecoration: 'underline'
                            }}>{_t('CmsPageEdit.goToEditor')}</span></Link>
            </Typography>,
                <GenericForm key="CmsPageForm" autoFocus onRef={ref => {
                    if(ref) {
                        parentRef.createEditForm = ref
                    }
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
