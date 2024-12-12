import React from 'react'
import 'gen/extensions-client-admin'
import {
    getSlugVersion,
    getGqlVariables,
    settingKeyPrefix,
    getCmsPageQuery
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
    Typography,
    DrawerLayout,
    MenuList,
    MenuListItem,
    Button,
    IconButton,
    SimpleSwitch,
    SimpleDialog,
    SimpleMenu,
    Divider,
    UIProvider,
    Checkbox
} from 'ui/admin'
import {
    LogoutIcon, PreviewIcon, SettingsIcon, SaveIcon
} from 'gensrc/ui/admin/icons'
import Drawer from '@mui/material/Drawer'
import DisplaySettingsIcon from '@mui/icons-material/DisplaySettings'
import AppsIcon from '@mui/icons-material/Apps'
import CodeIcon from '@mui/icons-material/Code'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import NetworkStatusHandler from 'client/components/layout/NetworkStatusHandler'
import {getTypeQueries} from 'util/types.mjs'
import Util from '../../../client/util/index.mjs'
import {translateText} from '../../../client/util/translate.mjs'
import {
    CAPABILITY_MANAGE_CMS_CONTENT,
    CAPABILITY_MANAGE_CMS_TEMPLATE,
    CAPABILITY_VIEW_CMS_EDITOR
} from '../constants/index.mjs'
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
import CmsPageOptions from '../components/CmsPageOptions'
import CmsPageSeo from '../components/CmsPageSeo'
import styled from '@emotion/styled'
import PrettyErrorMessage from '../components/PrettyErrorMessage'
import {useKeyValuesGlobal, setKeyValue} from '../../../client/util/keyvalue'
import {downloadAs} from '../../../client/util/download'
import FileDrop from "../../../client/components/FileDrop";
import {csvToJson} from "../../../client/util/csv.mjs";

const StyledBox = styled(Box)(({theme})=>({
    display: 'flex',
    overflow: 'auto',
    flexDirection: 'column',
    marginBottom: 'auto'
}))

const CodeEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

const DEFAULT_EDITOR_SETTINGS = {inlineEditor: true, fixedLayout: true, drawerOpen: false, drawerWidth: 500}


