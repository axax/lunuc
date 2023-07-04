import React from 'react'
import 'gen/extensions-client-admin'
import {
    getSlugVersion,
    getGqlVariables,
    settingKeyPrefix,
    CMS_PAGE_QUERY
} from '../util/cmsView.mjs'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import Expandable from 'client/components/Expandable'
import ErrorHandler from 'client/components/layout/ErrorHandler'
import DataResolverEditor from '../components/DataResolverEditor'
import TemplateEditor from '../components/TemplateEditor'
import ScriptEditor from '../components/ScriptEditor'
import ResourceEditor from '../components/ResourceEditor'
import {
    TextField,
    Typography,
    DrawerLayout,
    MenuList,
    MenuListItem,
    Button,
    IconButton,
    SimpleSelect,
    SimpleSwitch,
    SimpleDialog,
    SimpleMenu,
    Divider,
    UIProvider
} from 'ui/admin'
import {
    LogoutIcon, PreviewIcon
} from 'gensrc/ui/admin/icons'
import Drawer from '@mui/material/Drawer'
import DisplaySettingsIcon from '@mui/icons-material/DisplaySettings'
import AppsIcon from '@mui/icons-material/Apps'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import NetworkStatusHandler from 'client/components/layout/NetworkStatusHandler'
import {getTypeQueries} from 'util/types.mjs'
import Util from '../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_CMS_CONTENT, CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants/index.mjs'
import {propertyByPath, setPropertyByPath, findSegmentByKeyOrPath} from '../../../client/util/json.mjs'
import GenericForm from '../../../client/components/GenericForm'
import {_t} from '../../../util/i18n.mjs'
import config from 'gen/config-client'
import {getFormFieldsByType} from '../../../util/typesAdmin.mjs'
import Hook from '../../../util/hook.cjs'
import {client, Query, graphql} from '../../../client/middleware/graphql'
import Async from '../../../client/components/Async'
import CmsRevision from '../components/CmsRevision'
import OpenTypeEdit from '../components/OpenTypeEdit'
import CmsAddNewSite from '../components/CmsAddNewSite'
import CmsElement from '../components/CmsElement'
import JsonDomHelper from '../components/JsonDomHelper'
import CmsRelatedPages from '../components/CmsRelatedPages'

const CodeEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

const DEFAULT_EDITOR_SETTINGS = {inlineEditor: true, fixedLayout: true, drawerOpen: false, drawerWidth: 500}


class CmsViewEditorContainer extends React.Component {

    templateChangeHistory = []

