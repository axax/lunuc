import React from 'react'
import {
    isEditMode,
    getSlugVersion,
    getGqlVariables,
    settingKeyPrefix,
    gqlQueryKeyValues,
    gqlQuery
} from '../util/cmsView'
import PropTypes from 'prop-types'
import {graphql, withApollo} from '@apollo/react-hoc'
import {Query} from '@apollo/react-components'
import {ApolloClient} from '@apollo/client'
import compose from 'util/compose'
import {gql} from '@apollo/client'
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
    SimpleSwitch,
    SimpleDialog,
    SimpleMenu,
    Divider,
    UIProvider
} from 'ui/admin'
import NetworkStatusHandler from 'client/components/layout/NetworkStatusHandler'
import * as ErrorHandlerAction from 'client/actions/ErrorHandlerAction'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as CmsActions from '../actions/CmsAction'
import {getTypeQueries} from 'util/types'
import TypeEdit from '../../../client/components/types/TypeEdit'
import withType from '../../../client/components/types/withType'
import Util from '../../../client/util'
import {CAPABILITY_MANAGE_CMS_CONTENT, CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants'
import CodeEditor from 'client/components/CodeEditor'
import {propertyByPath, setPropertyByPath} from '../../../client/util/json'
import GenericForm from '../../../client/components/GenericForm'
import _t from 'util/i18n'
import config from 'gen/config'
import {getFormFields} from '../../../util/typesAdmin'


class CmsViewEditorContainer extends React.Component {

    templateChangeHistory = []

    static defaultSettings = {inlineEditor: true, fixedLayout: true, drawerOpen: false, drawerWidth: 500}
    static generalSettingsKeys = ['inlineEditor', 'fixedLayout', 'drawerOpen', 'drawerWidth']

    constructor(props) {
        super(props)
        this.state = CmsViewEditorContainer.propsToState(props, null)
    }

    static isLoadingState(props) {
        return props.loadingKeyValues || props.loading || props.aboutToChange
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.cmsPage && nextProps.keyValues && !CmsViewEditorContainer.isLoadingState(nextProps)) {

            if (prevState.slug == undefined || nextProps.cmsPage.slug !== prevState.slug) {
                console.log('update state')
                return CmsViewEditorContainer.propsToState(nextProps, prevState)
            }
        }
        return null
    }

    static getSettingsByKeyValue(props) {
        let generalSettings = {}, pageSettings = {}, settings = {}

        if (props.keyValues) {

            props.keyValues.results.forEach(keyValue => {
                if (keyValue.value) {
                    try {
                        if (keyValue.key === settingKeyPrefix) {
                            generalSettings = JSON.parse(keyValue.value)
                        } else {
                            pageSettings = JSON.parse(keyValue.value)
                        }
                    } catch (e) {
                        console.log(e)
                    }
                }
            })
        }
        settings = {...CmsViewEditorContainer.defaultSettings, ...generalSettings, ...pageSettings}

        return {settings, pageSettings, generalSettings}
    }

    static propsToState(props, state) {
        const {template, script, style, serverScript, resources, dataResolver, ssr, slug, urlSensitiv, status, parseResolvedData, alwaysLoadAssets,ssrStyle, compress} = props.cmsPage || {}
        const {settings} = CmsViewEditorContainer.getSettingsByKeyValue(props)
        const result = {
            keyValues: props.keyValues,
            public: props.cmsPage && props.cmsPage.public,
            settings,
            slug,
            template,
            resources,
            script,
            style,
            serverScript,
            dataResolver,
            ssr,
            urlSensitiv,
            parseResolvedData,
            alwaysLoadAssets,
            ssrStyle,
            compress,
            addNewSite: null,
            ignoreStatus: false
        }
        if (state && state.addNewSite && props.cmsPage && props.cmsPage.slug === state.slug) {
            result.addNewSite = state.addNewSite
        } else if (props.cmsPage && !props.cmsPage._id) {
            result.addNewSite = {slugNoExist: props.slug, slug: props.slug}
        }
        return result
    }


    componentDidMount() {
        this._handleWindowClose = this.saveUnsafedChanges.bind(this)
        window.addEventListener('beforeunload', this._handleWindowClose)
        window.addEventListener('blur', this._handleWindowClose)

        const {history} = this.props

        const unblock = history.block((e) => {
            this.saveUnsafedChanges()
            return true
        })
    }

    watchCmsPageStatus(instant) {
        clearTimeout(this._watchCmsPageStatus)
        this._watchCmsPageStatus = setTimeout(() => {
            if (!this.state.ignoreStatus && this.props.slug !== undefined) {
                this.props.client.query({
                    fetchPolicy: 'network-only',
                    query: gql`query cmsPageStatus($slug: String!){cmsPageStatus(slug: $slug){user{username _id}}}`,
                    variables: {
                        slug: this.props.slug
                    },
                }).then((res) => {
                    this.watchCmsPageStatus()
                    if (res.data.cmsPageStatus && res.data.cmsPageStatus.user && this.props.user.userData && res.data.cmsPageStatus.user._id !== this.props.user.userData._id) {
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
                                onClose: action => {
                                    this.setState({ignoreStatus: true})
                                }
                            }
                        })
                    }
                })
            }
        }, instant ? 0 : 5000)
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
            this.watchCmsPageStatus(true)
        }
        // only update if it is needed
        return noCmsPage ||
            CmsViewEditorContainer.isLoadingState(props) !== CmsViewEditorContainer.isLoadingState(this.props) ||
            slugChanged ||
            /*props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||*/
            props.cmsComponentEdit !== this.props.cmsComponentEdit ||
            props.cmsEditData !== this.props.cmsEditData ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            (!props.renewing && this.props.renewing) ||
            (
                state.urlSensitiv && (
                    props.location.search !== this.props.location.search ||
                    props.location.hash !== this.props.location.hash)
            ) ||
            props.user !== this.props.user ||
            props.children != this.props.children ||
            props._props !== this.props._props ||
            state.template !== this.state.template ||
            state.script !== this.state.script ||
            state.style !== this.state.style ||
            state.parseResolvedData !== this.state.parseResolvedData ||
            state.alwaysLoadAssets !== this.state.alwaysLoadAssets ||
            state.ssrStyle !== this.state.ssrStyle ||
            state.public !== this.state.public ||
            state.ssr !== this.state.ssr ||
            state.urlSensitiv !== this.state.urlSensitiv ||
            state.compress !== this.state.compress ||
            state.simpleDialog !== this.state.simpleDialog ||
            state.showRevision !== this.state.showRevision ||
            state.addNewSite !== this.state.addNewSite ||
            state.serverScript !== this.state.serverScript ||
            state.settings.fixedLayout !== this.state.settings.fixedLayout ||
            state.settings.inlineEditor !== this.state.settings.inlineEditor ||
            state.settings.templateTab !== this.state.settings.templateTab ||
            state.settings.drawerWidth !== this.state.settings.drawerWidth

    }

    render() {
        const {WrappedComponent, cmsPage, cmsEditData, cmsComponentEdit, ...props} = this.props

        const {template, resources, script, style, settings, dataResolver, serverScript, simpleDialog} = this.state
        if (!cmsPage) {
            // show a loader here
            if (!props.dynamic) {
                return <NetworkStatusHandler/>
            }
        }

        const loadingState = CmsViewEditorContainer.isLoadingState(this.props)

        const isSmallScreen = window.innerWidth < 1000
        // extend with value from state because they are more update to date
        const cmsPageWithState = Object.assign({}, cmsPage, {script, style, template})

        console.log('render CmsViewEditorContainer')

        const canManageCmsPages = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_CONTENT),
            canMangeCmsTemplate = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_TEMPLATE)

        let cmsEditDataProps, cmsEditDataValue

        if (cmsEditData && !cmsEditData.type) {
            cmsEditDataProps = this.getDataResolverProperty(cmsEditData)
            cmsEditDataValue = cmsEditData.value
        }


        const DataEditDialog = () => {

            if (cmsEditData) {
                if (cmsEditData.type) {

                    const OpenTypeEdit = ({data}) => {

                        const editDialogProps = {
                            type: cmsEditData.type,
                            title: cmsEditData.type,
                            open: !!cmsEditData,
                            onClose: this.handleEditDataClose.bind(this),
                            parentRef: this
                        }

                        if (cmsEditData.options && cmsEditData.options.clone) {
                            editDialogProps.initialData = Object.assign({}, data.genericDatas.results[0])
                            delete editDialogProps.initialData._id
                        } else if (cmsEditData.options && cmsEditData.options.create) {
                            editDialogProps.initialData = cmsEditData.initialData
                        } else {
                            editDialogProps.dataToEdit = data.genericDatas.results[0]
                        }

                        return React.createElement(
                            withType(TypeEdit),
                            editDialogProps,
                            null
                        )
                    }
                    if (cmsEditData._id) {

                        return <Query key="dataEditor"
                                      query={gql(getTypeQueries(cmsEditData.type).query)}
                                      variables={{filter: `_id=${cmsEditData._id}`}}
                                      fetchPolicy="network-only">

                            {({loading, error, data}) => {
                                if (loading) {
                                    return 'Loading...'
                                }

                                if (error) return `Error! ${error.message}`
                                if (data.genericDatas.results.length === 0) {

                                    this.props._cmsActions.editCmsData(null)
                                    this.setState({
                                        simpleDialog: {
                                            title: "Keine Daten",
                                            text: "Sie haben vermutlich keine Berechtigung diese Daten zu bearbeiten"
                                        }
                                    })
                                    return null
                                }

                                return <OpenTypeEdit data={data}/>
                            }}
                        </Query>
                    } else {
                        return <OpenTypeEdit/>
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
                                             this.props._cmsActions.editCmsData(null)
                                         }}
                                         actions={[{
                                             key: 'cancel',
                                             label: 'Abbrechen',
                                             type: 'secondary'
                                         },
                                             {
                                                 key: 'save',
                                                 label: 'Speichern',
                                                 type: 'primary'
                                             }]}
                                         title="Bearbeitung">

                        <GenericForm primaryButton={false} ref={(e) => {
                            formRef = e
                        }} fields={cmsEditDataProps}/>


                    </SimpleDialog>
                }
            }
            return null
        }


        const inner = [
            !loadingState && <WrappedComponent key="cmsView" cmsEditData={cmsEditData}
                                               onChange={this.handleTemplateChange}
                                               inEditor={canManageCmsPages}
                                               onError={this.handleCmsError.bind(this)}
                                               onDataResolverPropertyChange={this.handleDataResolverPropertySave.bind(this)}
                                               settings={settings}
                                               cmsPage={cmsPageWithState}
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
            cmsComponentEdit.key && <SimpleDialog fullWidth={true} maxWidth="md" key="templateEditor" open={true}
                                                  onClose={this.handleComponentEditClose.bind(this)}
                                                  actions={[{
                                                      key: 'ok',
                                                      label: 'Ok',
                                                      type: 'primary'
                                                  }]}
                                                  title="Edit Component">
                <TemplateEditor
                    fabButtonStyle={{bottom: '3rem', right: '1rem'}}
                    component={cmsComponentEdit}
                    tab={settings.templateTab}
                    onTabChange={this.handleSettingChange.bind(this, 'templateTab')}
                    onChange={this.handleTemplateChange.bind(this)}/>


                <Button key="editParent" size="small" variant="contained" color="primary" onClick={e => {
                    this.props._cmsActions.editCmsComponent(cmsComponentEdit.key.substring(0,cmsComponentEdit.key.lastIndexOf('.')), cmsComponentEdit.json, cmsComponentEdit.scope)
                }}>Edit parent component</Button>
            </SimpleDialog>,
            <DataEditDialog key="dataEditDialog"/>
        ]


        if (!canManageCmsPages) {
            return inner
        } else {
            const {slug, _version} = getSlugVersion(props.slug)
            const sidebar = cmsPage._id && <div>
                <MenuList>
                    <MenuListItem onClick={e => {
                        const win = window.open(location.pathname + '?preview=true', '_blank')
                        win.focus()
                    }} button primary={_t('CmsViewEditorContainer.preview')}/>
                </MenuList>
                <Divider/>

                <div style={{padding: '10px'}}>

                    {canMangeCmsTemplate && <Expandable title="Data resolver"
                                                        onChange={this.handleSettingChange.bind(this, 'dataResolverExpanded')}
                                                        expanded={settings.dataResolverExpanded}>
                        <DataResolverEditor
                            onScroll={this.handleSettingChange.bind(this, 'dataResolverScroll')}
                            scrollPosition={settings.dataResolverScroll}
                            onBlur={() => {
                                this.saveUnsafedChanges()
                            }}
                            onChange={this.handleDataResolverChange.bind(this)}>{dataResolver}</DataResolverEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Server Script"
                                                        onChange={this.handleSettingChange.bind(this, 'serverScriptExpanded')}
                                                        expanded={settings.serverScriptExpanded}>
                        <ScriptEditor
                            onScroll={this.handleSettingChange.bind(this, 'serverScriptScroll')}
                            scrollPosition={settings.serverScriptScroll}
                            onBlur={() => {
                                this.saveUnsafedChanges()
                            }}
                            onChange={this.handleServerScriptChange.bind(this)}>{serverScript}</ScriptEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Template"
                                                        onChange={this.handleSettingChange.bind(this, 'templateExpanded')}
                                                        expanded={settings.templateExpanded}>
                        <TemplateEditor
                            onScroll={this.handleSettingChange.bind(this, 'templateScroll')}
                            scrollPosition={settings.templateScroll}
                            tab={settings.templateTab}
                            onTabChange={(tab) => {
                                if (this._autoSaveTemplate) {
                                    this._autoSaveTemplate()
                                }
                                this.handleSettingChange('templateTab', tab)
                            }}
                            onChange={this.handleTemplateChange.bind(this)}>{template}</TemplateEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Script"
                                                        onChange={this.handleSettingChange.bind(this, 'scriptExpanded')}
                                                        expanded={settings.scriptExpanded}>
                        <ScriptEditor
                            onScroll={this.handleSettingChange.bind(this, 'scriptScroll')}
                            scrollPosition={settings.scriptScroll}
                            onChange={this.handleClientScriptChange.bind(this)}>{script}</ScriptEditor>
                    </Expandable>}

                    {canMangeCmsTemplate && <Expandable title="Style"
                                                        onChange={this.handleSettingChange.bind(this, 'styleExpanded')}
                                                        expanded={settings.styleExpanded}>

                        <CodeEditor showFab
                                    lineNumbers
                                    fileSplit
                                    fileIndex={settings.styleFileIndex}
                                    onFileChange={this.handleSettingChange.bind(this, 'styleFileIndex')}
                                    type="css"
                                    onScroll={this.handleSettingChange.bind(this, 'styleScroll')}
                                    scrollPosition={settings.styleScroll}
                                    onChange={this.handleStyleChange.bind(this)}>{style}</CodeEditor>

                    </Expandable>}


                    {canMangeCmsTemplate && <Expandable title="Static assets"
                                                        onChange={this.handleSettingChange.bind(this, 'resourceExpanded')}
                                                        expanded={settings.resourceExpanded}>

                        <ResourceEditor resources={resources}
                                        onChange={this.handleResourceChange.bind(this)}></ResourceEditor>
                    </Expandable>}


                    <Expandable title={_t('CmsViewEditorContainer.settings')}
                                onChange={this.handleSettingChange.bind(this, 'settingsExpanded')}
                                expanded={settings.settingsExpanded}>

                        <TextField key="pageTitle"
                                   label={_t('CmsViewEditorContainer.pageTitle')}
                                   InputLabelProps={{
                                       shrink: true,
                                   }}
                                   onBlur={(e) => {
                                       let value = {...cmsPage.name, [_app_.lang]: e.target.value}

                                       this.saveCmsPage(value, this.props.cmsPage, 'name')
                                   }}
                                   defaultValue={cmsPage.name[_app_.lang]}
                                   fullWidth={true}/>

                        {canMangeCmsTemplate && <React.Fragment><SimpleSwitch
                            label="SSR (Server side Rendering)"
                            checked={!!this.state.ssr}
                            onChange={this.handleFlagChange.bind(this, 'ssr')}
                        /><br/>
                            <SimpleSwitch
                                label="Public (is visible to everyone)"
                                checked={!!this.state.public}
                                onChange={this.handleFlagChange.bind(this, 'public')}
                            /><br/>
                            <SimpleSwitch
                                label="Url sensitive (refresh component on url change)"
                                checked={!!this.state.urlSensitiv}
                                onChange={this.handleFlagChange.bind(this, 'urlSensitiv')}
                            /><br/>
                            <SimpleSwitch
                                label="Always load assets (even when component is loaded dynamically)"
                                checked={!!this.state.alwaysLoadAssets}
                                onChange={this.handleFlagChange.bind(this, 'alwaysLoadAssets')}
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
                                label="Parse resolvedData in frontend (replace placeholders)"
                                checked={!!this.state.parseResolvedData}
                                onChange={this.handleFlagChange.bind(this, 'parseResolvedData')}
                            /></React.Fragment>}
                    </Expandable>

                    <Expandable title={_t('CmsViewEditorContainer.revisions')}
                                onChange={this.handleSettingChange.bind(this, 'revisionsExpanded')}
                                expanded={settings.revisionsExpanded}>
                        <MenuList>
                            <Query
                                query={gql`query historys($filter:String,$limit:Int){historys(filter:$filter,limit:$limit){results{_id action, meta}}}`}
                                fetchPolicy="cache-and-network"
                                variables={{
                                    limit: 99,
                                    filter: `data._id=${cmsPage._id}`
                                }}>
                                {({loading, error, data}) => {
                                    if (loading) return 'Loading...'
                                    if (error) return `Error! ${error.message}`


                                    const menuItems = []

                                    data.historys.results.forEach(i => {
                                            if (i.slug !== props.slug) {

                                                const meta = i.meta ? JSON.parse(i.meta) : {keys: []}
                                                menuItems.push(<MenuListItem key={'history' + i._id} onClick={e => {
                                                    this.setState({showRevision: i})
                                                }} button primary={Util.formattedDateFromObjectId(i._id) + ' - ' + i.action}
                                                                             secondary={meta.keys.indexOf('template') > -1 ? 'Inhalt wurde geändert' : 'Änderung'}
                                                />)
                                            }
                                        }
                                    )
                                    if (data.historys.results === 0) return 'No history entries'
                                    return menuItems
                                }}
                            </Query>
                        </MenuList>
                    </Expandable>


                    {this.state.showRevision &&
                    <SimpleDialog fullWidth={true} maxWidth="md" key="revisionDialog" open={true}
                                  onClose={() => {
                                      this.setState({showRevision: false})
                                  }}
                                  actions={[{
                                      key: 'ok',
                                      label: 'Ok',
                                      type: 'primary'
                                  }]}
                                  title="Revision">

                        <Query
                            query={gql`query historys($filter:String){historys(filter:$filter){results{_id action data}}}`}
                            fetchPolicy="cache-and-network"
                            variables={{
                                filter: `_id=${this.state.showRevision._id}`
                            }}>
                            {({loading, error, data}) => {
                                if (loading) return 'Loading...'
                                if (error) return `Error! ${error.message}`

                                if (data.historys.results === 0) return 'No entry'
                                const parsedData = JSON.parse(data.historys.results[0].data)

                                if (parsedData.dataResolver) {

                                    return <div>
                                        <Typography gutterBottom>Data resolver changed</Typography>

                                        <CodeEditor lineNumbers
                                                    type="json"
                                                    readOnly={true}>{JSON.stringify(JSON.parse(parsedData.dataResolver), null, 2)}</CodeEditor>
                                    </div>

                                } else if (parsedData.template) {

                                    return <div>
                                        <Typography gutterBottom>Template changed</Typography>

                                        <CodeEditor lineNumbers
                                                    type="json"
                                                    readOnly={true}>{JSON.stringify(JSON.parse(parsedData.template), null, 2)}</CodeEditor>
                                    </div>

                                } else if (parsedData.script) {

                                    return <div>
                                        <p>Script changed</p>
                                        <textarea>{parsedData.script}</textarea>
                                    </div>

                                }
                                return <pre>{JSON.stringify(parsedData, null, 2)}</pre>
                            }}
                        </Query>

                        <div>{this.state.showRevision.slug}</div>

                    </SimpleDialog>}


                    <Expandable title={_t('CmsViewEditorContainer.pages')}
                                onChange={this.handleSettingChange.bind(this, 'relatedPagesExpanded')}
                                expanded={settings.relatedPagesExpanded}>
                        <MenuList>
                            <Query
                                query={gql`query cmsPages($filter:String,$limit:Int,$_version:String){cmsPages(filter:$filter,limit:$limit,_version:$_version){results{slug}}}`}
                                fetchPolicy="cache-and-network"
                                variables={{
                                    _version,
                                    limit: 99,
                                    filter: `slug=^${slug.split('/')[0]}$ slug=^${slug.split('/')[0]}/`
                                }}>
                                {({loading, error, data}) => {
                                    if (loading) return 'Loading...'
                                    if (error) return `Error! ${error.message}`


                                    const menuItems = []

                                    data.cmsPages.results.forEach(i => {
                                            if (i.slug !== props.slug) {
                                                menuItems.push(<MenuListItem key={i.slug} onClick={e => {
                                                    props.history.push('/' + i.slug)
                                                }} button primary={i.slug}/>)
                                            }
                                        }
                                    )
                                    if (menuItems.length === 0) return 'No related pages'
                                    return menuItems
                                }}
                            </Query>
                        </MenuList>
                    </Expandable>

                </div>
            </div>

            const moreMenu = [
                {
                    divider: true,
                    name: _t('CmsViewEditorContainer.addnewpage'), onClick: () => {
                        this.setState({addNewSite: {}})

                    }
                },
                {
                    divider: true,
                    name: _t('CmsViewEditorContainer.languages'),
                    items: []
                },
                {
                    divider: true,
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

                                Object.keys(o).forEach(key => {
                                    if (o[key] && o[key].constructor === String) {
                                        config.LANGUAGES.forEach(lang => {
                                            if (lang !== config.DEFAULT_LANGUAGE) {
                                                const text = o[key].replace(/\\n/g, '\n')
                                                this.props.client.query({
                                                    fetchPolicy: 'cache-first',
                                                    query: gql`query translate($text: String!, $toIso: String!){translate(text: $text, toIso: $toIso){text toIso}}`,
                                                    variables: {
                                                        text,
                                                        toIso: lang,
                                                        fromIso: config.DEFAULT_LANGUAGE
                                                    },
                                                }).then((res) => {
                                                    setPropertyByPath(res.data.translate.text, lang + path + '.' + key, base)
                                                    saveResolver()
                                                })

                                            }
                                        })
                                    } else {
                                        //transRec(o[key], base, path + '.' + key)
                                    }
                                })
                            }
                            transRec(segment.tr[config.DEFAULT_LANGUAGE], segment.tr, '')


                        }

                    }
                }
            ]
            config.LANGUAGES.forEach(lang => {
                moreMenu[1].items.push({
                    name: lang, onClick: () => {
                        window.location.href = Util.translateUrl(lang)

                    }
                })
            })

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

            if (isSmallScreen) {
                moreMenu.unshift({
                    component: <SimpleSwitch key="inlineEditorSwitch" color="default"
                                             checked={!!settings.inlineEditor}
                                             onChange={this.handleSettingChange.bind(this, 'inlineEditor')}
                                             label={_t('CmsViewEditorContainer.inlineEditor')}/>
                })
            }

            return <UIProvider>
                <DrawerLayout sidebar={!loadingState && sidebar}
                              open={settings.drawerOpen}
                              fixedLayout={settings.fixedLayout}
                              drawerWidth={settings.drawerWidth}
                              onDrawerOpenClose={this.drawerOpenClose}
                              onDrawerWidthChange={this.drawerWidthChange}
                              toolbarRight={[
                                  !isSmallScreen && <SimpleSwitch key="fixedLayoutSwitch" color="default"
                                                                  checked={!!settings.fixedLayout}
                                                                  onChange={this.handleSettingChange.bind(this, 'fixedLayout')}
                                                                  contrast
                                                                  label={_t('CmsViewEditorContainer.fixed')}/>,
                                  !isSmallScreen && <SimpleSwitch key="inlineEditorSwitch" color="default"
                                                                  checked={!!settings.inlineEditor}
                                                                  onChange={this.handleSettingChange.bind(this, 'inlineEditor')}
                                                                  contrast
                                                                  label={_t('CmsViewEditorContainer.inlineEditor')}/>,
                                  <Button key="buttonBack" size="small" color="inherit" onClick={e => {
                                      this.props.history.push(config.ADMIN_BASE_URL + '/cms' + (_app_._cmsLastSearch ? _app_._cmsLastSearch : ''))
                                  }}>Admin</Button>,
                                  <Button key="buttonLogout" size="small" color="inherit" onClick={() => {
                                      this.props.history.push(`${config.ADMIN_BASE_URL}/logout?forward=${encodeURIComponent('/' + props.slug + '?logout=true')}`)
                                  }}>{_t('CmsViewEditorContainer.logout')}</Button>,
                                  <SimpleMenu key="moreMenu" color="inherit" items={moreMenu}/>
                              ]
                              }
                              title={`${_t('CmsViewEditorContainer.editPage')} "${props.slug}" - ${cmsPage.online ? 'Online' : 'Online'}`}>
                    {inner}
                    {!loadingState && this.state.addNewSite &&
                    <SimpleDialog fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
                                  onClose={(e) => {
                                      if (e.key === 'ok') {
                                          const formValidation = this.addNewSiteForm.validate()
                                          if (formValidation.isValid) {
                                              if (this.addNewSiteForm.props.values._id) {
                                                  const queries = getTypeQueries('CmsPage')
                                                  const slug = this.addNewSiteForm.state.fields.slug
                                                  const name = this.addNewSiteForm.state.fields.name
                                                  delete name.__typename
                                                  this.props.client.mutate({
                                                      mutation: gql(queries.clone),
                                                      variables: {
                                                          _id: this.addNewSiteForm.props.values._id[0]._id,
                                                          slug,
                                                          name
                                                      },
                                                      update: (store, {data}) => {
                                                          if (!data.errors) {
                                                              setTimeout(() => {
                                                                      window.location.href = `/${slug}`
                                                                  }, 500
                                                              )
                                                              /*,()=>{
                                                                  //this.props.history.push(`/${slug}`)

                                                              })*/

                                                          }
                                                      }
                                                  })
                                              }
                                          }
                                      } else {
                                          window.history.back()
                                      }
                                  }}
                                  actions={[{
                                      key: 'cancel',
                                      label: 'Abbrechen',
                                      type: 'secondary'
                                  }, {
                                      key: 'ok',
                                      label: 'Erstellen',
                                      type: 'primary'
                                  }]}
                                  title={this.state.addNewSite.slugNoExist ? `Seite "${this.state.addNewSite.slugNoExist}" exisitert nicht. Möchten Sie die Seite jetzt erstellen?` : 'Neue Seite erstellen'}>


                        <GenericForm ref={(e) => {
                            this.addNewSiteForm = e
                        }} primaryButton={false}
                                     values={this.state.addNewSite}
                                     onChange={(e) => {
                                         if (e.name === '_id') {
                                             const fields = this.addNewSiteForm.state.fields
                                             const values = {_id: fields._id}

                                             if (fields.slug) {
                                                 values.slug = fields.slug
                                             } else {
                                                 values.slug = e.value[0].slug
                                             }
                                             if (fields.name) {
                                                 values.name = fields.name
                                             } else {
                                                 values.name = e.value[0].name
                                             }

                                             setTimeout(() => {
                                                 this.setState({addNewSite: values})
                                             }, 10)
                                         }
                                     }}
                                     fields={{
                                         _id: {
                                             uitype: 'type_picker',
                                             type: 'CmsPage',
                                             placeholder: 'Vorlage auswählen',
                                             fullWidth: true,
                                             label: 'Vorlage',
                                             searchFields: ['name'],
                                             required: true
                                         },
                                         slug: {
                                             fullWidth: true,
                                             label: 'Slug',
                                             required: true
                                         },
                                         name: {
                                             fullWidth: true,
                                             label: 'Titel',
                                             localized: true,
                                             required: true
                                         }
                                     }}/>


                    </SimpleDialog>}
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
                    const correctJson = cmsEditData.props.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ');
                    props = JSON.parse(correctJson)
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

        let firstOfPath
        if (path) {
            if (path.indexOf('.') < 0) {
                firstOfPath = path
            } else {
                firstOfPath = path.substring(0, path.indexOf('.'))

            }
        }
        let segment, index = -1
        for (let i = 0; i < this._tmpDataResolver.length; i++) {
            const json = this._tmpDataResolver[i]
            if (key) {
                if (json.key === key) {
                    index = i
                    segment = json
                    break
                }
            } else if (json[firstOfPath]) {
                index = i
                segment = json
                break
            }
        }
        if (!segment) {
            if (key) {
                segment = {key}
            } else {
                segment = {[firstOfPath]: {}}
            }
            this._tmpDataResolver.push(segment)
        }

        return {dataResolver: this._tmpDataResolver, segment, index}
    }

    handleCmsError(e, meta) {
        this.props.errorHandlerAction.addError({key: 'cmsError', msg: `${meta.loc}: ${e.message}`})
    }

    saveUnsafedChanges() {
        // blur on unload to make sure everything gets saved
        document.activeElement.blur()

        // clear timeouts
        if (this._saveSettings) {
            this._saveSettings()
        }

        if (this._autoSaveScriptTimeout) {
            this._autoSaveScript()
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

    handleFlagChange = (key, e, flag) => {
        if (this._saveSettings)
            this._saveSettings()
        this.setState({[key]: flag})
        this.saveCmsPage(flag, this.props.cmsPage, key)
    }


    handleClientScriptChange = (script) => {
        if (this._saveSettings)
            this._saveSettings()
        if (script.length > 50) {
            // delay change
            clearTimeout(this._scriptTimeout)
            this._scriptTimeout = setTimeout(() => {
                this._scriptTimeout = null
                this.setState({script})
            }, 200)

        } else {
            this.setState({script})
        }

        this._autoSaveScript = () => {
            if (this._scriptTimeout) {
                this._autoSaveScriptTimeout = setTimeout(this._autoSaveScript, 5000)
            } else {
                clearTimeout(this._autoSaveScriptTimeout)
                this._autoSaveScriptTimeout = 0
                this.saveCmsPage(script, this.props.cmsPage, 'script')
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
            this._autoSaveDataResolverTimeout = setTimeout(this._autoSaveDataResolver, instantSave || 5000)
        }
    }

    handleTemplateChange = (str, instantSave, skipHistory) => {
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

        }, instantSave ? 0 : 500)
    }

    handleResourceChange = (str) => {
        this.setState({resources: str})
        this.saveCmsPage(str, this.props.cmsPage, 'resources')
    }

    drawerWidthChange = (newWidth) => {
        this.handleSettingChange('drawerWidth', newWidth)
    }

    drawerOpenClose = (open) => {
        this.handleSettingChange('drawerOpen', open)
    }

    handleComponentEditClose() {
        const {_cmsActions, cmsComponentEdit} = this.props
        this.saveCmsPage(this.state.template, this.props.cmsPage, 'template')
        _cmsActions.editCmsComponent(null, cmsComponentEdit.component, cmsComponentEdit.scope)
    }

    handleEditDataClose(action, {editedData, dataToEdit, type}) {
        const {_cmsActions, cmsPage, updateResolvedData, cmsEditData} = this.props
        if (editedData) {
            if (!dataToEdit) {

                window.location.href = window.location.href
                /* setTimeout(()=>{
                     this.forceUpdate()
                 },100)*/
            } else {
                const resolvedDataJson = JSON.parse(cmsPage.resolvedData),
                    resolver = resolvedDataJson[cmsEditData.resolverKey || type]

                if (resolver) {
                    const results = resolver.results
                    let idx = results.findIndex(x => x._id === dataToEdit._id)

                    if (idx < 0) {
                        idx = 0
                        results.unshift({_id: dataToEdit._id})
                    }

                    results[idx] = Object.assign(results[idx], editedData)

                    const formFields = getFormFields(type)
                    // convert type=Object to Object
                    Object.keys(formFields).forEach(key => {
                        const field = formFields[key]
                        if (field.type === 'Object' && results[idx][key].constructor !== Object) {
                            results[idx][key] = JSON.parse(editedData[key])
                        }
                    })

                    updateResolvedData({json: resolvedDataJson})
                }
            }
        }

        _cmsActions.editCmsData(null)
    }

    handleSettingChange(key, any) {
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
        this.setState({settings: Object.assign({}, this.state.settings, {[key]: value})}, this.saveSettings)
    }

    saveSettings() {

        this._saveSettings = () => {

            const settings = this.state.settings
            const {pageSettings, generalSettings} = CmsViewEditorContainer.getSettingsByKeyValue(this.props)

            let pageSettingsChanged, generalSettingsChanged

            Object.keys(settings).forEach(key => {
                if (CmsViewEditorContainer.generalSettingsKeys.indexOf(key) > -1) {
                    if (Util.shallowCompare(generalSettings[key], settings[key])) {
                        generalSettingsChanged = true
                        generalSettings[key] = settings[key]
                    }
                } else {
                    if (Util.shallowCompare(pageSettings[key], settings[key])) {
                        pageSettingsChanged = true
                        pageSettings[key] = settings[key]
                    }
                }
            })
            if (generalSettingsChanged) {
                this.props.setKeyValue({
                    key: settingKeyPrefix,
                    value: generalSettings,
                    internal: true
                })
            }
            if (pageSettingsChanged) {
                this.props.setKeyValue({
                    key: settingKeyPrefix + this.props.slug,
                    value: pageSettings,
                    internal: true
                })
            }


            clearTimeout(this.saveSettingsTimeout)
            this.saveSettingsTimeout = 0
            delete this._saveSettings
        }

        clearTimeout(this.saveSettingsTimeout)
        this.saveSettingsTimeout = setTimeout(this._saveSettings, 5000)
    }

}


CmsViewEditorContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    loading: PropTypes.bool,
    renewing: PropTypes.bool,
    aboutToChange: PropTypes.bool,
    fetchMore: PropTypes.func,
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    cmsComponentEdit: PropTypes.object,
    cmsEditData: PropTypes.object,
    keyValues: PropTypes.any,
    setKeyValue: PropTypes.func.isRequired,
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
    urlSensitiv: PropTypes.bool,
    /* actions */
    _cmsActions: PropTypes.object.isRequired,
    /* udate data */
    updateCmsPage: PropTypes.func.isRequired,
    errorHandlerAction: PropTypes.object.isRequired,
    updateResolvedData: PropTypes.func.isRequired
}


const CmsViewEditorContainerWithGql = compose(
    graphql(gqlQueryKeyValues, {
        skip: props => props.dynamic || !isEditMode(props),
        options(ownProps) {
            return {
                variables: {
                    keys: [settingKeyPrefix, settingKeyPrefix + ownProps.slug]
                },
                fetchPolicy: 'network-only'
            }
        },
        props: ({data: {keyValues, loading, variables}}) => {
            return {
                keyValues,
                loadingKeyValues: loading
            }
        }
    }),
    graphql(gql`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$name:LocalizedStringInput,$script:String,$serverScript:String,$resources:String,$style:String,$dataResolver:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:Boolean,$parseResolvedData:Boolean,$alwaysLoadAssets:Boolean,$ssrStyle:Boolean,$compress:Boolean,$query:String,$props:String){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,name:$name,script:$script,style:$style,serverScript:$serverScript,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv,alwaysLoadAssets:$alwaysLoadAssets,compress:$compress,ssrStyle:$ssrStyle,parseResolvedData:$parseResolvedData,query:$query,props:$props){slug name {${config.LANGUAGES.join(' ')}} template script serverScript resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status cacheKey}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, ...rest}, key, cb) => {

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
                return mutate({
                    variables: variablesWithNewValue,
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        updateCmsPage: {
                            _id,
                            ...rest,
                            status: 'updating',
                            modifiedAt: new Date().getTime(),
                            createdBy: {
                                _id: ownProps.user.userData._id,
                                username: ownProps.user.userData.username,
                                __typename: 'UserPublic'
                            },
                            __typename: 'CmsPage'
                        }
                    },
                    update: (store, {data: {updateCmsPage}}) => {

                        const data = store.readQuery({
                            query: gqlQuery(),
                            variables
                        })
                        if (data.cmsPage) {

                            // update cmsPage
                            const newData = {
                                _id,
                                [key]: updateCmsPage[key], ...rest,
                                modifiedAt: updateCmsPage.modifiedAt,
                                status: updateCmsPage.status
                            }

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                newData.resolvedData = updateCmsPage.resolvedData
                                newData.subscriptions = updateCmsPage.subscriptions
                            }
                            store.writeQuery({query: gqlQuery(), variables, data: {...data, cmsPage: newData}})
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


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    return {
        cmsComponentEdit: store.cms.edit,
        cmsEditData: store.cms.editData
    }
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    _cmsActions: bindActionCreators(CmsActions, dispatch),
    errorHandlerAction: bindActionCreators(ErrorHandlerAction, dispatch)
})

/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withApollo(CmsViewEditorContainerWithGql))

