import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import JsonDom from '../components/JsonDom'
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import Util from 'client/util'
import DomUtil from 'client/util/dom'
import {getType} from 'util/types'
import * as CmsActions from '../actions/CmsAction'
import {bindActionCreators} from 'redux'
import {NO_SESSION_KEY_VALUES, NO_SESSION_KEY_VALUES_SERVER} from 'client/constants'
import {
    CAPABILITY_MANAGE_CMS_PAGES
} from '../constants'
import Async from 'client/components/Async'

// admin pack
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../../client/components/layout/ErrorPage')}/>
const Expandable = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "admin" */ '../../../client/components/Expandable')}/>
const DataResolverEditor = (props) => <Async {...props}
                                             load={import(/* webpackChunkName: "admin" */ '../components/DataResolverEditor')}/>
const TemplateEditor = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../components/TemplateEditor')}/>
const ScriptEditor = (props) => <Async {...props}
                                       load={import(/* webpackChunkName: "admin" */ '../components/ScriptEditor')}/>
const ResourceEditor = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../components/ResourceEditor')}/>
const DrawerLayout = (props) => <Async {...props} expose="DrawerLayout"
                                       load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const MenuList = (props) => <Async {...props} expose="MenuList"
                                   load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const Button = (props) => <Async {...props} expose="Button"
                                 load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const MenuListItem = (props) => <Async {...props} expose="MenuListItem"
                                       load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const SimpleSwitch = (props) => <Async {...props} expose="SimpleSwitch"
                                       load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const Divider = (props) => <Async {...props} expose="Divider"
                                  load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const UIProvider = (props) => <Async {...props} expose="UIProvider"
                                     load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const ErrorHandler = (props) => <Async {...props}
                                       load={import(/* webpackChunkName: "admin" */ '../../../client/components/layout/ErrorHandler')}/>

// the graphql query is also need to access and update the cache when data arrive from a supscription
const gqlQuery = gql`query cmsPage($slug:String!,$query:String,$nosession:String,$_version:String){cmsPage(slug:$slug,query:$query,nosession:$nosession,_version:$_version){cacheKey slug name urlSensitiv template script resources dataResolver ssr public online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`

const gqlQueryKeyValue = gql`query{keyValue(key:"CmsViewContainerSettings"){key value createdBy{_id}}}`


const isPreview = (location) => {
    const params = new URLSearchParams(location.search)
    return params.get('preview')
}

const isEditMode = (props) => {
    const {user, location, dynamic} = props

    return (user.isAuthenticated && Util.hasCapability(user, CAPABILITY_MANAGE_CMS_PAGES) && !isPreview(location) && !dynamic)
}

const getSlugVersion = (slug) => {
    const ret = {}
    if (slug.indexOf('@') === 0) {
        const pos = slug.indexOf('/')
        ret.slug = pos >= 0 ? slug.substring(pos + 1) : ''
        ret._version = pos >= 0 ? slug.substring(1, pos) : slug.substring(1)

    } else {
        ret.slug = slug
    }

    return ret
}

class CmsViewContainer extends React.Component {
    oriTitle = document.title
    registeredSubscriptions = {}

    constructor(props) {
        super(props)

        this.state = CmsViewContainer.propsToState(props, null)

        if (!props.dynamic && props.slug)
            document.title = props.slug

        this.setUpSubsciptions(props)
        this.addResources(props, this.state)
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if ((nextProps.cmsPage !== prevState.cmsPage && (nextProps.cmsPage && nextProps.cmsPage.status !== 'updating')) || nextProps.keyValue !== prevState.keyValue) {
            //console.log('CmsViewContainer update state')
            return CmsViewContainer.propsToState(nextProps, prevState)
        }
        return null
    }