    constructor(props) {
        super(props)
        this.state = CmsViewEditorContainer.propsToState(props, null)
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.cmsPage && !nextProps.loading) {

            if (prevState.slug == undefined || nextProps.cmsPage.slug !== prevState.slug) {
                console.log('update state')
                return CmsViewEditorContainer.propsToState(nextProps, prevState)
            }
        }
        return null
    }

    static propsToState(props, state) {
        const {
            template,
            script,
            style,
            uniqueStyle,
            serverScript,
            resources,
            dataResolver,
            ssr,
            slug,
            urlSensitiv,
            name,
            keyword,
            parseResolvedData,
            alwaysLoadAssets,
            loadPageOptions,
            ssrStyle,
            publicEdit,
            compress,
            meta
        } = props.cmsPage || {}

        const result = {
            public: props.cmsPage && props.cmsPage.public,
            slug,
            name,
            keyword,
            template,
            resources,
            script,
            style,
            uniqueStyle,
            serverScript,
            dataResolver,
            ssr,
            urlSensitiv,
            parseResolvedData,
            alwaysLoadAssets,
            loadPageOptions,
            ssrStyle,
            publicEdit,
            compress,
            addNewSite: null,
            ignoreStatus: false
        }

        if (meta) {
            const metaJson = JSON.parse(meta)

            result.EditorOptions = metaJson.EditorOptions
            result.EditorPageOptions = metaJson.EditorPageOptions
            result.PageOptionsDefinition = metaJson.PageOptionsDefinition
            result.PageOptions = metaJson.PageOptions
        }
        if (!result.EditorOptions) {
            result.EditorOptions = DEFAULT_EDITOR_SETTINGS
        }
        if (!result.EditorPageOptions) {
            result.EditorPageOptions = {}
        }


        if (state && state.addNewSite && props.cmsPage && props.cmsPage.slug === state.slug) {
            result.addNewSite = state.addNewSite
        } else if (props.cmsPage && !props.cmsPage._id) {
            result.addNewSite = {slugNoExist: props.slug, slug: props.slug}
        }

        return result
    }


    componentDidMount() {
        const {history, dynamic} = this.props

        if (!dynamic) {
            this._handleWindowClose = this.saveUnsafedChanges.bind(this)
            window.addEventListener('beforeunload', ()=>{
                console.log('beforeunload')
                this._handleWindowClose()
            })
            window.addEventListener('blur', () => {
                this._handleWindowClose(true)
            })

            history.block(() => {
                console.log('block')
                this.saveUnsafedChanges()
                return true
            })
        }
    }

    watchCmsPageStatus(instant) {
        clearTimeout(this._watchCmsPageStatus)
        this._watchCmsPageStatus = setTimeout(() => {
            if (!this.state.ignoreStatus && !this.props.dynamic && this.props.cmsPage && this.props.cmsPage.realSlug !== undefined) {
                client.query({
                    fetchPolicy: 'no-cache',
                    query: `query cmsPageStatus($slug: String!){cmsPageStatus(slug: $slug){data user{username _id}}}`,
                    variables: {
                        slug: this.props.cmsPage.realSlug
                    },
                }).then((res) => {
                    this.watchCmsPageStatus()
                    if (res.data.cmsPageStatus && res.data.cmsPageStatus.user && this.props.user.userData) {

                        if (res.data.cmsPageStatus.user._id !== this.props.user.userData._id) {
                            this.setState({
                                simpleDialog: {
                                    title: "Seite in Bearbeitung von einem anderen Benutzer",
                                    text: "Die Seite wird gerade von " + res.data.cmsPageStatus.user.username + " bearbeitet. Möchten Sie die Seite trotzdem bearbeiten?",
                                    actions: [
                                        {
                                            key: 'ok',
                                            label: 'Ja trotzdem bearbeiten',
                                            type: 'primary'
                                        }
                                    ],
                                    onClose: () => {
                                        this.setState({ignoreStatus: true})
                                    }
                                }
                            })
                        } else if (res.data.cmsPageStatus.data !== JSON.stringify(this.state.cmsStatusData)) {
                            this.setState({cmsStatusData: JSON.parse(res.data.cmsPageStatus.data)})
                        }
                    }
                })
            }
        }, instant ? 0 : 10000)
    }

    componentWillUnmount() {
        clearTimeout(this._watchCmsPageStatus)
        this.saveUnsafedChanges()
        window.removeEventListener('beforeunload', this._handleWindowClose)
        window.removeEventListener('blur', this._handleWindowClose)
    }


    shouldComponentUpdate(props, state) {
        const noCmsPage = !props.cmsPage || !this.props.cmsPage,
            slugChanged = noCmsPage || props.cmsPage.slug !== this.props.cmsPage.slug

        if (slugChanged) {
            JsonDomHelper.disableEvents = false
            this.watchCmsPageStatus(true)
        }

        if (props.aboutToChange) {
            return false
        }
        /* console.log('user changed', props.user != this.props.user)
         console.log('user changed', props.user != this.props.user)
         console.log('children changed', props.children != this.props.children)
         console.log('_props changed', props._props !== this.props._props)
         console.log('slug changed', slugChanged)
         console.log('loading changed', props.loading !== this.props.loading)
         console.log('cmsStatusData changed', state.cmsStatusData !== this.state.cmsStatusData)
         console.log('EditorOptions changed', state.EditorOptions !== this.state.EditorOptions)
         console.log('EditorPageOptions changed', state.EditorPageOptions !== this.state.EditorPageOptions)*/
         //console.log('props.cmsPage.urlSensitiv', props.cmsPage.urlSensitiv)
        // only update if it is needed
        return noCmsPage ||
            props.loading !== this.props.loading ||
            slugChanged ||
            /*props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||*/
            state.cmsTemplateEditData !== this.state.cmsTemplateEditData ||
            state.cmsEditData !== this.state.cmsEditData ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            props.user !== this.props.user ||
            (props.children != this.props.children && !state.cmsEditData) ||
            props._props !== this.props._props ||
            state.template !== this.state.template ||
            state.showPageSettings !== this.state.showPageSettings ||
            state.script !== this.state.script ||
            state.dataResolver !== this.state.dataResolver ||
            state.style !== this.state.style ||
            state.uniqueStyle !== this.state.uniqueStyle ||
            state.parseResolvedData !== this.state.parseResolvedData ||
            state.alwaysLoadAssets !== this.state.alwaysLoadAssets ||
            state.loadPageOptions !== this.state.loadPageOptions ||
            state.ssrStyle !== this.state.ssrStyle ||
            state.publicEdit !== this.state.publicEdit ||
            state.public !== this.state.public ||
            state.ssr !== this.state.ssr ||
            state.urlSensitiv !== this.state.urlSensitiv ||
            state.name !== this.state.name ||
            state.keyword !== this.state.keyword ||
            state.compress !== this.state.compress ||
            state.simpleDialog !== this.state.simpleDialog ||
            state.addNewSite !== this.state.addNewSite ||
            state.serverScript !== this.state.serverScript ||
            state.EditorOptions !== this.state.EditorOptions ||
            Util.shallowCompare(state.EditorPageOptions, this.state.EditorPageOptions,
                {ignoreKeys:['styleScroll','dataResolverScroll','serverScriptScroll','templateScroll','scriptScroll']}) ||
            state.cmsStatusData !== this.state.cmsStatusData ||
            (
                !!props.cmsPage.urlSensitiv && (
                    props.location.search !== this.props.location.search ||
                    props.location.hash !== this.props.location.hash)
            )

    }

    render() {
        const {WrappedComponent, cmsPage, ...props} = this.props
        const {cmsEditData, cmsTemplateEditData} = this.state

        const {
            template,
            resources,
            script,
            style,
            EditorOptions,
            EditorPageOptions,
            PageOptionsDefinition,
            PageOptions,
            dataResolver,
            serverScript,
            simpleDialog,
            showPageSettings
        } = this.state

        if (!cmsPage) {
            // show a loader here
            if (!props.dynamic) {
                return <NetworkStatusHandler/>
            }
        }
        const loadingState = this.props.loading

        const isSmallScreen = window.innerWidth < 1000

        // extend with value from state because they are more update to date
        const cmsPageWithState = Object.assign({}, cmsPage, {script, style, template, meta: {PageOptions}})

        console.log(`render CmsViewEditorContainer ${this.props.slug} (loading=${loadingState})`, cmsPage)

        const canManageCmsPages = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_CONTENT),
            canMangeCmsTemplate = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_TEMPLATE)

        let cmsEditDataProps

        if (cmsEditData && !cmsEditData.type) {
            cmsEditDataProps = this.getDataResolverProperty(cmsEditData)
        }


        const DataEditDialog = () => {
            if (cmsEditData) {
                if (cmsEditData.type) {

                    if (cmsEditData._id) {
                        return <Query key="dataEditor"
                                      query={getTypeQueries(cmsEditData.type).query}
                                      variables={{
                                          filter: `_id=${cmsEditData._id}`,
                                          meta: cmsEditData.genericType || cmsEditData.resolverKey
                                      }}
                                      fetchPolicy="network-only">

                            {({loading, error, data}) => {
                                if (loading) {
                                    return 'Loading...'
                                }

                                if (error) return `Error! ${error.message}`

                                const keys = Object.keys(data)
                                let finalData
                                if (keys.length > 0) {
                                    finalData = data[keys[0]]
                                }

                                if (!finalData || finalData.results.length === 0) {

                                    this.setState({
                                        cmsEditData: null,
                                        simpleDialog: {
                                            title: "Keine Daten",
                                            text: "Sie haben vermutlich keine Berechtigung diese Daten zu bearbeiten"
                                        }
                                    })
                                    return null
                                }

                                return <OpenTypeEdit
                                    onClose={this.handleEditDataClose.bind(this)}
                                    cmsEditData={cmsEditData}
                                    data={finalData}/>
                            }}
                        </Query>
                    } else {
                        return <OpenTypeEdit
                            onClose={this.handleEditDataClose.bind(this)}
                            cmsEditData={cmsEditData}/>
                    }
                } else {

                    let formRef
                    return <SimpleDialog fullWidth={true} maxWidth="sm" key="propertyEditor" open={true}
                                         onClose={(e) => {
                                             if (e.key === 'save' && formRef) {
                                                 const field = formRef.state.fields.field
                                                 this.handleDataResolverPropertySave({
                                                     value: field,
                                                     path: cmsEditData._id,
                                                     instantSave: true
                                                 })
                                             }
                                             this.editCmsData(null)
                                         }}
                                         actions={[{
                                             key: 'cancel',
                                             label: _t('core.cancel'),
                                             type: 'secondary'
                                         },
                                             {
                                                 key: 'save',
                                                 label: _t('core.save'),
                                                 type: 'primary'
                                             }]}
                                         title="Bearbeitung">

                        <GenericForm primaryButton={false} onRef={(e) => {
                            formRef = e
                        }} fields={cmsEditDataProps}/>


                    </SimpleDialog>
                }
            }
            return null
        }

        const inner = [
            !loadingState && <WrappedComponent key="cmsView"
                                               cmsEditData={cmsEditData}
                                               onTemplateChange={this.handleTemplateChange}
                                               findSegmentInDataResolverByKeyOrPath={this.findSegmentInDataResolverByKeyOrPath.bind(this)}
                                               inEditor={canManageCmsPages}
                                               onError={this.handleCmsError.bind(this)}
                                               onDataResolverPropertyChange={this.handleDataResolverPropertySave.bind(this)}
                                               settings={EditorOptions}
                                               cmsPage={cmsPageWithState}
                                               cmsEditorActions={{
                                                   editTemplate: this.editTemplate.bind(this),
                                                   editCmsData: this.editCmsData.bind(this)
                                               }}
                                               {...props} />
            ,
            <ErrorHandler key="errorHandler" snackbar/>,
            <NetworkStatusHandler key="networkStatus"/>,
            simpleDialog && <SimpleDialog open={true}
                                          onClose={(action) => {
                                              if (simpleDialog.onClose) {
                                                  simpleDialog.onClose(action)
                                              }
                                              this.setState({simpleDialog: null})
                                          }}
                                          actions={simpleDialog.actions || [
                                              {
                                                  key: 'ok',
                                                  label: 'Ok',
                                                  type: 'primary'
                                              }]}
                                          title={simpleDialog.title}>
                {simpleDialog.text}
            </SimpleDialog>,
            cmsTemplateEditData && cmsTemplateEditData.key &&
            <SimpleDialog fullWidth={true} maxWidth="lg" key="templateEditor" open={true}
                          onClose={this.handleComponentEditClose.bind(this)}
                          actions={[{
                              key: 'ok',
                              label: 'Ok',
                              type: 'primary'
                          }]}
                          title="Edit Component">
                <TemplateEditor
                    fabButtonStyle={{bottom: '3rem', right: '1rem'}}
                    component={cmsTemplateEditData}
                    tab={EditorPageOptions.templateTab}
                    onTabChange={this.handleSettingChange.bind(this, 'templateTab', true)}
                    onChange={this.handleTemplateChange.bind(this)}/>


                <Button key="editParent" size="small" variant="contained" color="primary" onClick={e => {
                    this.editTemplate(cmsTemplateEditData.key.substring(0, cmsTemplateEditData.key.lastIndexOf('.')), cmsTemplateEditData.json, cmsTemplateEditData.scope)
                }}>Edit parent component</Button>
            </SimpleDialog>,
            <DataEditDialog key="dataEditDialog"/>
        ]
        if (!canManageCmsPages || props.dynamic) {
            if ((cmsPage && cmsPage.publicEdit) || props.forceEditMode==='true') {
                return <UIProvider>{inner}</UIProvider>
            }
            return inner
        } else {
            const {slug, _version} = getSlugVersion(props.slug)
            const sideMenu = []
            if (EditorOptions.sideMenu) {
                sideMenu.push(...EditorOptions.sideMenu)
            }

            const sidebar = cmsPage._id && <>
                {sideMenu.length > 0 && <MenuList>
                    {
                        sideMenu.map(menu => {
                            return <MenuListItem onClick={e => {
                                const win = window.open(menu.link, '_blank')
                                win.focus()
                            }} button primary={menu.label}/>
                        })
                    }
                </MenuList>}
                {sideMenu.length > 0 && <Divider/>}

                {!(EditorOptions.bottomNavigation>0) && <Box style={{
                    display: 'flex',
                    overflow: 'auto',
                    flexDirection: 'column',
                    marginBottom: 'auto'}}>

                    {canMangeCmsTemplate && <Expandable title="Data resolver"
                                                        icon="storage"
                                                        disableGutters
                                                        onChange={this.handleSettingChange.bind(this, 'dataResolverExpanded', true)}
                                                        expanded={EditorPageOptions.dataResolverExpanded}>
                        <DataResolverEditor onScroll={this.handleSettingChange.bind(this, 'dataResolverScroll', true)}
                                            scrollPosition={EditorPageOptions.dataResolverScroll}
                                            onBlur={() => {
                                                this.saveUnsafedChanges()
                                            }}
                                            onChange={this.handleDataResolverChange.bind(this)}>{dataResolver}</DataResolverEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Server Script"
                                                        icon="code"
                                                        disableGutters
                                                        onChange={this.handleSettingChange.bind(this, 'serverScriptExpanded', true)}
                                                        expanded={EditorPageOptions.serverScriptExpanded}>
                        <ScriptEditor
                            key={'script' + slug}
                            identifier={'serverScript' + cmsPage._id}
                            onScroll={this.handleSettingChange.bind(this, 'serverScriptScroll', true)}
                            scrollPosition={EditorPageOptions.serverScriptScroll}
                            onBlur={() => {
                                this.saveUnsafedChanges()
                            }}
                            onChange={this.handleServerScriptChange.bind(this)}>{serverScript}</ScriptEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Template"
                                                        icon="html"
                                                        disableGutters
                                                        onChange={this.handleSettingChange.bind(this, 'templateExpanded', true)}
                                                        expanded={EditorPageOptions.templateExpanded}>
                        <TemplateEditor
                            onScroll={this.handleSettingChange.bind(this, 'templateScroll', true)}
                            scrollPosition={EditorPageOptions.templateScroll}
                            tab={EditorPageOptions.templateTab}
                            onTabChange={(tab) => {
                                if (this._autoSaveTemplate) {
                                    this._autoSaveTemplate()
                                }
                                this.handleSettingChange('templateTab', true, tab)
                            }}
                            onChange={this.handleTemplateChange.bind(this)}>{template}</TemplateEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Script"
                                                        icon="js"
                                                        disableGutters
                                                        onChange={this.handleSettingChange.bind(this, 'scriptExpanded', true)}
                                                        expanded={EditorPageOptions.scriptExpanded}>
                        <ScriptEditor
                            identifier={'script' + cmsPage._id}
                            onScroll={this.handleSettingChange.bind(this, 'scriptScroll', true)}
                            scrollPosition={EditorPageOptions.scriptScroll}
                            onChange={this.handleClientScriptChange.bind(this)}>{script}</ScriptEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Style"
                                                        icon="css"
                                                        disableGutters
                                                        onChange={this.handleSettingChange.bind(this, 'styleExpanded', true)}
                                                        expanded={EditorPageOptions.styleExpanded}>

                        <CodeEditor showFab
                                    lineNumbers
                                    fileSplit
                                    identifier={slug}
                                    fileIndex={EditorPageOptions.styleFileIndex}
                                    onFileChange={this.handleSettingChange.bind(this, 'styleFileIndex', true)}
                                    type="css"
                                    onScroll={this.handleSettingChange.bind(this, 'styleScroll', true)}
                                    scrollPosition={EditorPageOptions.styleScroll}
                                    onChange={this.handleStyleChange.bind(this)}>{style}</CodeEditor>

                        <SimpleSwitch
                            label="Unique Style"
                            checked={!!this.state.uniqueStyle}
                            onChange={this.handleFlagChange.bind(this, 'uniqueStyle')}
                        />

                    </Expandable>}


                    {canMangeCmsTemplate && <Expandable title={_t('CmsViewEditorContainer.staticAssets')}
                                                        disableGutters
                                                        icon="link"
                                                        onChange={this.handleSettingChange.bind(this, 'resourceExpanded', true)}
                                                        expanded={EditorPageOptions.resourceExpanded}>

                        <ResourceEditor resources={resources}
                                        onChange={this.handleResourceChange.bind(this)}></ResourceEditor>
                    </Expandable>}


                    <Expandable title={_t('CmsViewEditorContainer.settings')}
                                disableGutters
                                icon="displaySetting"
                                onChange={this.handleSettingChange.bind(this, 'settingsExpanded', true)}
                                expanded={EditorPageOptions.settingsExpanded}>

                        <TextField key="pageTitle"
                                   name="pageTitle"
                                   label={_t('CmsViewEditorContainer.pageTitle')}
                                   InputLabelProps={{
                                       shrink: true,
                                   }}
                                   onBlur={(e) => {
                                       let value = {...cmsPage.name, [_app_.lang]: e.target.value}
                                       this.handleFlagChange('name', null, value)
                                   }}
                                   value={this.state.name ? this.state.name[_app_.lang] : ''}
                                   fullWidth={true}/>

                        <TextField key="pageKeywords"
                                   name="pageKeywords"
                                   label={_t('CmsViewEditorContainer.pageKeywords')}
                                   InputLabelProps={{
                                       shrink: true,
                                   }}
                                   onBlur={(e) => {
                                       let value = {...cmsPage.keyword, [_app_.lang]: e.target.value}
                                       this.handleFlagChange('keyword', null, value)
                                   }}
                                   value={this.state.keyword ? this.state.keyword[_app_.lang] : ''}
                                   fullWidth={true}/>

                        {canMangeCmsTemplate ? <React.Fragment>
                            <SimpleSelect
                                fullWidth={true}
                                label="Url sensitive (refresh component on url or props change)"
                                value={this.state.urlSensitiv == 'true' ? 'full' : this.state.urlSensitiv}
                                style={{marginBottom: 0, marginTop: 0}}
                                onChange={(e) => {
                                    this.handleFlagChange('urlSensitiv', null, e.target.value)
                                }}
                                items={[{name: 'None', value: ''}, {
                                    name: 'Full',
                                    value: 'full'
                                }, {name: 'Client (nothing is sent to the server)', value: 'client'}]}
                            /><br/>
                            <SimpleSwitch
                                label="SSR (Server side Rendering)"
                                checked={!!this.state.ssr}
                                onChange={this.handleFlagChange.bind(this, 'ssr')}
                            /><br/>
                            <SimpleSwitch
                                label={_t('CmsViewEditorContainer.public')}
                                checked={!!this.state.public}
                                onChange={this.handleFlagChange.bind(this, 'public')}
                            /><br/>
                            <SimpleSwitch
                                label="Always load assets (even when component is loaded dynamically)"
                                checked={!!this.state.alwaysLoadAssets}
                                onChange={this.handleFlagChange.bind(this, 'alwaysLoadAssets')}
                            /><br/>
                            <SimpleSwitch
                                label="Load page options"
                                checked={!!this.state.loadPageOptions}
                                onChange={this.handleFlagChange.bind(this, 'loadPageOptions')}
                            /><br/>
                            <SimpleSwitch
                                label="Compress response"
                                checked={!!this.state.compress}
                                onChange={this.handleFlagChange.bind(this, 'compress')}
                            /><br/>
                            <SimpleSwitch
                                label="Server side style rendering"
                                checked={!!this.state.ssrStyle}
                                onChange={this.handleFlagChange.bind(this, 'ssrStyle')}
                            /><br/>
                            <SimpleSwitch
                                label="Page is publicly editable"
                                checked={!!this.state.publicEdit}
                                onChange={this.handleFlagChange.bind(this, 'publicEdit')}
                            /><br/>
                            <SimpleSwitch
                                label="Parse resolvedData in frontend (replace placeholders)"
                                checked={!!this.state.parseResolvedData}
                                onChange={this.handleFlagChange.bind(this, 'parseResolvedData')}
                            /></React.Fragment>:
                            <React.Fragment>

                                <SimpleSwitch
                                    label={_t('CmsViewEditorContainer.public')}
                                    checked={!!this.state.public}
                                    onChange={this.handleFlagChange.bind(this, 'public')}
                                /><br/>

                            </React.Fragment>}
                    </Expandable>

                    {!loadingState && <Expandable title={_t('CmsViewEditorContainer.revisions')}
                                                  disableGutters
                                                  icon="history"
                                                  onChange={this.handleSettingChange.bind(this, 'revisionsExpanded', true)}
                                                  expanded={EditorPageOptions.revisionsExpanded}>

                        <CmsRevision historyLimit={10}
                                     cmsPage={cmsPage}
                                     canMangeCmsTemplate={canMangeCmsTemplate}
                                     slug={slug}
                                     user={props.user}
                                     onTemplateChange={this.handleTemplateChange.bind(this)}/>

                    </Expandable>}


                    <Expandable title={_t('CmsViewEditorContainer.pages')}
                                disableGutters
                                icon="web"
                                onChange={this.handleSettingChange.bind(this, 'relatedPagesExpanded', true)}
                                expanded={EditorPageOptions.relatedPagesExpanded}>
                        <CmsRelatedPages _version={_version} slug={slug} history={props.history} cmsPage={cmsPage}/>
                    </Expandable>
                </Box>}
                {EditorOptions.bottomNavigation===1 && <Box style={{padding: '10px',
                    display: 'flex',
                    overflow: 'auto',
                    flexDirection: 'column',
                    marginBottom: 'auto'}}>

                    <CmsElement disabled={!EditorOptions.inlineEditor}
                                advanced={canMangeCmsTemplate}/>
                </Box>}

                <Box sx={{width: '100%'}}>
                    <Paper elevation={3}>
                        <BottomNavigation
                            showLabels
                            value={EditorOptions.bottomNavigation}
                            onChange={(event, newValue) => {
                                this.handleSettingChange('bottomNavigation', false, newValue)
                            }}>
                            <BottomNavigationAction label={_t('CmsViewEditorContainer.pageOptions')} icon={<DisplaySettingsIcon />} />
                            <BottomNavigationAction label={_t('CmsViewEditorContainer.pageElements')} icon={<AppsIcon />} />
                        </BottomNavigation>
                    </Paper>
                </Box>
            </>

            const moreMenu = [
                {
                    divider: true,
                    icon: 'add',
                    name: _t('CmsViewEditorContainer.addnewpage'), onClick: () => {
                        this.setState({addNewSite: {}})

                    }
                },
                {
                    icon:'displaySetting',
                    name: _t('CmsViewEditorContainer.pagesettings'), onClick: () => {
                        this.setState({showPageSettings: true})
                    }
                }
            ]
            if (config.LANGUAGES.length > 1) {
                moreMenu.push(
                    {
                        icon:'translate',
                        divider: true,
                        name: _t('CmsViewEditorContainer.languages'),
                        items: []
                    },
                    {
                        divider: true,
                        icon:'magic',
                        name: _t('CmsViewEditorContainer.autotranslate'), onClick: () => {
                            const {segment, dataResolver} = this.findSegmentInDataResolverByKeyOrPath({path: 'tr'})
                            if (segment.tr && segment.tr[config.DEFAULT_LANGUAGE]) {
                                let timeout
                                const saveResolver = () => {
                                    clearTimeout(timeout)
                                    timeout = setTimeout(() => {
                                        this.handleDataResolverChange(JSON.stringify(dataResolver, null, 2), true)
                                    }, 100)
                                }
                                const transRec = (o, base, path) => {
                                    if (!o || o.constructor !== Object) {
                                        return
                                    }
                                    const overrideTranslations = false
                                    Object.keys(o).forEach(key => {
                                        if (o[key] && o[key].constructor === String) {
                                            config.LANGUAGES.forEach(lang => {
                                                if ((overrideTranslations || !base[lang] || !base[lang][key]) && lang !== config.DEFAULT_LANGUAGE) {
                                                    const text = o[key].replace(/\\n/g, '\n').replace(/%(\w+)%/g, '@_$1_')
                                                    client.query({
                                                        fetchPolicy: 'no-cache',
                                                        query: 'query translate($text: String!, $toIso: String!){translate(text: $text, toIso: $toIso){text toIso}}',
                                                        variables: {
                                                            text,
                                                            toIso: lang,
                                                            fromIso: config.DEFAULT_LANGUAGE
                                                        },
                                                    }).then((res) => {
                                                        // double escape
                                                        const newText = Util.escapeForJson(Util.escapeForJson(res.data.translate.text.replace(/@_(\w+)_/g, '%$1%').replace(/\\/g, '')))
                                                        setPropertyByPath(newText, lang + path + '.' + key.replace(/\./g, '\\\.'), base)
                                                        saveResolver()

                                                    })

                                                }
                                            })
                                        }
                                    })
                                }
                                transRec(segment.tr[config.DEFAULT_LANGUAGE], segment.tr, '')


                            }

                        }
                    }
                )
                config.LANGUAGES.forEach(lang => {
                    if (lang !== _app_.lang) {
                        moreMenu[2].items.push({
                            name: lang, onClick: () => {
                                window.location.href = Util.translateUrl(lang)

                            }
                        })
                    }
                })
            }


            if (this.templateChangeHistory.length > 0) {
                moreMenu.push(
                    {
                        divider: true,
                        name: _t('CmsViewEditorContainer.undochange') + ' (' + this.templateChangeHistory.length + ')',
                        onClick: () => {
                            if (this.templateChangeHistory.length > 0) {
                                this.handleTemplateChange(this.templateChangeHistory[0], true, true)
                                this.templateChangeHistory.splice(0, 1)
                            }
                        }
                    })
            }


            const toolbarRight = []
            if (isSmallScreen) {
                moreMenu.unshift({
                    component: <SimpleSwitch key="inlineEditorSwitch" color="default"
                                             checked={!!EditorOptions.inlineEditor}
                                             onChange={this.handleSettingChange.bind(this, 'inlineEditor', false)}
                                             label={_t('CmsViewEditorContainer.inlineEditor')}/>
                })
            }else{
                toolbarRight.push(
                    <SimpleSwitch key="inlineEditorSwitch" dark={true}
                                  checked={!!EditorOptions.inlineEditor}
                                  onChange={this.handleSettingChange.bind(this, 'inlineEditor', false)}
                                  label={_t('CmsViewEditorContainer.inlineEditor')}/>)
            }

            moreMenu.push(
                {
                    divider: true,
                    name: _t('CmsViewEditorContainer.preview'),
                    icon: <PreviewIcon/>,
                    onClick: () => {
                        window.open(location.pathname + '?preview=true', '_blank').focus();
                    }
                },
                {
                    name: _t('CmsViewEditorContainer.previewResponsive'),
                    icon: 'devices',
                    onClick: () => {
                        window.open(`/system/responsive-viewer?url=${encodeURIComponent(location.pathname)}&preview=true`, '_blank').focus();
                    }
                },
                {
                    divider: true,
                    icon: <LogoutIcon />,
                    name: _t('CmsViewEditorContainer.logout'),
                    onClick: () => {
                        this.props.history.push(`${config.ADMIN_BASE_URL}/logout?forward=${encodeURIComponent('/' + props.slug + '?logout=true')}`)
                    }
                },
                {
                    divider:true,
                    component:  <SimpleSwitch key="fixedLayoutSwitch" color="default"
                                              checked={!!EditorOptions.fixedLayout}
                                              onChange={this.handleSettingChange.bind(this, 'fixedLayout', false)}
                                              label={_t('CmsViewEditorContainer.fixed')}/>
                })

            toolbarRight.push(
                <Button key="buttonBack" size="small" color="inherit" onClick={() => {
                    this.props.history.push(config.ADMIN_BASE_URL)
                }}>Admin</Button>,
                <SimpleMenu key="moreMenu" color="inherit" items={moreMenu}/>)


            Hook.call('CmsViewEditorContainerRender', {
                moreMenu,
                isSmallScreen,
                toolbarRight,
                EditorOptions,
                EditorPageOptions,
                inner
            }, this)
            return <UIProvider>
                <Drawer anchor="right"
                        sx={{
                            zIndex: 1300,
                            '& .MuiDrawer-paper': {
                                maxWidth: '50%'
                            },
                        }}
                        disableEnforceFocus={true} open={showPageSettings}
                        onClose={() => {
                            if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
                                return
                            }
                            this.setState({showPageSettings: false})
                        }}> {showPageSettings && <div style={{padding: '1rem'}}>
                    {PageOptionsDefinition ? [
                        <Typography key="pageOptionTitle"
                                    variant="subtitle1">{_t('CmsViewEditorContainer.pagesettings')}</Typography>,
                        <GenericForm key="pageOptionForm" primaryButton={true}
                                     caption={_t('CmsViewEditorContainer.save')} onClick={(formData) => {
                            const pageName = cmsPage.realSlug.split('/')[0]
                            this.setState({PageOptions: formData})


                            this.props.setKeyValue({
                                key: 'PageOptions-' + pageName,
                                value: formData,
                                global: true,
                                callback: () => {
                                    location.href = location.href.split('#')[0]
                                }
                            })

                        }} fields={PageOptionsDefinition.reduce((obj, item) => {
                            return {...obj, [item.name]: item}
                        }, {})} values={PageOptions || {}}/>] : _t('CmsViewEditorContainer.noOptions')}</div>}
                </Drawer>
                <DrawerLayout sidebar={!loadingState && sidebar}
                              open={EditorOptions.drawerOpen}
                              fixedLayout={EditorOptions.fixedLayout}
                              drawerWidth={EditorOptions.drawerWidth}
                              onDrawerOpenClose={this.drawerOpenClose}
                              onDrawerWidthChange={this.drawerWidthChange}
                              toolbarLeft={<IconButton
                                  onClick={()=>{
                                      this.props.history.push(config.ADMIN_BASE_URL + '/cms' + (_app_._cmsLastSearch ? _app_._cmsLastSearch : ''))

                                  }}
                                  color="inherit"><ArrowBackIcon/></IconButton>}
                              toolbarRight={toolbarRight}
                              title={`${_t('CmsViewEditorContainer.editPage')} "${props.slug}"${cmsPage.online ? ' - Online' : ''}`}>
                    {inner}
                    {!loadingState && this.state.addNewSite && <CmsAddNewSite onClose={() => {
                        this.setState({addNewSite: false})
                    }} addNewSite={this.state.addNewSite} cmsPage={cmsPage}/>}
                </DrawerLayout>

            </UIProvider>
        }

    }


    handleDataResolverPropertySave({value, path, key, instantSave}) {
        const {segment, index, dataResolver} = this.findSegmentInDataResolverByKeyOrPath({path, key})

        if (segment) {
            if (key) {
                if (value === null) {
                    //remove
                    dataResolver.splice(index, 1)
                } else {
                    Object.keys(value).forEach(objKey => {
                        segment[objKey] = value[objKey]
                    })
                }
            } else {
                setPropertyByPath(value, path, segment)
            }
            this.handleDataResolverChange(JSON.stringify(dataResolver, null, 2), instantSave)
        }
    }

    getDataResolverProperty(cmsEditData) {
        const path = cmsEditData._id
        const {segment} = this.findSegmentInDataResolverByKeyOrPath({path})


        if (segment) {
            try {
                let props
                if (cmsEditData.props) {

                    if (cmsEditData.props.constructor === Object) {
                        props = cmsEditData.props
                    } else {
                        const correctJson = cmsEditData.props.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ');
                        props = JSON.parse(correctJson)
                    }
                }
                const newProps = {value: propertyByPath(path, segment)}
                if (newProps.value.constructor === Object || newProps.value.constructor === Array) {
                    newProps.uitype = 'json'
                }
                return {field: {...newProps, ...props}}

            } catch (e) {
                console.log(e)
                return {field: {value: '', error: true, helperText: e.message}}
            }


        }
        return {field: {value: ''}}
    }


    findSegmentInDataResolverByKeyOrPath({path, key}) {
        if (!this._tmpDataResolver) {
            if (this.state.dataResolver) {
                try {
                    this._tmpDataResolver = JSON.parse(this.state.dataResolver)
                } catch (e) {
                    console.log(e)
                    return {}
                }
            } else {
                this._tmpDataResolver = []
            }
        }

        let {segment, index} = findSegmentByKeyOrPath({json:this._tmpDataResolver, key, path})

        if (!segment) {
            if (key) {
                segment = {key}
            }else if(path){
                segment = {}
                setPropertyByPath({},path,segment)
            }
            this._tmpDataResolver.push(segment)
        }

        return {dataResolver: this._tmpDataResolver, segment, index}
    }

    handleCmsError(e, meta) {
        _app_.dispatcher.addError({key: 'cmsError', msg: `${meta.loc}: ${e.message} -> ${meta.slug}`})
    }

    saveUnsafedChanges(isBlur) {
        console.log(`safe unsafed changes for ${this.props.slug}`)
        // blur on unload to make sure everything gets saved
        const curElement = isBlur ? null : document.activeElement
        if (curElement) {
            curElement.blur()
        }
        // clear timeouts
        if (this._saveSettings) {
            this._saveSettings()
        }

        if (this._autoSaveScriptTimeout) {
            this._autoSaveScript(true)
        }

        if (this._autoSaveStyleTimeout) {
            this._autoSaveStyle()
        }

        if (this._autoSaveServerScriptTimeout) {
            this._autoSaveServerScript()
        }

        clearTimeout(this._templateTimeout)
        if (this._autoSaveTemplateTimeout) {
            this._autoSaveTemplate()
        }
        if (this._autoSaveDataResolverTimeout) {
            this._autoSaveDataResolver()
        }
        if (curElement) {
            curElement.focus()
        }
        return true
    }

    saveCmsPage = (value, data, key) => {
        if (value !== data[key]) {

            console.log('save cms', key)

            const {updateCmsPage} = this.props
            updateCmsPage(
                Object.assign({}, data, {[key]: value}), key, () => {
                }
            )
        }
    }

    handleFlagChange = (key, event, flag) => {
        if (this._saveSettings)
            this._saveSettings()
        this.setState({[key]: flag})
        this.saveCmsPage(flag, this.props.cmsPage, key)
    }


    handleClientScriptChange = (script) => {
        if (this._saveSettings)
            this._saveSettings()


        clearTimeout(this._scriptTimeout)
        this._scriptTimeout = null


        if (script.length > 50) {
            // delay change
            this._scriptTimeout = setTimeout(() => {
                this._scriptTimeout = null
                this.setState({script})
            }, 500)

        } else {
            this.setState({script})
        }

        this._autoSaveScript = (force) => {
            if (this._scriptTimeout) {
                if (force) {
                    this._scriptTimeout = clearTimeout(this._scriptTimeout)
                    this._autoSaveScriptTimeout = clearTimeout(this._autoSaveScriptTimeout)
                    this.setState({script})
                    this.saveCmsPage(script, this.props.cmsPage, 'script')
                } else {
                    this._autoSaveScriptTimeout = setTimeout(this._autoSaveScript, 5000)
                }
            } else {
                this._autoSaveScriptTimeout = clearTimeout(this._autoSaveScriptTimeout)
                this.saveCmsPage(this.state.script, this.props.cmsPage, 'script')
                delete this._autoSaveScript
            }
        }

        clearTimeout(this._autoSaveScriptTimeout)
        this._autoSaveScriptTimeout = setTimeout(this._autoSaveScript, 5000)
    }

    handleStyleChange = (style) => {
        if (this._saveSettings)
            this._saveSettings()

        clearTimeout(this._setStyleDelayed)
        this._setStyleDelayed = setTimeout(() => {
            this.setState({style})
        }, 1000)

        this._autoSaveStyle = () => {
            clearTimeout(this._autoSaveStyleTimeout)
            this._autoSaveStyleTimeout = 0
            this.saveCmsPage(style, this.props.cmsPage, 'style')
        }

        clearTimeout(this._autoSaveStyleTimeout)
        this._autoSaveStyleTimeout = setTimeout(this._autoSaveStyle, 5000)
    }

    handleServerScriptChange = (serverScript, instantSave) => {
        if (this._saveSettings)
            this._saveSettings()

        this.setState({serverScript})
        this._autoSaveServerScript = () => {
            clearTimeout(this._autoSaveServerScriptTimeout)
            this._autoSaveServerScriptTimeout = 0
            this.saveCmsPage(serverScript, this.props.cmsPage, 'serverScript')
        }

        clearTimeout(this._autoSaveServerScriptTimeout)
        if (instantSave) {
            this._autoSaveServerScript()
        } else {
            this._autoSaveServerScriptTimeout = setTimeout(this._autoSaveServerScript, 5000)
        }
    }

    handleDataResolverChange = (str, instantSave) => {
        if (this._saveSettings)
            this._saveSettings()
        this.setState({dataResolver: str}, () => {
            this._tmpDataResolver = null
        })

        this._autoSaveDataResolver = () => {
            clearTimeout(this._autoSaveDataResolverTimeout)
            this._autoSaveDataResolverTimeout = 0
            this.saveCmsPage(str, this.props.cmsPage, 'dataResolver')
        }
        clearTimeout(this._autoSaveDataResolverTimeout)
        if (instantSave === true) {
            this._autoSaveDataResolver()
        } else {
            this._autoSaveDataResolverTimeout = setTimeout(this._autoSaveDataResolver, instantSave || 1000)
        }
    }

    handleTemplateChange = (str, instantSave, skipHistory) => {
        if (str !== this.state.template) {
            clearTimeout(this._templateTimeout)

            this._templateTimeout = setTimeout(() => {
                if (str.constructor !== String) {
                    str = JSON.stringify(str, null, 2)
                }

                // save settings first
                if (this._saveSettings)
                    this._saveSettings()

                if (!skipHistory) {
                    this.templateChangeHistory.unshift(this.state.template)
                    if (this.templateChangeHistory.length > 10) {
                        this.templateChangeHistory.length = 10
                    }
                }

                this.setState({template: str, templateError: null})
                this._autoSaveTemplate = () => {
                    clearTimeout(this._autoSaveTemplateTimeout)
                    this._autoSaveTemplateTimeout = 0
                    this._autoSaveTemplate = null
                    this.saveCmsPage(str, this.props.cmsPage, 'template')
                }

                clearTimeout(this._autoSaveTemplateTimeout)
                if (instantSave) {
                    this._autoSaveTemplate()
                } else {
                    this._autoSaveTemplateTimeout = setTimeout(this._autoSaveTemplate, 5000)
                }

            }, instantSave ? 0 : 300)
        }
    }

    handleResourceChange = (str) => {
        this.setState({resources: str})
        this.saveCmsPage(str, this.props.cmsPage, 'resources')
    }

    drawerWidthChange = (newWidth) => {
        this.handleSettingChange('drawerWidth', false, newWidth)
    }

    drawerOpenClose = (open) => {
        this.handleSettingChange('drawerOpen', false, open)
    }

    handleComponentEditClose() {
        const {cmsTemplateEditData} = this.state
        this.saveCmsPage(this.state.template, this.props.cmsPage, 'template')

        this.editTemplate(null, cmsTemplateEditData.component, cmsTemplateEditData.scope)
    }

    handleEditDataClose(action, {optimisticData, dataToEdit, type}) {
        const {cmsEditData} = this.state

        if (optimisticData) {
            if (!dataToEdit) {
                window.location.href = window.location.href
                return
            } else {
                this.findAndUpdateResolvedData(cmsEditData._jsonDom.scope.root, cmsEditData.resolverKey || type, type, optimisticData, dataToEdit)
            }
        }

        this.editCmsData(null)
    }

    findAndUpdateResolvedData(jsonDom, resolverKey, type, optimisticData, dataToEdit) {
        const resolvedDataJson = JSON.parse(jsonDom.props.resolvedData),
            resolver = resolvedDataJson[resolverKey]
        if (resolver) {
            const results = resolver.results
            let idx = results.findIndex(x => x._id === dataToEdit._id)

            if (idx < 0) {
                idx = 0
                results.unshift({_id: dataToEdit._id})
            }

            results[idx] = Object.assign(results[idx], optimisticData)
            const formFields = getFormFieldsByType(type)
            // convert type=Object to Object
            Object.keys(formFields).forEach(key => {
                const field = formFields[key]
                if (field.type === 'Object' && results[idx][key].constructor !== Object) {
                    results[idx][key] = JSON.parse(optimisticData[key])
                }
            })
            jsonDom.props.updateResolvedData({json: resolvedDataJson})
        }
        Object.keys(jsonDom.componentRefs).forEach(key => {
            this.findAndUpdateResolvedData(jsonDom.componentRefs[key].comp, resolverKey, type, optimisticData, dataToEdit)
        })
    }

    handleSettingChange(key, pageSetting = false, any, callback) {
        let value
        if (any.target) {
            if (any.target.type === 'checkbox') {
                value = any.target.checked
            } else {
                value = any.target.value
            }
        } else {
            value = any
        }

        const settingKey = pageSetting ? 'EditorPageOptions' : 'EditorOptions'
        const stateSettings = this.state[settingKey]
        if(!stateSettings || !stateSettings[key] || Util.shallowCompare(stateSettings[key], value)) {

            this.setState({
                [settingKey]: Object.assign({}, stateSettings, {
                    [key]: value,
                    __isDirty: true
                })
            }, () => {
                this.saveSettings()
                if (callback && typeof callback === 'function') {
                    callback()
                }
            })
        }
    }

    saveSettings() {

        this._saveSettings = (callback) => {

            const {EditorOptions, EditorPageOptions} = this.state
            if (EditorOptions.__isDirty) {
                delete EditorOptions.__isDirty
                this.props.setKeyValue({
                    key: settingKeyPrefix,
                    value: EditorOptions,
                    internal: true,
                    callback
                })
            }
            if (EditorPageOptions.__isDirty) {
                delete EditorPageOptions.__isDirty
                this.props.setKeyValue({
                    key: settingKeyPrefix + '-' + this.props.cmsPage.realSlug,
                    value: EditorPageOptions,
                    internal: true,
                    callback
                })
            }


            // update cache
            const data = client.readQuery({
                query: CMS_PAGE_QUERY,
                variables: getGqlVariables(this.props)
            })
            if (data && data.cmsPage) {
                const metaJson = JSON.parse(data.cmsPage.meta)
                metaJson.EditorOptions = EditorOptions
                metaJson.EditorPageOptions = EditorPageOptions

                data.cmsPage.meta = JSON.stringify(metaJson)
                client.writeQuery({
                    query: CMS_PAGE_QUERY,
                    variables: getGqlVariables(this.props),
                    data
                })
            }


            clearTimeout(this.saveSettingsTimeout)
            this.saveSettingsTimeout = 0
            delete this._saveSettings
        }

        clearTimeout(this.saveSettingsTimeout)
        this.saveSettingsTimeout = setTimeout(this._saveSettings, 5000)
    }

    editTemplate(key, json, scope) {
        this.setState({cmsTemplateEditData: {key, json, scope}})
    }

    editCmsData(editData) {
        this.setState({cmsEditData: editData})
    }


}


