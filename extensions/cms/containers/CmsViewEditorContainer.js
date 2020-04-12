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
import {graphql, withApollo} from '@apollo/react-hoc'
import {Query} from '@apollo/react-components'
import {ApolloClient} from '@apollo/client/core'
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
import Util from "../../../client/util";
import {CAPABILITY_MANAGE_CMS_PAGES, CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants'
import CodeEditor from 'client/components/CodeEditor'
import {propertyByPath, setPropertyByPath} from '../../../client/util/json'
import GenericForm from '../../../client/components/GenericForm'
import _t from 'util/i18n'
import config from 'gen/config'
import {getFormFields} from '../../../util/typesAdmin'


class CmsViewEditorContainer extends React.Component {

    static lastSettings = {inlineEditor: true, fixedLayout: true}

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
        const {template, script, style, serverScript, resources, dataResolver, ssr, urlSensitiv, status, parseResolvedData, alwaysLoadAssets, compress} = props.cmsPage || {}
        let settings = null
        if (props && props.cmsPage && state && state.cmsPage && props.cmsPage.slug === state.cmsPage.slug && state.settings && !state.settings._default) {
            settings = state.settings
        } else if (props.keyValue) {
            try {
                settings = JSON.parse(props.keyValue.value)
                delete settings._default
            } catch (e) {
            }
        }

        if (!settings) {
            settings = Object.assign({_default: true}, CmsViewEditorContainer.lastSettings)
        }

        const result = {
            keyValue: props.keyValue,
            cmsPage: props.cmsPage,
            settings,
            loadingSettings: props.keyValue === undefined,
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
            compress,
            public: props.cmsPage && props.cmsPage.public
        }
        if (state && (['updating', 'updated'].indexOf(status) >= 0 || props && props.cmsPage && state.cmsPage && props.cmsPage.slug === state.cmsPage.slug)) {
            // take value from state if there is any because it might be more up to date
            result.template = state.template
            result.script = state.script
            result.style = state.style
            result.serverScript = state.serverScript
            result.dataResolver = state.dataResolver
            result.resources = state.resources
        }

        if (props.cmsPage && !props.cmsPage._id) {
            result.addNewSite = {slugNoExist: props.slug, slug: props.slug}
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
            state.style !== this.state.style ||
            state.showRevision !== this.state.showRevision ||
            state.addNewSite !== this.state.addNewSite ||
            state.serverScript !== this.state.serverScript ||
            this.state.loadingSettings !== state.loadingSettings ||
            this.state.settings.fixedLayout !== state.settings.fixedLayout ||
            this.state.settings.inlineEditor !== state.settings.inlineEditor ||
            this.state.settings.templateTab !== state.settings.templateTab ||
            this.state.settings.drawerWidth !== state.settings.drawerWidth

    }

    render() {
        const {WrappedComponent, cmsPage, cmsEditData, cmsComponentEdit, ...props} = this.props

        const {template, resources, script, style, settings, dataResolver, serverScript, loadingSettings} = this.state
        if (!cmsPage) {
            // show a loader here
            if (!props.dynamic) {
                return <NetworkStatusHandler/>
            }
        }

        // extend with value from state because they are more update to date
        const cmsPageWithState = Object.assign({}, cmsPage, {script, style, template})

        console.log('render CmsViewEditorContainer')

        const inEditor = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_PAGES),
            hasTemplate = Util.hasCapability(props.user, CAPABILITY_MANAGE_CMS_TEMPLATE)

        let cmsEditDataProps, cmsEditDataValue

        if (cmsEditData && !cmsEditData.type) {
            cmsEditDataProps = this.getDataResolverProperty(cmsEditData)
            cmsEditDataValue = cmsEditData.value
        }
        let formRef
        const inner = [!loadingSettings &&
        <WrappedComponent key="cmsView" cmsEditData={cmsEditData}
                          onChange={this.handleTemplateChange}
                          inEditor={inEditor}
                          onError={this.handleCmsError.bind(this)}
                          onDataResolverPropertyChange={this.handleDataResolverPropertySave.bind(this)}
                          settings={settings}
                          cmsPage={cmsPageWithState}
                          {...props} />
            ,
            <ErrorHandler key="errorHandler" snackbar/>,
            <NetworkStatusHandler key="networkStatus"/>,
            <SimpleDialog fullWidth={true} maxWidth="md" key="templateEditor" open={!!cmsComponentEdit.key}
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

            </SimpleDialog>,

            cmsEditData ?
                cmsEditData.type ?
                    <Query key="dataEditor" query={gql(getTypeQueries(cmsEditData.type).query)}
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
                        }}
                    </Query> :
                    <SimpleDialog fullWidth={true} maxWidth="sm" key="propertyEditor" open={true} onClose={(e) => {
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

                : null

        ]


        if (!inEditor) {
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

                    {hasTemplate && <Expandable title="Data resolver"
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

                    {hasTemplate && <Expandable title="Server Script"
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

                    {hasTemplate && <Expandable title="Template"
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

                    {hasTemplate && <Expandable title="Script"
                                                onChange={this.handleSettingChange.bind(this, 'scriptExpanded')}
                                                expanded={settings.scriptExpanded}>
                        <ScriptEditor
                            onScroll={this.handleSettingChange.bind(this, 'scriptScroll')}
                            scrollPosition={settings.scriptScroll}
                            onChange={this.handleClientScriptChange.bind(this)}>{script}</ScriptEditor>
                    </Expandable>}

                    {hasTemplate && <Expandable title="Style"
                                                onChange={this.handleSettingChange.bind(this, 'styleExpanded')}
                                                expanded={settings.styleExpanded}>

                        <CodeEditor showFab lineNumbers type="css"
                                    onScroll={this.handleSettingChange.bind(this, 'styleScroll')}
                                    scrollPosition={settings.styleScroll}
                                    onChange={this.handleStyleChange.bind(this)}>{style}</CodeEditor>

                    </Expandable>}


                    {hasTemplate && <Expandable title="Static assets"
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

                        {hasTemplate && <React.Fragment><SimpleSwitch
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

                                if (parsedData.template) {

                                    return <div>
                                        <p>Template changed</p>
                                        <pre>{JSON.stringify(JSON.parse(parsedData.template), null, 4)}</pre>
                                    </div>

                                } else if (parsedData.script) {

                                    return <div>
                                        <p>Script changed</p>
                                        <textarea>{parsedData.script}</textarea>
                                    </div>

                                }
                                return <pre>{JSON.stringify(parsedData, null, 4)}</pre>
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

            return <UIProvider>
                <DrawerLayout sidebar={sidebar}
                              open={settings.drawerOpen}
                              fixedLayout={settings.fixedLayout}
                              drawerWidth={settings.drawerWidth}
                              onDrawerOpenClose={this.drawerOpenClose}
                              onDrawerWidthChange={this.drawerWidthChange}
                              toolbarRight={[
                                  <SimpleSwitch key="fixedLayoutSwitch" color="default"
                                                checked={!!settings.fixedLayout}
                                                onChange={this.handleSettingChange.bind(this, 'fixedLayout')}
                                                contrast
                                                label={_t('CmsViewEditorContainer.fixed')}/>,
                                  <SimpleSwitch key="inlineEditorSwitch" color="default"
                                                checked={!!settings.inlineEditor}
                                                onChange={this.handleSettingChange.bind(this, 'inlineEditor')}
                                                contrast
                                                label={_t('CmsViewEditorContainer.inlineEditor')}/>,
                                  <Button key="buttonBack" size="small" color="inherit" onClick={e => {
                                      this.props.history.push(config.ADMIN_BASE_URL + '/cms' + (_app_._cmsLastSearch ? _app_._cmsLastSearch : ''))
                                  }}>Admin</Button>,
                                  <Button key="buttonLogout" size="small" color="inherit" onClick={() => {
                                      this.props.history.push(`${config.ADMIN_BASE_URL}/logout#forward=${encodeURIComponent(window.location.pathname)}`)
                                  }}>Logout</Button>,
                                  <SimpleMenu key="moreMenu" color="inherit" items={[{
                                      name: 'Neue Seite erstellen', onClick: () => {
                                          this.setState({addNewSite: {}})

                                      }
                                  }]}/>
                              ]
                              }
                              title={`${_t('CmsViewEditorContainer.editPage')} "${props.slug}" - ${cmsPage.online ? 'Online' : 'Online'}`}>
                    {inner}
                    {this.state.addNewSite &&
                    <SimpleDialog fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
                                  onClose={(e) => {
                                      if (e.key === 'ok') {
                                          if (this.addNewSiteForm.validate()) {
                                              console.log(this.addNewSiteForm.props.values)
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

                                                              this.setState({addNewSite: null})
                                                              //this.props.history.push(`/${slug}`)
                                                              window.location.href = `/${slug}`

                                                          }
                                                      }
                                                  })
                                              }
                                          }
                                      } else {
                                          this.setState({addNewSite: null})
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
            this.handleDataResolverChange(JSON.stringify(dataResolver, null, 4), instantSave)
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
        let dataResolver
        if (this.state.dataResolver) {
            try {
                dataResolver = JSON.parse(this.state.dataResolver)
            } catch (e) {
                console.log(e)
                return {}
            }
        } else {
            dataResolver = []
        }

        let firstOfPath
        if (path) {
            firstOfPath = path.substring(0, path.indexOf('.'))
        }
        let segment, index = -1
        for (let i = 0; i < dataResolver.length; i++) {
            const json = dataResolver[i]
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
            dataResolver.push(segment)
        }

        return {dataResolver, segment, index}
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

        this.setState({style})

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

            // save settings first
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

        this._saveSettings = () => {
            const key = settingKeyPrefix + this.props.slug,
                settings = this.state.settings
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
        props: ({data: {keyValue, loading}}) => {
            return {
                keyValue,
                loadingKeyValue: loading
            }
        }
    }),
    graphql(gql`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$name:LocalizedStringInput,$script:String,$serverScript:String,$resources:String,$style:String,$dataResolver:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:Boolean,$parseResolvedData:Boolean,$alwaysLoadAssets:Boolean,$compress:Boolean,$query:String,$props:String){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,name:$name,script:$script,style:$style,serverScript:$serverScript,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv,alwaysLoadAssets:$alwaysLoadAssets,compress:$compress,parseResolvedData:$parseResolvedData,query:$query,props:$props){slug name {${config.LANGUAGES.join(' ')}} template script serverScript resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status cacheKey}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, ...rest}, key, cb) => {

                const variables = getGqlVariables(ownProps)
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

