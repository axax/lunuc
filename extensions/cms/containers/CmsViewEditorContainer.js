import React from 'react'
import {
    isEditMode,
    getSlugVersion,
    getGqlVariables,
    settingKeyPrefix,
    gqlQueryKeyValue,
    gqlQuery
} from '../util/cmsView'
import PropTypes from 'prop-types'
import {graphql} from 'react-apollo'
import compose from 'util/compose'
import gql from 'graphql-tag'
import Expandable from 'client/components/Expandable'
import ErrorHandler from 'client/components/layout/ErrorHandler'
import DataResolverEditor from '../components/DataResolverEditor'
import TemplateEditor from '../components/TemplateEditor'
import ScriptEditor from '../components/ScriptEditor'
import ResourceEditor from '../components/ResourceEditor'
import {DrawerLayout, MenuList, MenuListItem, Button, SimpleSwitch, SimpleDialog, Divider, UIProvider} from 'ui/admin'
import NetworkStatusHandler from 'client/components/layout/NetworkStatusHandler'
import config from 'gen/config'
import * as ErrorHandlerAction from 'client/actions/ErrorHandlerAction'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as CmsActions from '../actions/CmsAction'
import {getTypeQueries} from 'util/types'
import {Query} from 'react-apollo'
import TypeEdit from '../../../client/components/types/TypeEdit'
import withType from '../../../client/components/types/withType'
import Util from "../../../client/util";
import {CAPABILITY_MANAGE_CMS_PAGES} from "../constants";


class CmsViewEditorContainer extends React.Component {

    constructor(props) {
        super(props)
        this.state = CmsViewEditorContainer.propsToState(props, null)
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if ((nextProps.cmsPage !== prevState.cmsPage && nextProps.cmsPage && nextProps.cmsPage.status !== 'updating')
            || nextProps.keyValue !== prevState.keyValue) {
            return CmsViewEditorContainer.propsToState(nextProps, prevState)
        }
        return null
    }

    static propsToState(props, state) {
        const {template, script, serverScript, resources, dataResolver, ssr, urlSensitiv, status, parseResolvedData, alwaysLoadAssets} = props.cmsPage || {}
        let settings = null
        if (props.keyValue) {
            // TODO optimize so JSON.parse is only called once
            try {
                settings = JSON.parse(props.keyValue.value)
            } catch (e) {
                settings = {}
            }
        } else {
            settings = {}
        }

        const result = {
            keyValue: props.keyValue,
            cmsPage: props.cmsPage,
            settings,
            loadingSettings: props.keyValue === undefined,
            template,
            resources,
            script,
            serverScript,
            dataResolver,
            ssr,
            urlSensitiv,
            parseResolvedData,
            alwaysLoadAssets,
            public: props.cmsPage && props.cmsPage.public
        }
        if (state && ['updating', 'updated'].indexOf(status) >= 0) {
            // take value from state if there is any because it might be more up to date
            result.template = state.template
            result.script = state.script
            result.serverScript = state.serverScript
            result.dataResolver = state.dataResolver
            result.resources = state.resources
        }
        return result
    }


    componentDidMount() {
        this._handleWindowClose = this.saveUnsafedChanges.bind(this)
        window.addEventListener('beforeunload', this._handleWindowClose)
        window.addEventListener('blur', this._handleWindowClose)
        this.props.history.listen(() => {
            this.saveUnsafedChanges()
        })
    }

    componentWillUnmount() {
        this.saveUnsafedChanges()
        window.removeEventListener('beforeunload', this._handleWindowClose)
        window.removeEventListener('blur', this._handleWindowClose)
    }


    shouldComponentUpdate(props, state) {

        if (!props.cmsPage && props.loading && this.props.loading) {
            // if there is still no cmsPage and it is still loading
            // there is no need to update
            return false
        }
        // only update if it is needed
        return !props.cmsPage ||
            !this.props.cmsPage ||
            props.cmsPage.slug !== this.props.cmsPage.slug ||
            props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||
            props.cmsComponentEdit !== this.props.cmsComponentEdit ||
            props.cmsEditData !== this.props.cmsEditData ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            (!props.renewing && this.props.renewing) ||
            (
                props.cmsPage.urlSensitiv && (
                    props.location.search !== this.props.location.search ||
                    props.location.hash !== this.props.location.hash)
            ) ||
            props.user !== this.props.user ||
            props.children != this.props.children ||
            props._props !== this.props._props ||
            state.template !== this.state.template ||
            state.script !== this.state.script ||
            state.serverScript !== this.state.serverScript ||
            this.props.cmsPages !== props.cmsPages ||
            this.state.loadingSettings !== state.loadingSettings ||
            this.state.settings.fixedLayout !== state.settings.fixedLayout ||
            this.state.settings.inlineEditor !== state.settings.inlineEditor ||
            this.state.settings.templateTab !== state.settings.templateTab ||
            this.state.settings.drawerWidth !== state.settings.drawerWidth

    }