CmsViewEditorContainer.propTypes = {
    loading: PropTypes.bool,
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    setKeyValue: PropTypes.func.isRequired,
    getKeyValue: PropTypes.func.isRequired,
    slug: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired,
    /* with Router */
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    /* Object is passed to JsonDom */
    _props: PropTypes.object,
    /* if dynamic is set to true that means it is a child of another CmsViewContainer */
    dynamic: PropTypes.bool,
    /* if true data gets refetched with query on url change*/
    urlSensitiv: PropTypes.any,
    /* udate data */
    updateCmsPage: PropTypes.func.isRequired,
    updateResolvedData: PropTypes.func.isRequired
}


const CmsViewEditorContainerWithGql = compose(
    graphql(`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$realSlug:String,$name:LocalizedStringInput,$keyword:LocalizedStringInput,$script:String,$serverScript:String,$resources:String,$style:String,$dataResolver:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:String,$parseResolvedData:Boolean,$alwaysLoadAssets:Boolean,$loadPageOptions:Boolean,$ssrStyle:Boolean,$uniqueStyle:Boolean,$publicEdit:Boolean,$compress:Boolean,$query:String,$props:String){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,realSlug:$realSlug,name:$name,keyword:$keyword,script:$script,style:$style,serverScript:$serverScript,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv,alwaysLoadAssets:$alwaysLoadAssets,loadPageOptions:$loadPageOptions,compress:$compress,ssrStyle:$ssrStyle,uniqueStyle:$uniqueStyle,publicEdit:$publicEdit,parseResolvedData:$parseResolvedData,query:$query,props:$props){slug realSlug name{${config.LANGUAGES.join(' ')}} keyword{${config.LANGUAGES.join(' ')}} template script serverScript resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, realSlug, ...rest}, key, cb) => {

                const variables = getGqlVariables(ownProps)

                if (variables.slug !== rest.slug) {
                    console.warn(`slug changed from ${rest.slug} to ${variables.slug}`)
                    return
                }
                const variablesWithNewValue = {...variables, _id, [key]: rest[key]}


                if (rest[key].constructor === Object) {
                    variablesWithNewValue[key] = Object.assign({}, rest[key])
                    delete variablesWithNewValue[key].__typename
                }

                if (realSlug) {
                    variablesWithNewValue.realSlug = realSlug
                }
                return mutate({
                    variables: variablesWithNewValue,
                    update: (store, respons) => {

                        const data = client.readQuery({
                            query: CMS_PAGE_QUERY,
                            variables
                        })
                        if (data && data.cmsPage && respons.data && respons.data.updateCmsPage) {

                            const updateCmsPage = respons.data.updateCmsPage

                            // update cmsPage
                            const newData = {
                                _id,
                                realSlug,
                                [key]: updateCmsPage[key], ...rest,
                                modifiedAt: updateCmsPage.modifiedAt,
                                status: updateCmsPage.status
                            }

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                newData.resolvedData = updateCmsPage.resolvedData
                                newData.subscriptions = updateCmsPage.subscriptions
                            }
                            client.writeQuery({query: CMS_PAGE_QUERY, variables, data: {...data, cmsPage: newData}})
                        }
                        if (cb) {
                            cb()
                        }
                    }
                })
            }
        }),
    })
)(CmsViewEditorContainer)


export default CmsViewEditorContainerWithGql

