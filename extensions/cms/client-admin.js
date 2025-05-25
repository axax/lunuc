import React from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'
const {ADMIN_BASE_URL} = config
import CmsViewContainer from './containers/CmsViewContainer'
import {Link} from 'client/util/route'
import {_t, registerTrs} from '../../util/i18n.mjs'
import {
    Select,
    SimpleButton,
    SimpleMenu,
    SimpleDialog,
    SimpleMobileStepper,
    Switch,
    Divider,
    ResponsiveDrawerLayout,
    Typography,
    WebIcon,
    CircularProgress,
    LinearProgress
} from 'ui/admin'
import {translations} from './translations/admin'
import TypesContainer from 'client/containers/TypesContainer'
import GenericForm from 'client/components/GenericForm'
import {translations as adminTranslations} from 'client/translations/admin'
import Expandable from '../../client/components/Expandable'
import SimpleImageList from '../../client/components/ui/impl/material/SimpleImageList'


registerTrs(translations, 'CmsViewEditorContainer')
registerTrs(adminTranslations, 'AdminTranslations')


const cmsPageEditorUrl = (slug, _version) => {
    return `/${(_version && _version !== 'default' ? '@' + _version + '/' : '')}${slug}`
}


const addAdminComponents = (components) => {
    /* Admin Elements */
    components['AdminExpandable'] = Expandable
    components['AdminButton'] = SimpleButton
    components['AdminCircularProgress'] = CircularProgress
    components['AdminLinearProgress'] = LinearProgress
    components['AdminMobileStepper'] = SimpleMobileStepper
    components['AdminDialog'] = SimpleDialog
    components['AdminSelect'] = Select
    components['AdminSwitch'] = Switch
    components['AdminDivider'] = Divider
    components['AdminForm'] = GenericForm
    components['AdminSimpleMenu'] = SimpleMenu
    components['AdminTypography'] = Typography
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

const getImageFromCmsPageItem = (item) => {
    if (item.public) {
        return `/lunucapi/generate/png?url=/${item.slug}${encodeURI('?preview=true')}&width=1200&height=800&rwidth=240&rheight=160&cache=true&cacheExpire=${new Date(item.modifiedAt).getTime()}`
    } else {
        return `/lunucapi/system/genimage?width=120&height=80&text=Kein Bild&fontsize=1em`
    }
}

const setError = (meta, msg) => {
    meta.TypeContainer.setState({
        createEditDialog: false,
        createEditDialogOption: false,
        simpleDialog: {
            title: _t('CmsPageEdit.errorConvertingHtml'),
            actions: [{key: 'close', label: 'Ok'}],
            children: msg
        }
    })
}

const convertHtmlAndSet = ({html, style, script, meta, typeEdit}) => {
    fetch('/lunucapi/url/html', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({html,style,script, mode: 'createTemplate'})
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Success:", data)
            if (!data.template || data.error) {
                setError(meta, data.error || '')
            } else {
                let resources
                if(data.resources){
                    resources = JSON.stringify(data.resources.filter(url=>url.startsWith('http')))
                }
                typeEdit.handleSaveData({key: 'save_close'}, {template: data.template, style: data.style, script: data.script, resources})
            }

        })
        .catch(error => {
            console.error("Error:", error)
            setError(meta, error.message)
        })
}