function saveTrsAsCsv(data) {
    const json = JSON.parse(data)
    if (json.tr && json.tr[config.DEFAULT_LANGUAGE]) {
        let csv = '"key";"' + config.LANGUAGES.join('";"') + '"\r\n'
        Object.keys(json.tr[config.DEFAULT_LANGUAGE]).forEach(key => {
            const tr = [key]
            config.LANGUAGES.forEach(lang => {
                tr.push(json.tr[lang] && json.tr[lang][key] ? json.tr[lang][key].replace(/"/g, '\\"') : '')
            })
            csv += '"' + tr.join('";"') + '"\r\n'
        })
        downloadAs(csv, 'export.csv')
    }
}

const transRec = async ({source, base, path='', overrideTranslations=false, onChange}) => {
    if (!source || source.constructor !== Object) {
        return
    }
    const trKeys = Object.keys(source)
    for(const trKey of trKeys){
        if (source[trKey] && source[trKey].constructor === String) {
            for(const lang of config.LANGUAGES){
                if ((overrideTranslations || !base[lang] || !base[lang][trKey]) && lang !== config.DEFAULT_LANGUAGE) {
                    const res = await translateText({text: source[trKey], toIso:lang, fromIso: config.DEFAULT_LANGUAGE})

                    if(res.text){
                        setPropertyByPath(res.text, lang + path + '.' + trKey.replace(/\./g, '\\\.'), base)
                        if(onChange){
                            onChange(res)
                        }
                    }
                }
            }
        }
    }
}

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
            manual,
            resources,
            dataResolver,
            ssr,
            slug,
            urlSensitiv,
            name,
            keyword,
            author,
            description,
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
            author,
            description,
            template,
            templateChangeCount:0,
            resources,
            script,
            style,
            uniqueStyle,
            serverScript,
            manual,
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
            window.addEventListener('beforeunload', ()=>{
                console.log('beforeunload')
                this.saveCmsPage()
            })
            window.addEventListener('blur', () => {
                this.saveCmsPage()
            })

            history.block(() => {
                console.log('block')
                this.saveCmsPage()
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
                    if (res.data.cmsPageStatus && res.data.cmsPageStatus.user && this.props.user._id) {

                        if (res.data.cmsPageStatus.user._id !== this.props.user._id) {
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
        this.saveCmsPage()
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
            state.showPageSettingsConfig !== this.state.showPageSettingsConfig ||
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
            state.author !== this.state.author ||
            state.description !== this.state.description ||
            state.compress !== this.state.compress ||
            state.simpleDialog !== this.state.simpleDialog ||
            state.addNewSite !== this.state.addNewSite ||
            state.serverScript !== this.state.serverScript ||
            state.manual !== this.state.manual ||
            state.EditorOptions !== this.state.EditorOptions ||
            Util.shallowCompare(state.EditorPageOptions, this.state.EditorPageOptions,
                {ignoreKeys:['styleScroll','dataResolverScroll','serverScriptScroll','templateScroll','scriptScroll','manualScroll']}) ||
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
            manual,
            simpleDialog,
            showPageSettings,
            showPageSettingsConfig,
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

        const canViewCmsEditor = Util.hasCapability(props.user, CAPABILITY_VIEW_CMS_EDITOR),
            canMangeCmsContent = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_CONTENT),
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
        }

        const inner = [
            !loadingState && <WrappedComponent key="cmsView"
                                               cmsEditData={cmsEditData}
                                               onTemplateChange={this.handleTemplateChange}
                                               findSegmentInDataResolverByKeyOrPath={this.findSegmentInDataResolverByKeyOrPath.bind(this)}
                                               inEditor={canViewCmsEditor}
                                               onError={this.handleCmsError.bind(this)}
                                               onDataResolverPropertyChange={this.handleDataResolverPropertySave.bind(this)}
                                               settings={EditorOptions}
                                               cmsPage={cmsPageWithState}
                                               cmsEditorActions={{
                                                   editTemplate: this.editTemplate.bind(this),
                                                   editCmsData: this.editCmsData.bind(this)
                                               }}
                                               {...props} />,
            !props.dynamic && <ErrorHandler key="errorHandler" snackbar/>,
            <NetworkStatusHandler key="networkStatus"/>,
            simpleDialog && <SimpleDialog open={true}
                                          fullWidth={true} maxWidth="md"
                                          onClose={(action) => {
                                              let preventClose = false
                                              if (simpleDialog.onClose) {
                                                  preventClose = simpleDialog.onClose(action)
                                              }
                                              if(!preventClose) {
                                                  this.setState({simpleDialog: null})
                                              }
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
            <SimpleDialog fullWidth={true}
                          maxWidth="lg"
                          open={true}
                          onClose={this.handleComponentEditClose.bind(this)}
                          actions={[{
                              key: 'ok',
                              label: 'Ok',
                              type: 'primary'
                          }]}
                          title={_t('CmsViewEditorContainer.editComponent')}>
                <TemplateEditor
                    fabButtonStyle={{bottom: '3rem', right: '1rem'}}
                    component={cmsTemplateEditData}
                    tab={EditorPageOptions.templateTab}
                    identifier={'templatePart-'+cmsTemplateEditData.key}
                    onTabChange={this.handleSettingChange.bind(this, 'templateTab', true)}
                    onChange={this.handleTemplateChange.bind(this)}/>
                <Button key="editParent" size="small" variant="contained" color="primary" onClick={e => {
                    this.editTemplate(cmsTemplateEditData.key.substring(0, cmsTemplateEditData.key.lastIndexOf('.')), cmsTemplateEditData.json, cmsTemplateEditData.scope)
                }}>{_t('CmsViewEditorContainer.editParentComponent')}</Button>
            </SimpleDialog>,
            <DataEditDialog key="dataEditDialog"/>]

        if (!canViewCmsEditor || props.dynamic) {
            if ((cmsPage && cmsPage.publicEdit) || props.forceEditMode===true || props.forceEditMode==='true') {
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

                {!(EditorOptions.bottomNavigation>0) && <StyledBox>


                    {canMangeCmsContent && <Expandable title={_t('CmsViewEditorContainer.seo')}
                                                       disableGutters
                                                       icon="google"
                                                       onChange={this.handleSettingChange.bind(this, 'seoExpanded', true)}
                                                       expanded={EditorPageOptions.seoExpanded}>

                        <CmsPageSeo cmsPage={cmsPage}
                                    values={this.state}
                                    onChange={this.handleFlagChange}/>
                    </Expandable>}

                    {canMangeCmsContent && <Expandable title={_t('CmsViewEditorContainer.settings')}
                                disableGutters
                                icon="displaySetting"
                                onChange={this.handleSettingChange.bind(this, 'settingsExpanded', true)}
                                expanded={EditorPageOptions.settingsExpanded}>

                        <CmsPageOptions cmsPage={cmsPage}
                                        values={this.state}
                                        onChange={this.handleFlagChange}
                                        canMangeCmsTemplate={canMangeCmsTemplate} />
                    </Expandable>}



                    {canMangeCmsContent && !loadingState && <Expandable title={_t('CmsViewEditorContainer.revisions')}
                                                  disableGutters
                                                  icon="history"
                                                  onChange={this.handleSettingChange.bind(this, 'revisionsExpanded', true)}
                                                  expanded={EditorPageOptions.revisionsExpanded}>

                        <CmsRevision historyLimit={10}
                                     cmsPage={cmsPage}
                                     canMangeCmsTemplate={canMangeCmsTemplate}
                                     slug={slug}
                                     user={props.user}
                                     onDataResolverChange={this.handleDataResolverChange.bind(this)}
                                     onTemplateChange={this.handleTemplateChange.bind(this)}/>

                    </Expandable>}


                    <Expandable title={_t('CmsViewEditorContainer.pages')}
                                disableGutters
                                icon="web"
                                onChange={this.handleSettingChange.bind(this, 'relatedPagesExpanded', true)}
                                expanded={EditorPageOptions.relatedPagesExpanded}>
                        <CmsRelatedPages _version={_version} slug={slug} history={props.history} cmsPage={cmsPage}/>
                    </Expandable>
                </StyledBox>}
                {EditorOptions.bottomNavigation===1 && <StyledBox style={{padding: '10px'}}>

                    <CmsElement disabled={!EditorOptions.inlineEditor}
                                advanced={canMangeCmsTemplate}/>
                </StyledBox>}
                {EditorOptions.bottomNavigation===2 && canMangeCmsTemplate && <StyledBox>
                    <Expandable title="Data resolver"
                        icon="storage"
                        disableGutters
                        onChange={this.handleSettingChange.bind(this, 'dataResolverExpanded', true)}
                        expanded={EditorPageOptions.dataResolverExpanded}>
                        <DataResolverEditor onScroll={this.handleSettingChange.bind(this, 'dataResolverScroll', true)}
                                            scrollPosition={EditorPageOptions.dataResolverScroll}
                                            identifier={'dataResolver' + cmsPage._id}
                                            onCleanUpTranslations={this.handleCleanUpTranslations.bind(this)}
                                            onChange={this.handleDataResolverChange.bind(this)}>{dataResolver}</DataResolverEditor>
                    </Expandable>
                    <Expandable title="Server Script"
                        icon="code"
                        disableGutters
                        onChange={this.handleSettingChange.bind(this, 'serverScriptExpanded', true)}
                        expanded={EditorPageOptions.serverScriptExpanded}>
                        <ScriptEditor
                            key={'script' + slug}
                            identifier={'serverScript' + cmsPage._id}
                            onScroll={this.handleSettingChange.bind(this, 'serverScriptScroll', true)}
                            scrollPosition={EditorPageOptions.serverScriptScroll}
                            onChange={this.setCmsPageValue.bind(this, {key:'serverScript', timeoutSetState: 0, timeoutUpdate: 5000})}>{serverScript}</ScriptEditor>
                    </Expandable>

                    <Expandable title="Template"
                                icon="html"
                                disableGutters
                                onChange={this.handleSettingChange.bind(this, 'templateExpanded', true)}
                                expanded={EditorPageOptions.templateExpanded}>
                        <TemplateEditor
                            onScroll={this.handleSettingChange.bind(this, 'templateScroll', true)}
                            scrollPosition={EditorPageOptions.templateScroll}
                            tab={EditorPageOptions.templateTab}
                            identifier={`template-${cmsPage._id}-${this.state.templateChangeCount}`}
                            onTabChange={(tab) => {
                                this.saveCmsPage()
                                this.handleSettingChange('templateTab', true, tab)
                            }}
                            onChange={(str)=>{
                                this.handleTemplateChange(str,false,false,true)
                            }}>{template}</TemplateEditor>
                    </Expandable>

                    <Expandable title="Script"
                                icon="js"
                                disableGutters
                                onChange={this.handleSettingChange.bind(this, 'scriptExpanded', true)}
                                expanded={EditorPageOptions.scriptExpanded}>
                        <ScriptEditor
                            identifier={'script' + cmsPage._id}
                            onScroll={this.handleSettingChange.bind(this, 'scriptScroll', true)}
                            scrollPosition={EditorPageOptions.scriptScroll}
                            onChange={this.setCmsPageValue.bind(this, {key:'script', timeoutSetState: 500, timeoutUpdate: 5000})}>{script}</ScriptEditor>


                    </Expandable>

                    <Expandable title="Style"
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
                                    onChange={this.setCmsPageValue.bind(this, {key:'style', timeoutSetState: 1000, timeoutUpdate: 5000})}>{style}</CodeEditor>

                        <SimpleSwitch
                            label="Unique Style"
                            checked={!!this.state.uniqueStyle}
                            onChange={this.handleFlagChange.bind(this, 'uniqueStyle')}
                        />
                    </Expandable>
                    <Expandable title={_t('CmsViewEditorContainer.staticAssets')}
                                disableGutters
                                icon="link"
                                onChange={this.handleSettingChange.bind(this, 'resourceExpanded', true)}
                                expanded={EditorPageOptions.resourceExpanded}>
                        <ResourceEditor resources={resources}
                                        onChange={this.setCmsPageValue.bind(this, {key:'resources', timeoutSetState: 0, timeoutUpdate: 50})}></ResourceEditor>
                    </Expandable>

                    <Expandable title="Manual Page"
                                icon="support"
                                disableGutters
                                onChange={this.handleSettingChange.bind(this, 'manualExpanded', true)}
                                expanded={EditorPageOptions.manualExpanded}>
                        <CodeEditor showFab
                                    lineNumbers
                                    identifier={slug}
                                    type="json"
                                    onScroll={this.handleSettingChange.bind(this, 'manualScroll', true)}
                                    scrollPosition={EditorPageOptions.manualScroll}
                                    onChange={this.setCmsPageValue.bind(this, {key:'manual', timeoutSetState: 500, timeoutUpdate: 5000})}>{manual}</CodeEditor>
                    </Expandable>

                </StyledBox>}

                {canMangeCmsContent && <Box sx={{width: '100%'}}>
                    <Paper elevation={3}>
                        <BottomNavigation
                            showLabels
                            value={EditorOptions.bottomNavigation}
                            onChange={(event, newValue) => {
                                this.handleSettingChange('bottomNavigation', false, newValue)
                            }}>
                            <BottomNavigationAction label={_t('CmsViewEditorContainer.pageOptions')} icon={<DisplaySettingsIcon />} />
                            <BottomNavigationAction label={_t('CmsViewEditorContainer.pageElements')} icon={<AppsIcon />} />
                            {canMangeCmsTemplate && <BottomNavigationAction label={_t('CmsViewEditorContainer.pageDevelopment')} icon={<CodeIcon />} />}
                        </BottomNavigation>
                    </Paper>
                </Box>}
            </>

            const moreMenu = []
            if(canMangeCmsContent){
                moreMenu.push({
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
                    })
            }

            if (config.LANGUAGES.length > 1) {

                const langItems = []
                config.LANGUAGES.forEach(lang => {
                    if (lang !== _app_.lang) {
                        langItems.push({
                            name: lang, onClick: () => {
                                window.location.href = Util.translateUrl(lang)

                            }
                        })
                    }
                })

                moreMenu.push(
                    {
                        icon:'translate',
                        name: _t('CmsViewEditorContainer.languages'),
                        items: langItems,
                        divider: canMangeCmsContent
                    })


                moreMenu.push({
                        icon:'language',
                        name: _t('CmsViewEditorContainer.globalTranslation'),
                        onClick: () =>{
                            const key ='GlobalTranslations-'+slug.split('/')[0]
                            let editedData, editorRef
                            const GlobalEditor = ()=>{
                                const keyValues = useKeyValuesGlobal([key], {})
                                if(!keyValues.loading){
                                    return <CodeEditor onChange={(e)=>{
                                        editedData = e
                                    }} onForwardRef={(e) => {
                                        editorRef = e
                                    }} type="json">{keyValues.data[key]}</CodeEditor>
                                }
                                return 'loading...'
                            }
                            this.setState({
                                simpleDialog: {
                                    title: _t('CmsViewEditorContainer.globalTranslation'),
                                    text: <><GlobalEditor /><FileDrop maxSize={100000} style={{width: '100%'}} accept="text/csv"
                                                                      onFileContent={(files,content)=>{
                                                                          const json = csvToJson(content)
                                                                          if(json && json.length>0){
                                                                              const trs = {}
                                                                              json.forEach(entry=>{
                                                                                  config.LANGUAGES.forEach(lang => {
                                                                                      if(entry[lang]) {
                                                                                          if (!trs[lang]) {
                                                                                              trs[lang] = {}
                                                                                          }
                                                                                          trs[lang][entry.key] = entry[lang]
                                                                                      }
                                                                                  })
                                                                              })
                                                                              editorRef.setValue(JSON.stringify({tr:trs},null,4))
                                                                          }
                                                                      }} label={_t('CmsViewEditorContainer.importCsv')}/></>,
                                    actions: [
                                        {
                                            key: 'cancel',
                                            label: _t('core.cancel'),
                                            type: 'secondary'
                                        },
                                        {
                                            key: 'translate',
                                            label: _t('CmsViewEditorContainer.translate'),
                                            type: 'primary'
                                        },
                                        {
                                            key: 'export',
                                            label: _t('CmsViewEditorContainer.exportCsv'),
                                            type: 'primary'
                                        },
                                        {
                                            key: 'save',
                                            label: _t('core.save'),
                                            type: 'primary',
                                            variant:'contained'
                                        }
                                    ],
                                    onClose: (e) => {
                                        if (e.key === 'translate') {
                                            const json = JSON.parse(editorRef.getValue())
                                            if(json && json.tr){
                                                transRec({source:json.tr[config.DEFAULT_LANGUAGE],
                                                    base: json.tr,
                                                    onChange:()=>{
                                                        editorRef.setValue(JSON.stringify(json,null,4))
                                                    }})
                                            }
                                            return true
                                        }else if (e.key === 'export') {
                                            saveTrsAsCsv(editorRef.getData())
                                            return
                                        }else if(e.key==='save' && editedData) {
                                            setKeyValue({key,value:editedData,clearCache:true, global:true}).then(()=>{
                                                location.href = location.href
                                            })
                                        }
                                        this.setState({simpleDialog: true})
                                    }
                                }
                            })
                        }
                    })

                if(canMangeCmsContent) {
                    moreMenu.push({
                            divider: true,
                            icon: 'magic',
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
                                    transRec({source:segment.tr[config.DEFAULT_LANGUAGE],
                                        base: segment.tr,
                                        onChange:()=>{
                                            saveResolver()
                                        }})
                                }
                            }
                        }
                    )
                }
            }


            if (this.templateChangeHistory.length > 0) {
                moreMenu.push(
                    {
                        divider: true,
                        icon:'replay',
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

            if(canMangeCmsContent) {
                if (isSmallScreen) {
                    moreMenu.unshift({
                        component: <SimpleSwitch key="inlineEditorSwitch" color="default"
                                                 checked={!!EditorOptions.inlineEditor}
                                                 onChange={this.handleSettingChange.bind(this, 'inlineEditor', false)}
                                                 label={_t('CmsViewEditorContainer.inlineEditor')}/>
                    })
                } else {
                    toolbarRight.push(
                        <SimpleSwitch key="inlineEditorSwitch" dark={true}
                                      checked={!!EditorOptions.inlineEditor}
                                      onChange={this.handleSettingChange.bind(this, 'inlineEditor', false)}
                                      label={_t('CmsViewEditorContainer.inlineEditor')}/>)
                }
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
                        window.open(`/system/responsive-viewer?url=${encodeURIComponent('/'+cmsPage.realSlug)}&preview=true`, '_blank').focus();
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

            const pageName = cmsPage.realSlug?cmsPage.realSlug.split('/')[0]:''

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
                                maxWidth: '100vw',
                                minWidth: '50vw'
                            },
                        }}
                        disableEnforceFocus={true} open={showPageSettings}
                        onClose={() => {
                            if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
                                return
                            }
                            this.setState({showPageSettings: false})
                        }}> {showPageSettings && <div style={{padding: '1rem'}}>
                    <Typography key="pageOptionTitle" mb={2}
                                variant="subtitle1">{_t('CmsViewEditorContainer.pagesettings')}</Typography>
                    {canMangeCmsTemplate && <Checkbox
                        sx={{position:'absolute', right: 0, top:0}}
                        onChange={(e)=>{
                            this.setState({showPageSettingsConfig: e.target.checked})
                        }}
                        icon={<SettingsIcon />}
                        checkedIcon={<SettingsIcon />}
                    />}

                    {showPageSettingsConfig?
                        <CodeEditor lineNumbers
                                    type="json"
                                    onChange={(json)=>{
                                        clearTimeout(this._pageOptionDefTimeout)
                                        this._pageOptionDefTimeout=setTimeout(()=>{
                                            this.setState({PageOptionsDefinition:json})

                                            this.props.setKeyValue({
                                                key: 'PageOptionsDefinition-' + pageName,
                                                value: json,
                                                global: true
                                            })

                                        },1000)
                                    }}>{PageOptionsDefinition || []}</CodeEditor>

                        :
                        PageOptionsDefinition ?
                        <GenericForm key="pageOptionForm" primaryButton={true}
                                     caption={_t('CmsViewEditorContainer.save')} onClick={(formData) => {
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
                        }, {})} values={PageOptions || {}}/> : _t('CmsViewEditorContainer.noOptions')}</div>}
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


    handleCleanUpTranslations() {
        const {
            template,
            script,
            dataResolver,
        } = this.state

        const json = JSON.parse(dataResolver)
        json.forEach(entry=>{
            if(entry.tr){
                const langs = Object.keys(entry.tr)
                langs.forEach(lang=>{
                    Object.keys(entry.tr[lang]).forEach(key=>{
                        if(![template,script].some(data =>
                            data.indexOf(`_t('${key}'`)>=0 ||
                            data.indexOf(`_t("${key}"`)>=0 ||
                            data.indexOf(`"trKey": "${key}"'`)>=0)){
                            delete entry.tr[lang][key]
                        }
                    })
                })
            }
        })
        this.handleDataResolverChange(JSON.stringify(json,null,4),true)
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

    handleCmsError(e, data) {
        _app_.dispatcher.addError({key: 'cmsError', duration: 15000, msg: data.code?<div>Error in <strong>{data.loc}</strong>: {data.slug}
                {data.meta.text?<p><small>{data.meta.text}</small></p>:''}
                <PrettyErrorMessage  e={e} code={data.code} offset={data.offset} maxLength={100}/></div>:`${data.loc}: ${e.message} -> ${data.slug}`})
    }

    _keyValueMap = {}
    _saveCmsPageTimeout = 0
    _keyValueMapState = {}
    _setCmsPageStateTimeout = 0

    setCmsPageValue = ({key, timeoutSetState, timeoutUpdate, setStateCallback}, value) => {
        if (this._saveSettings)
            this._saveSettings()
        this._keyValueMap[key] = value
        this._keyValueMapState[key] = value
        clearTimeout(this._setCmsPageStateTimeout)
        clearTimeout(this._saveCmsPageTimeout)

        if(timeoutSetState){
            this._setCmsPageStateTimeout = setTimeout(()=>{
                this.setState(this._keyValueMapState, setStateCallback)
                this._keyValueMapState = {}
            },timeoutSetState)
        }else{
            this.setState(this._keyValueMapState, setStateCallback)
            this._keyValueMapState = {}
        }

        this._saveCmsPageTimeout = setTimeout(()=>{
            this.saveCmsPage()
        },timeoutUpdate || 50)
    }

    saveCmsPage(){
        if (this._saveSettings)
            this._saveSettings()
        const keys = Object.keys(this._keyValueMap)
        if(keys.length>0) {
            const {updateCmsPage, cmsPage} = this.props
            console.log('save cms values for', keys)
            updateCmsPage({
                _id: cmsPage._id,
                slug: cmsPage.slug,
                realSlug: cmsPage.realSlug, ...this._keyValueMap
            }, () => {})
            this._keyValueMap = {}
        }
    }

    handleFlagChange = (key, event, value) => {
        this.setCmsPageValue({key,timeoutUpdate:500}, value)
    }

    handleDataResolverChange = (str, instantSave) => {
        this.setCmsPageValue({key: 'dataResolver',
            timeoutSetState:0,
            timeoutUpdate: instantSave?0:1000,
            setStateCallback:()=>{
                this._tmpDataResolver = null
            }}, str)
    }


    handleTemplateChange = (str, instantSave, skipHistory, skipChangeCount) => {
        if (str !== this.state.template) {

            if (str.constructor !== String) {
                str = JSON.stringify(str, null, 2)
            }

            if (!skipHistory) {
                this.templateChangeHistory.unshift(this.state.template)
                if (this.templateChangeHistory.length > 10) {
                    this.templateChangeHistory.length = 10
                }
            }
            if(!skipChangeCount) {
                this._keyValueMapState.templateChangeCount = this.state.templateChangeCount + 1
            }
            this.setCmsPageValue({
                key: 'template',
                timeoutSetState:instantSave?0:300,
                timeoutUpdate: instantSave?0:5000
            }, str)
        }
    }

    drawerWidthChange = (newWidth) => {
        this.handleSettingChange('drawerWidth', false, newWidth)
    }

    drawerOpenClose = (open) => {
        this.handleSettingChange('drawerOpen', false, open)
    }

    handleComponentEditClose() {
        const {cmsTemplateEditData} = this.state
        this.setCmsPageValue( {key:'template'}, this.state.template)
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
                query: getCmsPageQuery(this.props),
                variables: getGqlVariables(this.props)
            })
            if (data && data.cmsPage) {
                const metaJson = JSON.parse(data.cmsPage.meta)
                metaJson.EditorOptions = EditorOptions
                metaJson.EditorPageOptions = EditorPageOptions

                data.cmsPage.meta = JSON.stringify(metaJson)
                client.writeQuery({
                    query: getCmsPageQuery(this.props),
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

// TODO show only in development
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
    graphql(`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$realSlug:String,$name:LocalizedStringInput,$author:String,$keyword:LocalizedStringInput,$description:LocalizedStringInput,$script:String,$serverScript:String,$resources:String,$style:String,$dataResolver:String,$manual:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:String,$parseResolvedData:Boolean,$alwaysLoadAssets:Boolean,$loadPageOptions:Boolean,$ssrStyle:Boolean,$uniqueStyle:Boolean,$publicEdit:Boolean,$disableRendering:Boolean,$compress:Boolean,$query:String,$props:String){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,realSlug:$realSlug,name:$name,author:$author,keyword:$keyword,description:$description,script:$script,style:$style,serverScript:$serverScript,manual:$manual,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv,alwaysLoadAssets:$alwaysLoadAssets,loadPageOptions:$loadPageOptions,compress:$compress,ssrStyle:$ssrStyle,uniqueStyle:$uniqueStyle,publicEdit:$publicEdit,disableRendering:$disableRendering,parseResolvedData:$parseResolvedData,query:$query,props:$props){slug realSlug name{${config.LANGUAGES.join(' ')}} description{${config.LANGUAGES.join(' ')}} keyword{${config.LANGUAGES.join(' ')}} author template script serverScript resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, realSlug, ...rest}, cb) => {

                const variables = getGqlVariables(ownProps)

                if (variables.slug !== rest.slug) {
                    console.warn(`slug changed from ${rest.slug} to ${variables.slug}`)
                    return
                }
                const variablesWithNewValue = {...variables, _id, ...rest}

                Object.values(variablesWithNewValue).forEach(value=>{
                    if (value && value.constructor === Object) {
                        delete value.__typename
                    }
                })

                if (realSlug) {
                    variablesWithNewValue.realSlug = realSlug
                }

                return mutate({
                    variables: variablesWithNewValue,
                    update: (store, respons) => {

                        const data = client.readQuery({
                            query: getCmsPageQuery(ownProps),
                            variables
                        })
                        if (data && data.cmsPage && respons.data && respons.data.updateCmsPage) {

                            const updateCmsPage = respons.data.updateCmsPage

                            // update cmsPage
                            const newData = {
                                _id,
                                realSlug,
                                ...data.cmsPage,
                                /*[key]: updateCmsPage[key],*/
                                ...rest,
                                modifiedAt: updateCmsPage.modifiedAt,
                                status: updateCmsPage.status
                            }

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                newData.resolvedData = updateCmsPage.resolvedData
                                newData.subscriptions = updateCmsPage.subscriptions
                            }
                            client.writeQuery({query: getCmsPageQuery(ownProps), variables, data: {...data, cmsPage: newData}})
                            if(!ownProps.dynamic){
                                // clear caches for dynamic use
                                client.clearCacheWith({start:getCmsPageQuery({dynamic:true}),contain:`"slug":"${ownProps.slug}"`})
                            }
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