    render() {
        const {WrappedComponent, cmsPages, cmsPage, cmsEditData, cmsComponentEdit, ...props} = this.props

        const {template, resources, script, settings, dataResolver, serverScript, loadingSettings} = this.state

        if (!cmsPage) {
            // show a loader here
            if (!props.dynamic) {
                return <NetworkStatusHandler/>
            }
        }

        // extend with value from state because they are more update to date
        const cmsPageWithState = Object.assign({}, cmsPage, {script, template})

        console.log('render CmsViewEditorContainer')

        const inEditor = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_PAGES)

        const inner = [!loadingSettings &&
        <WrappedComponent key="cmsView" cmsEditData={cmsEditData} onChange={this.handleTemplateChange}
                          inEditor={inEditor}
                          onError={this.handleCmsError.bind(this)} settings={settings}
                          cmsPage={cmsPageWithState}  {...props} />
            ,
            <ErrorHandler key="errorHandler" snackbar/>,
            <NetworkStatusHandler key="networkStatus"/>,
            <SimpleDialog key="templateEditor" open={!!cmsComponentEdit.key} onClose={this.handleComponentEditClose.bind(this)}
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

            </SimpleDialog>,

            cmsEditData && <Query key="dataEditor" query={gql(getTypeQueries(cmsEditData.type).query)}
                                  variables={{filter: `_id=${cmsEditData._id}`}}
                                  fetchPolicy="network-only">

                {({loading, error, data}) => {
                    if (loading) {
                        return 'Loading...'
                    }

                    if (error) return `Error! ${error.message}`
                    if (data.genericDatas.results.length === 0) return 'No data'

                    const editDialogProps = {
                        type: cmsEditData.type,
                        title: cmsEditData.type,
                        open: !!cmsEditData,
                        onClose: this.handleEditDataClose.bind(this),
                        dataToEdit: data.genericDatas.results[0],
                        parentRef: this
                    }
                    return React.createElement(
                        withType(TypeEdit),
                        editDialogProps,
                        null
                    )
                }}
            </Query>

        ]