export default () => {

    Hook.on('JsonDom', ({components}) => {
        addAdminComponents(components)
    })

    Hook.on('HomeContainerRender', ({content, match, location, history}) => {

        if(content) {
            if(content.length>0) {
                content.splice(0, content.length)
            }
            content.push(<CmsViewContainer key="widgets" user={_app_.user} match={match} dynamic={true} urlSensitiv={true}
                                           location={location} history={history} slug={'system/widget'}/>)
        }
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({key:'CmsPage',name: _t('CmsMenu.pages'), to: ADMIN_BASE_URL + '/cms', auth: true, icon: <WebIcon/>})
    })

    Hook.on('TypeTableColumns', ({type, columns}) => {
        if (type === 'CmsPage') {
            columns.splice(1, 0, {title: _t('CmsViewEditorContainer.preview'), id: 'preview'})
        }
    })

    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'CmsPage' && window.toolbar.visible) {
            dataSource.forEach((d, i) => {
                if (d.slug) {
                    const item = data.results[i]
                    if( item ) {
                        d.preview =  <Link style={{display:'block', lineHeight: '0'}} to={cmsPageEditorUrl(item.slug, container.pageParams._version)}>
                            <img style={{}} width={120} height={80}
                                         src={getImageFromCmsPageItem(item)}/>
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
                divider:true,
                name: _t('CmsMenu.viewCmsPage'),
                onClick: () => {
                    container.props.history.push(cmsPageEditorUrl(item.slug, container.pageParams._version))
                },
                icon: <WebIcon/>
            })
        }
    })



    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions, pageParams, data}) {
        if (type === 'CmsPage') {
            actions.unshift({
                name: _t('CmsMenu.addFromHtml'),
                onClick: () => {
                    this.setState({createEditDialog: true, createEditDialogOption: {key:'addFromHtml'}})
                },
                icon:'addQueue'
            })

            actions.unshift({
                name: _t('CmsMenu.addFromZip'),
                onClick: () => {
                    this.setState({createEditDialog: true, createEditDialogOption: {key:'addFromZip'}})
                },
                icon:'folderZip'
            })


            const isImageView = pageParams.view==='image'
            if(isImageView){
                this.tableRenderer = ()=>{
                    return <SimpleImageList items={data.results.map(ds=>({
                        author: ds.createdBy.username,
                        title: _t(ds.name),
                        href:cmsPageEditorUrl(ds.slug, pageParams._version),
                        img:getImageFromCmsPageItem(ds)}))}/>
                }
            }else{
                delete this.tableRenderer
            }
            actions.push({
                    name: isImageView?'List view':'Image view',
                    onClick: () => {
                        this.goTo({view: isImageView?'':'image'})
                    },
                    icon:isImageView?'view':'image'
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
            const dialogKey = meta.TypeContainer.state?.createEditDialogOption?.key
            if ( dialogKey === 'convertingHtml'){
                props.title = _t('CmsPageEdit.convertHtml')
                props.actions = []
                props.children = <><CircularProgress color="success" size={40}/>loading....</>
            }else if (dialogKey === 'addFromZip' || dialogKey === 'addFromHtml'){
                const newFields = {author:formFields.author,slug:formFields.slug,name:formFields.name}

                if(dialogKey === 'addFromZip'){
                    newFields.zip={accept:'zip,application/octet-stream,application/zip,application/x-zip,application/x-zip-compressed',uitype:'upload',required:true,label:'ZIP File',name:'zip',tab:'elements.generalTab'}
                    props.actions = [{key: 'cancel',label: _t('core.cancel')},{key: 'loadZip', label: _t('CmsPageEdit.loadZip'), type: 'primary'}]

                }else{
                    newFields.html={uitype:'htmlEditor',required:true,label:'HTML',name:'html',tab:'elements.generalTab'}
                    props.actions = [{key: 'cancel',label: _t('core.cancel')},{key: 'convertHtml', label: _t('CmsPageEdit.convertHtml'), type: 'primary'}]
                }

                props.children = <>
                    <GenericForm key="CmsPageForm" autoFocus onRef={ref => {
                        if (ref) {
                            parentRef.createEditForm = ref
                        }
                    }} onBlur={event => {
                        Hook.call('TypeCreateEditBlur', {type, event})
                    }} primaryButton={false} fields={newFields}/>
                </>
            }else {
                const newFields = Object.assign({}, formFields)

                delete newFields.template
                delete newFields.script
                delete newFields.serverScript
                delete newFields.manual
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
                        if (ref) {
                            parentRef.createEditForm = ref
                        }
                    }} onBlur={event => {
                        Hook.call('TypeCreateEditBlur', {type, event})
                    }} primaryButton={false} fields={newFields} values={dataToEdit}/>]
            }
        }
    })

    Hook.on('TypeCreateEditAction', async ({type, action, typeEdit, meta, createEditForm}) => {
        if (type === 'CmsPage' && action) {
            if (action.key === 'loadZip') {
                const formValidation = createEditForm.validate(createEditForm.state, true, {changeTab: true})
                if (!formValidation.isValid) {
                    console.warn('validation error', formValidation)
                    return
                }
                const files = createEditForm?.state?.fields?.zip?.files || {}
                const fileNames = Object.keys(files)
                if(fileNames.length>0) {
                    const getFileContent = async (fileName) => {
                        const file = fileNames.find(file => file.indexOf(fileName) >= 0)
                        return file ? await files[file].async('string') : ''
                    }
                    const html = await getFileContent('/dist/index.html')
                    if(!createEditForm.state.fields.slug){
                        createEditForm.handleInputChange({
                            target: {
                                name: 'slug',
                                value: fileNames[0].substring(0,fileNames[0].indexOf('/'))
                            }
                        })
                    }

                    if (html) {

                        meta.TypeContainer.setState({
                            createEditDialogOption: {
                                key: 'convertingHtml',
                                disableEscapeKeyDown: true
                            }
                        })

                        convertHtmlAndSet({
                            html,
                            style: await getFileContent('/dist/style.css'),
                            script: await getFileContent('/dist/script.js'),
                            meta, typeEdit
                        })
                    }
                }
            } else if (action.key === 'convertHtml' || action.key === 'loadZip') {
                const formValidation = createEditForm.validate(createEditForm.state, true, {changeTab: true})
                if (!formValidation.isValid) {
                    console.warn('validation error', formValidation)
                    return
                }

                meta.TypeContainer.setState({
                    createEditDialogOption: {
                        key: 'convertingHtml',
                        disableEscapeKeyDown: true
                    }
                })

                convertHtmlAndSet({html:createEditForm.state.fields.html, meta, typeEdit})

            }
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