    static propsToState(props, state) {
        const {template, script, resources, dataResolver, ssr, urlSensitiv, status} = props.cmsPage || {}
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
            template,
            resources,
            script,
            dataResolver,
            ssr,
            urlSensitiv,
            public: props.cmsPage && props.cmsPage.public
        }
        if (state && ['updating', 'updated'].indexOf(status) >= 0) {
            // take value from state if there is any because it might be more up to date
            result.template = state.template
            result.script = state.script
            result.dataResolver = state.dataResolver
            result.resources = state.resources
        }
        return result
    }

    shouldComponentUpdate(props, state) {

        if (props.cmsPage && (!this.props.cmsPage || (props.cmsPage.subscriptions !== this.props.cmsPage.subscriptions))) {
            //console.log('renew subscriptions')
            this.removeSubscriptions()
            this.setUpSubsciptions(props)
        }

        if (this.state.resources !== state.resources) {
            console.log('refresh resources')
            this.addResources(props, state)
        }

        // only update if cms page was modified
        return !props.cmsPage ||
            !this.props.cmsPage ||
            /*props.cmsPages !== this.props.cmsPages ||*/
            props.cmsComponentEdit !== this.props.cmsComponentEdit ||
            props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            props.cmsPage.slug !== this.props.cmsPage.slug ||
            (!props.renewing && this.props.renewing) ||
            (
                props.cmsPage.urlSensitiv && (
                props.location.search !== this.props.location.search ||
                props.location.hash !== this.props.location.hash)
            ) ||
            props.user !== this.props.user ||
            props.children != this.props.children ||
            props._props !== this.props._props ||
            (isEditMode(props) && (state.template !== this.state.template || state.script !== this.state.script)) ||
            this.state.settings.fixedLayout !== state.settings.fixedLayout ||
            this.state.settings.inlineEditor !== state.settings.inlineEditor ||
            this.state.settings.templateTab !== state.settings.templateTab ||
            this.state.settings.drawerWidth !== state.settings.drawerWidth
    }

    componentDidMount() {
        this.setUpSubsciptions(this.props)
        this._handleWindowClose = this.saveUnsafedChanges.bind(this)
        window.addEventListener('beforeunload', this._handleWindowClose)
        this.props.history.listen((location, action) => {
            this.saveUnsafedChanges()
        })
    }

    componentWillUnmount() {
        if (!this.props.dynamic)
            document.title = this.oriTitle

        this.saveUnsafedChanges()
        window.removeEventListener('beforeunload', this._handleWindowClose)

        this.removeSubscriptions()
    }

    render() {
        const {cmsPage, cmsPages, cmsComponentEdit, location, history, _parentRef, _key, _props, id, renewing, loading, className, children, user, dynamic, client, fetchMore} = this.props
        let {template, resources, script, dataResolver, settings} = this.state
        if (!cmsPage) {
            if (!loading) {
                console.warn('cmsPage missing')
                return <ErrorPage />
            }
            // show a loader here
            return null
        } else {
            // set page title
            // TODO: make tile localized
            if (!dynamic && cmsPage.name)
                document.title = cmsPage.name
        }

        const editMode = isEditMode(this.props)

        if (cmsPage.ssr && !editMode) {
            // it was already rendered on the server side
            return <span dangerouslySetInnerHTML={{__html: cmsPage.html}}/>
        }
        const scope = {
            page: {slug: cmsPage.slug},
            user,
            editMode,
            pathname: location.pathname,
            params: Util.extractQueryParams(),
            hashParams: (window.location.hash ? Util.extractQueryParams(window.location.hash.substring(1)) : {})
        }
        const startTime = new Date()
        const jsonDom = <JsonDom id={id}
                                 dynamic={dynamic}
                                 clientQuery={this.clientQuery.bind(this)}
                                 className={className}
                                 _parentRef={_parentRef}
                                 _key={_key}
                                 _props={_props}
                                 template={template}
                                 script={script}
                                 resolvedData={cmsPage.resolvedData}
                                 resources={cmsPage.resources}
                                 editMode={editMode}
                                 renewing={renewing}
                                 inlineEditor={!!settings.inlineEditor}
                                 scope={JSON.stringify(scope)}
                                 history={history}
                                 setKeyValue={this.setKeyValue.bind(this)}
                                 subscriptionCallback={cb => {
                                     this._subscriptionCallback = cb
                                 }}
                                 onFetchMore={(type) => {
                                     console.log(type)
                                     fetchMore({
                                         variables: {
                                             offset: 1
                                         },
                                         updateQuery: (prev, {fetchMoreResult}) => {
                                             console.log(fetchMoreResult)
                                         }
                                     })
                                 }}
                                 onChange={this.handleTemplateChange}>{children}</JsonDom>
        let content

        if (!editMode) {
            content = jsonDom
        } else {
            const sidebar = () => <div>

                <MenuList>
                    <MenuListItem onClick={e => {
                        const win = window.open(location.pathname + '?preview=true', '_blank')
                        win.focus()
                    }} button primary="Preview"/>
                </MenuList>
                <Divider />

                <div style={{padding: '10px'}}>

                    <Expandable title="Data resolver"
                                onChange={this.handleSettingChange.bind(this, 'dataResolverExpanded')}
                                expanded={settings.dataResolverExpanded}>
                        <DataResolverEditor
                            onChange={this.handleDataResolverChange.bind(this)}>{dataResolver}</DataResolverEditor>
                    </Expandable>

                    <Expandable title="Template"
                                onChange={this.handleSettingChange.bind(this, 'templateExpanded')}
                                expanded={settings.templateExpanded}>
                        <TemplateEditor
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
                            onChange={this.handleClientScriptChange.bind(this)}>{script}</ScriptEditor>
                    </Expandable>


                    <Expandable title="Resources"
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
                                        if (i.slug !== cmsPage.slug) {
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

            content = <UIProvider><DrawerLayout sidebar={sidebar()}
                                                open={settings.drawerOpen}
                                                fixedLayout={settings.fixedLayout}
                                                drawerWidth={settings.drawerWidth || 800}
                                                onDrawerOpenClose={this.drawerOpenClose}
                                                onDrawerWidthChange={this.drawerWidthChange}
                                                toolbarRight={[
                                                    <SimpleSwitch key="inlineEditorSwitch" color="default"
                                                                  checked={settings.inlineEditor}
                                                                  onChange={this.handleSettingChange.bind(this, 'inlineEditor')}
                                                                  contrast
                                                                  label="Inline Editor"/>,
                                                    <SimpleSwitch key="fixedLayoutSwitch" color="default"
                                                                  checked={settings.fixedLayout}
                                                                  onChange={this.handleSettingChange.bind(this, 'fixedLayout')}
                                                                  contrast
                                                                  label="Fixed"/>,

                                                    <Button key="button" size="small" color="inherit" onClick={e => {
                                                        this.props.history.push(config.ADMIN_BASE_URL + '/cms')
                                                    }}>Back</Button>
                                                ]
                                                }
                                                title={`Edit Page "${cmsPage.slug}" - ${cmsPage.online ? 'Online' : 'Offline'}`}>
                {jsonDom}
                <ErrorHandler />

                <SimpleDialog open={!!cmsComponentEdit.key} onClose={this.handleComponentEditClose.bind(this)}
                              actions={[{
                                  key: 'ok',
                                  label: 'Ok',
                                  type: 'primary'
                              }]}
                              title="Edit Component">

                    <TemplateEditor
                        component={cmsComponentEdit}
                        tab={settings.templateTab}
                        onTabChange={this.handleSettingChange.bind(this, 'templateTab')}
                        onChange={this.handleTemplateChange.bind(this)}/>


                </SimpleDialog>


            </DrawerLayout></UIProvider>
        }

        console.info(`render ${this.constructor.name} for ${cmsPage.slug} (loading=${loading}) in ${new Date() - startTime}ms / time since index.html loaded ${(new Date()).getTime() - _app_.start.getTime()}ms`)
        return content
    }


    addResources(props, state) {
        const {dynamic} = props
        let {resources} = state


        if (!dynamic) {
            DomUtil.removeElements(`[data-cms-view]`)

            if (resources) {
                try {
                    const a = JSON.parse(resources)
                    for (let i = 0; i < a.length; i++) {
                        let r = a[i].replace('${build}', ''), ext = r.substring(r.lastIndexOf('.') + 1)

                        if( r.indexOf('?')>=0 ){
                            r+='&'
                        }else{
                            r+= '?'
                        }
                        r+='v='+config.BUILD_NUMBER
                        if (ext.indexOf('css') === 0) {
                            DomUtil.addStyle(r, {
                                data: {cmsView: true}
                            })
                        } else if (ext.indexOf('js') === 0) {
                            DomUtil.addScript(r, {
                                data: {cmsView: true}
                            })
                        }
                    }
                } catch (e) {
                    console.error('Error in resources', e)
                }
            }
        }

    }

    saveUnsafedChanges() {
        // blur on unload to make sure everything gets saved
        document.activeElement.blur()

        // clear timeouts
        clearTimeout(this._scriptTimeout)
        if (this._autoSaveScriptTimeout) {
            this._autoSaveScript()
        }

        if (this._autoSaveTemplateTimeout) {
            this._autoSaveTemplate()
        }
        if (this._autoSaveDataResolverTimeout) {
            this._autoSaveDataResolver()
        }
        return true
    }

    removeSubscriptions() {
        // remove all subscriptions
        Object.keys(this.registeredSubscriptions).forEach(key => {
            this.registeredSubscriptions[key].unsubscribe()
            delete this.registeredSubscriptions[key]
        })
    }


    setUpSubsciptions(props) {
        if (!props.cmsPage) return

        const {cmsPage: {subscriptions}, client, slug} = props
        if (!subscriptions) return

        // remove unsed subscriptions
        Object.keys(this.registeredSubscriptions).forEach(key => {
            if (subscriptions.indexOf(key) < 0) {
                this.registeredSubscriptions[key].unsubscribe()
                delete this.registeredSubscriptions[key]
            }
        })

        const _this = this

        // register new supscriptions
        subscriptions.forEach(subs => {
            if (!this.registeredSubscriptions[subs]) {

                let query = '', subscriptionName = '', isTypeSubscription = false
                if (subs.indexOf('{') === 0) {
                    const obj = JSON.parse(subs)
                    subscriptionName = Object.keys(obj)[0]
                    query = `${obj[subscriptionName]}`

                } else {
                    isTypeSubscription = true
                    const type = getType(subs)
                    subscriptionName = `subscribe${subs}`
                    if (type) {
                        query += 'action data{_id'
                        type.fields.map(({name, required, multi, reference, localized}) => {

                            if (reference) {
                                // todo: field name might be different than name
                                //query += ' ' + name + '{_id name}'
                            } else {
                                if (localized) {
                                    query += ' ' + name + '{' + _app_.lang + '}'
                                } else {
                                    query += ' ' + name
                                }
                            }
                        })
                        query += '}'
                    }
                }

                if (!query) return

                const qqlSubscribe = gql`subscription{${subscriptionName}{${query}}}`
                this.registeredSubscriptions[subs] = client.subscribe({
                    query: qqlSubscribe,
                    variables: {}
                }).subscribe({
                    next(supscriptionData) {

                        if (!isTypeSubscription) {
                            // this kind of subscription is handle by the JsonDom Script
                            _this._subscriptionCallback(supscriptionData)
                            return
                        }

                        if (!supscriptionData.data) {
                            //console.warn('subscription data missing')
                            return
                        }
                        const {data} = supscriptionData.data['subscribe' + subs]
                        if (data) {
                            const storeData = client.readQuery({
                                query: gqlQuery,
                                variables: _this.props.cmsPageVariables
                            })

                            // upadate data in resolvedData string
                            if (storeData.cmsPage && storeData.cmsPage.resolvedData) {

                                const resolvedDataJson = JSON.parse(storeData.cmsPage.resolvedData)
                                if (resolvedDataJson[subs] && resolvedDataJson[subs].results) {
                                    const refResults = resolvedDataJson[subs].results
                                    const idx = refResults.findIndex(o => o._id === data._id)
                                    if (idx > -1) {
                                        const noNullData = Util.removeNullValues(data)
                                        Object.keys(noNullData).map(k => {
                                            // check for localized values
                                            if (noNullData[k].constructor === Object && noNullData[k].__typename === 'LocalizedString') {
                                                const v = noNullData[k][_app_.lang]
                                                if (v) {
                                                    noNullData[k] = v
                                                }
                                            }
                                        })
                                        refResults[idx] = Object.assign({}, refResults[idx], noNullData)
                                        // back to string data
                                        const newStoreData = Object.assign({}, storeData)
                                        newStoreData.cmsPage = Object.assign({}, storeData.cmsPage)
                                        newStoreData.cmsPage.resolvedData = JSON.stringify(resolvedDataJson)
                                        client.writeQuery({
                                            query: gqlQuery,
                                            variables: _this.props.cmsPageVariables,
                                            data: newStoreData
                                        })
                                    }
                                }
                            }
                        }
                    },
                    error(err) {
                        console.error('err', err)
                    },
                })
            }
        })
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
        clearTimeout(this._scriptTimeout)
        this._scriptTimeout = setTimeout(() => {
            this.setState({script})
        }, 500)

        this._autoSaveScript = () => {
            clearTimeout(this._autoSaveScriptTimeout)
            this._autoSaveScriptTimeout = 0
            this.saveCmsPage(script, this.props.cmsPage, 'script')
        }

        clearTimeout(this._autoSaveScriptTimeout)
        this._autoSaveScriptTimeout = setTimeout(this._autoSaveScript, 5000)

    }

    handleDataResolverChange = (str, instantSave) => {
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
        if (str.constructor !== String) {
            str = JSON.stringify(str, null, 2)
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

    handleComponentEditClose(e) {
        const {_cmsActions, cmsComponentEdit} = this.props
        this.saveCmsPage(this.state.template, this.props.cmsPage, 'template')
        _cmsActions.editCmsComponent(null, cmsComponentEdit.component, cmsComponentEdit.scope)
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
        this.setKeyValue('CmsViewContainerSettings', this.state.settings, false, true)
    }

    clientQuery(query, options) {
        const {client} = this.props
        if (!query || query.constructor !== String) return

        const {success, error, ...rest} = options

        if (query.startsWith('mutation')) {
            client.mutate({
                mutation: gql(query),
                ...rest
            }).then(success).catch(error)
        } else {
            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gql(query),
                ...rest
            }).then(success).catch(error)
        }
    }

    updateResolvedData(json) {

        const {client, cmsPageVariables} = this.props

        const storeData = client.readQuery({
            query: gqlQuery,
            variables: cmsPageVariables
        })

        // upadate data in resolvedData string
        if (storeData.cmsPage && storeData.cmsPage.resolvedData) {

            storeData.cmsPage.resolvedData = JSON.stringify(json)
            client.writeQuery({
                query: gqlQuery,
                variables: cmsPageVariables,
                data: storeData
            })
        }
    }


    setKeyValue(arg1, arg2, arg3, arg4) {
        let key, value, server, internal
        if (arg1.constructor === String) {
            key = arg1
            value = arg2
            server = arg3
            internal = arg4
        } else if (arg1.constructor === Object) {
            key = arg1.key
            value = arg1.value
            server = arg1.server
            internal = arg1.internal
        }


        if (!key || !value) {
            return
        }
        const {client, user, cmsPage} = this.props
        const resolvedDataJson = JSON.parse(cmsPage.resolvedData)
        const kvk = resolvedDataJson._meta && resolvedDataJson._meta.keyValueKey
        if (kvk) {
            if (!resolvedDataJson[kvk]) {
                resolvedDataJson[kvk] = {}
            }
            resolvedDataJson[kvk][key] = value
        }

        if (value.constructor === Object) {
            value = JSON.stringify(value)
        }
        const variables = {
            key,
            value
        }

        if (user.isAuthenticated) {
            client.mutate({
                mutation: gql`mutation setKeyValue($key:String!,$value:String){setKeyValue(key:$key,value:$value){key value status createdBy{_id username}}}`,
                variables,
                update: (store, {data: {setKeyValue}}) => {
                    if (internal) {

                        const storedData = store.readQuery({query: gqlQueryKeyValue})

                        let newData = {keyValue: null}
                        if (storedData.keyValue) {
                            newData.keyValue = Object.assign({}, storedData.keyValue, {value: setKeyValue.value})
                        } else {
                            newData.keyValue = setKeyValue
                        }

                        // Write our data back to the cache.
                        store.writeQuery({query: gqlQueryKeyValue, data: newData})

                    } else {
                        this.updateResolvedData(resolvedDataJson)
                    }
                },
            })
            // clear local key values as there is a user session now
            localStorage.removeItem(NO_SESSION_KEY_VALUES)
            localStorage.removeItem(NO_SESSION_KEY_VALUES_SERVER)
        } else {
            const localStorageKey = server ? NO_SESSION_KEY_VALUES_SERVER : NO_SESSION_KEY_VALUES
            // if there is no user session store key value temporary in the localStorage
            const kv = localStorage.getItem(localStorageKey)
            let json
            if (kv) {
                try {
                    json = JSON.parse(kv)
                } catch (e) {
                    json = {}
                }
            } else {
                json = {}
            }
            json[key] = value
            localStorage.setItem(localStorageKey, JSON.stringify(json))
            if (!internal) {
                this.updateResolvedData(resolvedDataJson)
            }
        }

    }
}