        if( !inEditor ) {
            return inner
        }else{
            const sidebar = <div>
                <MenuList>
                    <MenuListItem onClick={e => {
                        const win = window.open(location.pathname + '?preview=true', '_blank')
                        win.focus()
                    }} button primary="Preview"/>
                </MenuList>
                <Divider/>

                <div style={{padding: '10px'}}>

                    <Expandable title="Data resolver"
                                onChange={this.handleSettingChange.bind(this, 'dataResolverExpanded')}
                                expanded={settings.dataResolverExpanded}>
                        <DataResolverEditor
                            onScroll={this.handleSettingChange.bind(this, 'dataResolverScroll')}
                            scrollPosition={settings.dataResolverScroll}
                            onBlur={() => {
                                this.saveUnsafedChanges()
                            }}
                            onChange={this.handleDataResolverChange.bind(this)}>{dataResolver}</DataResolverEditor>
                    </Expandable>

                    <Expandable title="Server Script"
                                onChange={this.handleSettingChange.bind(this, 'serverScriptExpanded')}
                                expanded={settings.serverScriptExpanded}>
                        <ScriptEditor
                            onScroll={this.handleSettingChange.bind(this, 'serverScriptScroll')}
                            scrollPosition={settings.serverScriptScroll}
                            onChange={this.handleServerScriptChange.bind(this)}>{serverScript}</ScriptEditor>
                    </Expandable>

                    <Expandable title="Template"
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
                    </Expandable>

                    <Expandable title="Script"
                                onChange={this.handleSettingChange.bind(this, 'scriptExpanded')}
                                expanded={settings.scriptExpanded}>
                        <ScriptEditor
                            onScroll={this.handleSettingChange.bind(this, 'scriptScroll')}
                            scrollPosition={settings.scriptScroll}
                            onChange={this.handleClientScriptChange.bind(this)}>{script}</ScriptEditor>
                    </Expandable>


                    <Expandable title="Static assets"
                                onChange={this.handleSettingChange.bind(this, 'resourceExpanded')}
                                expanded={settings.resourceExpanded}>

                        <ResourceEditor resources={resources}
                                        onChange={this.handleResourceChange.bind(this)}></ResourceEditor>
                    </Expandable>


                    <Expandable title="Settings"
                                onChange={this.handleSettingChange.bind(this, 'settingsExpanded')}
                                expanded={settings.settingsExpanded}>

                        <SimpleSwitch
                            label="SSR (Server side Rendering)"
                            checked={!!this.state.ssr}
                            onChange={this.handleFlagChange.bind(this, 'ssr')}
                        />
                        <SimpleSwitch
                            label="Public (is visible to everyone)"
                            checked={!!this.state.public}
                            onChange={this.handleFlagChange.bind(this, 'public')}
                        />
                        <SimpleSwitch
                            label="Url sensitive (refresh component on url change)"
                            checked={!!this.state.urlSensitiv}
                            onChange={this.handleFlagChange.bind(this, 'urlSensitiv')}
                        />
                        <SimpleSwitch
                            label="Always load assets (even when component is loaded dynamically)"
                            checked={!!this.state.alwaysLoadAssets}
                            onChange={this.handleFlagChange.bind(this, 'alwaysLoadAssets')}
                        />
                        <SimpleSwitch
                            label="Parse resolvedData in frontend (replace placeholders)"
                            checked={!!this.state.parseResolvedData}
                            onChange={this.handleFlagChange.bind(this, 'parseResolvedData')}
                        />
                    </Expandable>

                    <Expandable title="Revisions"
                                onChange={this.handleSettingChange.bind(this, 'revisionsExpanded')}
                                expanded={settings.revisionsExpanded}>
                        To be implemented
                    </Expandable>


                    {cmsPages && cmsPages.results && cmsPages.results.length > 1 &&

                    <Expandable title="Related pages"
                                onChange={this.handleSettingChange.bind(this, 'relatedPagesExpanded')}
                                expanded={settings.relatedPagesExpanded}>
                        <MenuList>
                            {
                                cmsPages.results.map(i => {
                                        if (i.slug !== props.slug) {
                                            return <MenuListItem key={i.slug} onClick={e => {
                                                history.push('/' + i.slug)
                                            }} button primary={i.slug}/>
                                        }
                                    }
                                )
                            }

                        </MenuList>
                    </Expandable>
                    }

                </div>
            </div>

            return <UIProvider>
                <DrawerLayout sidebar={sidebar}
                              open={settings.drawerOpen}
                              fixedLayout={settings.fixedLayout}
                              drawerWidth={settings.drawerWidth}
                              onDrawerOpenClose={this.drawerOpenClose}
                              onDrawerWidthChange={this.drawerWidthChange}
                              toolbarRight={[
                                  <SimpleSwitch key="inlineEditorSwitch" color="default"
                                                checked={!!settings.inlineEditor}
                                                onChange={this.handleSettingChange.bind(this, 'inlineEditor')}
                                                contrast
                                                label="Inline Editor"/>,
                                  <SimpleSwitch key="fixedLayoutSwitch" color="default"
                                                checked={!!settings.fixedLayout}
                                                onChange={this.handleSettingChange.bind(this, 'fixedLayout')}
                                                contrast
                                                label="Fixed"/>,

                                  <Button key="button" size="small" color="inherit" onClick={e => {
                                      this.props.history.push(config.ADMIN_BASE_URL + '/cms' + (_app_._cmsLastSearch ? _app_._cmsLastSearch : ''))
                                  }}>Back</Button>
                              ]
                              }
                              title={`Edit Page "${props.slug}" - ${cmsPage.online ? 'Online' : 'Offline'}`}>
                    {inner}

                </DrawerLayout>
            </UIProvider>
        }

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
                    console.log('done')
                }
            )
        }
    }

    handleFlagChange = (key, e, flag) => {
        this.setState({[key]: flag})
        this.saveCmsPage(flag, this.props.cmsPage, key)
    }


    handleClientScriptChange = (script) => {
        if (this._saveSettings)
            this._saveSettings()
        if (script.length > 10000) {
            // delay change for bigger script
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

    handleServerScriptChange = (serverScript) => {
        if (this._saveSettings)
            this._saveSettings()
        this.setState({serverScript})
        this._autoSaveServerScript = () => {
            clearTimeout(this._autoSaveServerScriptTimeout)
            this._autoSaveServerScriptTimeout = 0
            this.saveCmsPage(serverScript, this.props.cmsPage, 'serverScript')
        }

        clearTimeout(this._autoSaveServerScriptTimeout)
        this._autoSaveServerScriptTimeout = setTimeout(this._autoSaveServerScript, 5000)
    }

    handleDataResolverChange = (str, instantSave) => {
        if (this._saveSettings)
            this._saveSettings()
        this.setState({dataResolver: str})
        this._autoSaveDataResolver = () => {
            clearTimeout(this._autoSaveDataResolverTimeout)
            this._autoSaveDataResolverTimeout = 0
            this.saveCmsPage(str, this.props.cmsPage, 'dataResolver')
        }

        clearTimeout(this._autoSaveDataResolverTimeout)
        if (instantSave) {
            this._autoSaveDataResolver()
        } else {
            this._autoSaveDataResolverTimeout = setTimeout(this._autoSaveDataResolver, 5000)
        }
    }

    handleTemplateChange = (str, instantSave) => {
        clearTimeout(this._templateTimeout)
        this._templateTimeout = setTimeout(() => {
            if (str.constructor !== String) {
                str = JSON.stringify(str, null, 2)
            }
            if (this._saveSettings)
                this._saveSettings()
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

        }, instantSave ? 0 : 250)
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
        const {_cmsActions, cmsPage, updateResolvedData} = this.props

        if (editedData && dataToEdit) {
            const resolvedDataJson = JSON.parse(cmsPage.resolvedData)

            if (resolvedDataJson[type]) {
                const results = resolvedDataJson[type].results
                const idx = results.findIndex(x => x._id === dataToEdit._id)
                if (idx >= 0) {
                    results[idx] = Object.assign(results[idx], editedData)
                    updateResolvedData(resolvedDataJson)
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
        const key = settingKeyPrefix + this.props.slug, settings = this.state.settings

        this._saveSettings = () => {
            clearTimeout(this.saveSettingsTimeout)
            this.saveSettingsTimeout = 0
            this.props.setKeyValue(key, settings, false, true)
            delete this._saveSettings
        }

        clearTimeout(this.saveSettingsTimeout)
        this.saveSettingsTimeout = setTimeout(this._saveSettings, 5000)
    }

}


CmsViewEditorContainer.propTypes = {
    loading: PropTypes.bool,
    renewing: PropTypes.bool,
    aboutToChange: PropTypes.bool,
    fetchMore: PropTypes.func,
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    cmsPages: PropTypes.object,
    cmsComponentEdit: PropTypes.object,
    cmsEditData: PropTypes.object,
    keyValue: PropTypes.object,
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
    graphql(gql`query cmsPages($filter:String,$limit:Int,$_version:String){cmsPages(filter:$filter,limit:$limit,_version:$_version){results{slug}}}`, {
        skip: props => props.dynamic || !isEditMode(props),
        options(ownProps) {
            const {slug, _version} = getSlugVersion(ownProps.slug),
                variables = {
                    _version,
                    limit: 99,
                    filter: `slug=^${slug.split('/')[0]}$ slug=^${slug.split('/')[0]}/`
                }
            return {
                variables,
                fetchPolicy: 'network-only'
            }
        },
        props: ({data: {cmsPages}}) => {
            return {
                cmsPages
            }
        }
    }),
    graphql(gqlQueryKeyValue, {
        skip: props => props.dynamic || !isEditMode(props),
        options(ownProps) {
            return {
                variables: {
                    key: settingKeyPrefix + ownProps.slug
                },
                fetchPolicy: 'network-only'
            }
        },
        props: ({data: {keyValue}}) => {
            return {
                keyValue
            }
        }
    }),
    graphql(gql`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$script:String,$serverScript:String,$resources:String,$dataResolver:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:Boolean,$parseResolvedData:Boolean,$alwaysLoadAssets:Boolean,$query:String,$props:String){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,script:$script,serverScript:$serverScript,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv,alwaysLoadAssets:$alwaysLoadAssets,parseResolvedData:$parseResolvedData,query:$query,props:$props){slug template script serverScript resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status cacheKey}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, ...rest}, key, cb) => {

                const variables = getGqlVariables(ownProps)
                const variablesWithNewValue = {...variables, _id, [key]: rest[key]}

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
                            query: gqlQuery,
                            variables
                        })
                        if (data.cmsPage) {
                            // update cmsPage
                            data.cmsPage = {
                                _id,
                                [key]: updateCmsPage[key], ...rest,
                                modifiedAt: updateCmsPage.modifiedAt,
                                status: updateCmsPage.status
                            }

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                data.cmsPage.resolvedData = updateCmsPage.resolvedData
                                data.cmsPage.subscriptions = updateCmsPage.subscriptions
                            }
                            store.writeQuery({query: gqlQuery, variables, data})
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
)(CmsViewEditorContainerWithGql)