CmsViewContainer.propTypes = {
    className: PropTypes.string,
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    loading: PropTypes.bool,
    fetchMore: PropTypes.func,
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    cmsPages: PropTypes.object,
    cmsComponentEdit: PropTypes.object,
    keyValue: PropTypes.object,
    updateCmsPage: PropTypes.func.isRequired,
    slug: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired,
    /* with Router */
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    /* Reference to the parent JsonDom */
    _parentRef: PropTypes.object,
    _key: PropTypes.string,
    /* Object is passed to JsonDom */
    _props: PropTypes.object,
    id: PropTypes.string,
    /* if dynamic is set to true that means it is a child of another CmsViewContainer */
    dynamic: PropTypes.bool,
    /* if true data gets refetched with query on url change*/
    urlSensitiv: PropTypes.bool,
    /* actions */
    _cmsActions: PropTypes.object.isRequired,
}


const urlSensitivMap = {}
const CmsViewContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const {slug, urlSensitiv, user} = ownProps,
                variables = {
                    ...getSlugVersion(slug)
                }

            // add settings from local storage if user is not logged in
            if (!user.isAuthenticated) {
                const kv = localStorage.getItem(NO_SESSION_KEY_VALUES_SERVER)
                if (kv) {
                    variables.nosession = kv
                }
            }

            // add query if page is url sensitiv
            if (urlSensitiv || (urlSensitiv === undefined && (urlSensitivMap[slug] || urlSensitivMap[slug] === undefined))) {
                const q = window.location.search.substring(1)
                if (q)
                    variables.query = q
            }
            return {
                variables,
                fetchPolicy: isEditMode(ownProps) ? 'network-only' : 'cache-and-network'
            }
        },
        props: ({data: {loading, cmsPage, variables, fetchMore}}) => {

            const result = {
                cmsPageVariables: variables,
                loading,
                fetchMore,
                cmsPage,
                renewing: false
            }

            if (cmsPage) {

                // renewing is another state
                // the difference to load is that it is only set to true if it has been loading once before
                if (variables.slug !== cmsPage.slug) {
                    result.renewing = true
                } else {
                    // check if query changed
                    let query = cmsPage.cacheKey.split('#')[0]
                    if( !query ) query = undefined
                    if( query !== variables.query){
                        result.renewing = true
                    }
                }
                urlSensitivMap[cmsPage.slug] = cmsPage.urlSensitiv
            }
            return result
        }
    }),
    graphql(gql`query cmsPages($filter:String,$_version:String){cmsPages(filter:$filter,_version:$_version){results{slug}}}`, {
        skip: props => props.dynamic || !isEditMode(props),
        options(ownProps) {
            const {slug, _version} = getSlugVersion(ownProps.slug),
                variables = {
                    _version,
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
                fetchPolicy: 'network-only'
            }
        },
        props: ({data: {keyValue}}) => {
            return {
                keyValue
            }
        }
    }),
    graphql(gql`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$script:String,$resources:String,$dataResolver:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:Boolean){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,script:$script,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv){slug template script resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, ...rest}, key, cb) => {
                const {_version, slug} = getSlugVersion(ownProps.slug)

                const variables = {_id, [key]: rest[key], slug}

                if (_version) {
                    variables._version = _version
                }
                return mutate({
                    variables,
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
                        const {slug, urlSensitiv} = ownProps,
                            variables = {
                                ...getSlugVersion(slug)
                            }
                        if (urlSensitiv) {
                            const q = window.location.search.substring(1)
                            if (q)
                                variables.query = q
                        }
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
)(CmsViewContainer)


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    return {
        cmsComponentEdit: store.cms.edit,
        user: store.user
    }
}


/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    _cmsActions: bindActionCreators(CmsActions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withApollo(withRouter(CmsViewContainerWithGql)))

