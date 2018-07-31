import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import JsonDom from 'client/components/JsonDom'
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import Util from 'client/util'
import {getType} from 'util/types'
import * as CmsActions from 'client/actions/CmsAction'
import {bindActionCreators} from 'redux'
import {NO_SESSION_KEY_VALUES, NO_SESSION_KEY_VALUES_SERVER} from './generic/withKeyValues'

import Async from 'client/components/Async'
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "misc" */ '../components/layout/ErrorPage')}/>

// admin pack
const Expandable = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "admin" */ '../components/cms/Expandable')}/>
const DataResolverEditor = (props) => <Async {...props}
                                             load={import(/* webpackChunkName: "admin" */ '../components/cms/DataResolverEditor')}/>
const TemplateEditor = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../components/cms/TemplateEditor')}/>
const ScriptEditor = (props) => <Async {...props}
                                       load={import(/* webpackChunkName: "admin" */ '../components/cms/ScriptEditor')}/>
const DrawerLayout = (props) => <Async {...props} expose="DrawerLayout"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const MenuList = (props) => <Async {...props} expose="MenuList"
                                   load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const Button = (props) => <Async {...props} expose="Button"
                                 load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const MenuListItem = (props) => <Async {...props} expose="MenuListItem"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const SimpleSwitch = (props) => <Async {...props} expose="SimpleSwitch"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const Divider = (props) => <Async {...props} expose="Divider"
                                  load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const ErrorHandler = (props) => <Async {...props}
                                       load={import(/* webpackChunkName: "admin" */ '../components/layout/ErrorHandler')}/>


// the graphql query is also need to access and update the cache when data arrive from a supscription
const gqlQuery = gql`query cmsPage($slug: String!,$query:String,$nosession: String){ cmsPage(slug: $slug,query: $query, nosession: $nosession){cacheKey slug urlSensitiv template script dataResolver ssr public online resolvedData html subscriptions _id modifiedAt createdBy{_id username}}}`


const editorStyle = {
    padding: '10px',
    minHeight: 200,
    overflow: 'auto',
    whiteSpace: 'pre',
    wordWrap: 'normal',
    fontFamily: 'monospace'
}

const isPreview = (location) => {
    const params = new URLSearchParams(location.search)
    return params.get('preview')
}

const isEditMode = (props) => {
    const {user, location, dynamic} = props

    return (user.isAuthenticated && Util.hasCapability(user, 'manage_cms_pages') && !isPreview(location) && !dynamic)
}


class CmsViewContainer extends React.Component {
    oriTitle = document.title

    dataResolverSaveTimeout = 0
    setScriptTimeout = 0
    registeredSubscriptions = {}


    constructor(props) {
        super(props)


        this.state = this.propsToState(props)

        if (!props.dynamic)
            document.title = props.slug

        this.setUpSubsciptions(props)
    }


    propsToState(props) {
        const {template, script, dataResolver, ssr} = props.cmsPage || {}
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
        return {
            settings,
            template,
            script,
            dataResolver,
            ssr,
            public: props.cmsPage && props.cmsPage.public
        }
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

                const type = getType(subs)
                if (!type) return
                let query = '_id'
                type.fields.map(({name, required, multi, reference, localized}) => {

                    if (reference) {
                        // todo: field name might be different than name
                        //query += ' ' + name + '{_id name}'
                    } else {
                        if (localized) {
                            query += ' ' + name + '_localized{' + _app_.lang + '}'
                        } else {
                            query += ' ' + name
                        }
                    }
                })
                const qqlSubscribe = gql`subscription{subscribe${subs}{action data{${query}}}}`

                this.registeredSubscriptions[subs] = client.subscribe({
                    query: qqlSubscribe,
                    variables: {}
                }).subscribe({
                    next(supscriptionData) {
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
                                            // if there are localized values in the current language
                                            // set them to the regular field
                                            if (k.endsWith('_localized')) {
                                                const v = noNullData[k][_app_.lang]
                                                if (v) {
                                                    noNullData[k.substring(0, k.length - 10)] = v
                                                }
                                            }
                                        })
                                        refResults[idx] = Object.assign({}, refResults[idx], noNullData)
                                        // back to string data
                                        storeData.cmsPage.resolvedData = JSON.stringify(resolvedDataJson)
                                        client.writeQuery({
                                            query: gqlQuery,
                                            variables: _this.props.cmsPageVariables,
                                            data: storeData
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
        if (value != data[key]) {
            console.log('save cms', key)

            const {updateCmsPage} = this.props

            updateCmsPage(
                Object.assign({}, data, {[key]: value}), key
            )
        }
    }

    handleFlagChange = (key, e, flag) => {
        this.setState({[key]: flag})
        this.saveCmsPage(flag, this.props.cmsPage, key)
    }


    handleClientScriptChange = (script) => {
        clearTimeout(this.setScriptTimeout)
        this.setScriptTimeout = setTimeout(() => {
            this.setState({script})
        }, 500)
    }

    handleDataResolverChange = (str) => {
        this.setState({dataResolver: str})
        clearTimeout(this.dataResolverSaveTimeout)
        this.dataResolverSaveTimeout = setTimeout(() => {
            // auto save after some time
            this.saveCmsPage(str, this.props.cmsPage, 'dataResolver')
        }, 2500)
    }

    handleTemplateChange = (str) => {
        this.setState({template: str, templateError: null})
    }


    handleTemplateSaveChange = (json, save) => {
        const template = JSON.stringify(json, null, 4)
        if (save) {
            this.saveCmsPage(template, this.props.cmsPage, 'template')
        } else {
            this.setState({template, templateError: null})
        }
    }

    shouldComponentUpdate(props, state) {
        // only update if cms page was modified
        return !props.cmsPage ||
            !this.props.cmsPage ||
            props.cmsComponentEdit !== this.props.cmsComponentEdit ||
            props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            props.location.search !== this.props.location.search ||
            props.location.hash !== this.props.location.hash ||
            props.user !== this.props.user ||
            props.cmsPages !== this.props.cmsPages ||
            props.children != this.props.children ||
            props._props !== this.props._props ||
            (isEditMode(props) && (state.template !== this.state.template || state.script !== this.state.script)) ||
            this.state.settings.fixedLayout !== state.settings.fixedLayout ||
            this.state.settings.inlineEditor !== state.settings.inlineEditor
    }

    UNSAFE_componentWillReceiveProps(props) {
        this.setUpSubsciptions(props)
        // in case props change and differ from inital props
        if (props.cmsPage) {
            this.setState(this.propsToState(props))
        }
    }

    componentDidMount() {
        window.addEventListener('beforeunload', (e) => {
            // blur on unload to make sure everything gets saved
            document.activeElement.blur()
        })
    }

    componentWillUnmount() {
        if (!this.props.dynamic)
            document.title = this.oriTitle

        // remove all subscriptions
        Object.keys(this.registeredSubscriptions).forEach(key => {
            this.registeredSubscriptions[key].unsubscribe()
            delete this.registeredSubscriptions[key]
        })
    }

    render() {
        const {cmsPage, cmsPages, cmsComponentEdit, location, history, _parentRef, _props, id, loading, className, children, user, dynamic, client} = this.props
        let {template, script, dataResolver, settings} = this.state
        if (!cmsPage) {
            if (!loading) {
                console.warn('cmsPage missing')
                return <ErrorPage />
            }
            return null
        }

        const editMode = isEditMode(this.props)

        if (cmsPage.ssr && !editMode) {
            // it was already rendered on the server side
            return <span dangerouslySetInnerHTML={{__html: cmsPage.html}}/>
        }
        const scope = {
            page: {slug: cmsPage.slug},
            user,
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
                                 _props={_props}
                                 template={template}
                                 script={script}
                                 resolvedData={cmsPage.resolvedData}
                                 editMode={editMode}
                                 inlineEditor={!!settings.inlineEditor}
                                 scope={JSON.stringify(scope)}
                                 history={history}
                                 setKeyValue={this.setKeyValue.bind(this)}
                                 onChange={this.handleTemplateSaveChange}>{children}</JsonDom>
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
                            style={editorStyle}
                            onChange={this.handleDataResolverChange}
                            onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'dataResolver')}>{dataResolver}</DataResolverEditor>
                    </Expandable>

                    <Expandable title="Template"
                                onChange={this.handleSettingChange.bind(this, 'templateExpanded')}
                                expanded={settings.templateExpanded}>
                        <TemplateEditor
                            style={editorStyle}
                            tab={settings.templateTab}
                            onTabChange={this.handleSettingChange.bind(this, 'templateTab')}
                            onChange={this.handleTemplateChange}
                            onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'template')}>{template}</TemplateEditor>
                    </Expandable>

                    <Expandable title="Script"
                                onChange={this.handleSettingChange.bind(this, 'scriptExpanded')}
                                expanded={settings.scriptExpanded}>
                        <ScriptEditor
                            style={editorStyle}
                            onChange={this.handleClientScriptChange}
                            onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'script')}>{script}</ScriptEditor>
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
                    </Expandable>

                    <Expandable title="Revisions"
                                onChange={this.handleSettingChange.bind(this, 'revisionsExpanded')}
                                expanded={settings.revisionsExpanded}>

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

            content = <DrawerLayout sidebar={sidebar()}
                                    fixedLayout={settings.fixedLayout}
                                    drawerSize="large"
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
                                    drawerWidth="500px"
                                    title={`Edit Page "${cmsPage.slug}" - ${cmsPage.online ? 'Online' : 'Offline'}`}>
                {jsonDom}
                <ErrorHandler />

                <SimpleDialog open={!!cmsComponentEdit.key} onClose={this.handleComponentEditClose.bind(this)}
                              actions={[{key: 'cancel', label: 'Cancel'}, {
                                  key: 'save',
                                  label: 'Save',
                                  type: 'primary'
                              }]}
                              title="Edit Component">

                    <TemplateEditor
                        style={editorStyle}
                        tab={settings.templateTab}
                        onTabChange={this.handleSettingChange.bind(this, 'templateTab')}
                        onChange={this.handleComponentEditChange.bind(this, cmsComponentEdit)}
                        onBlur={() => {
                        }}>{JSON.stringify(cmsComponentEdit.component, null, 4)}</TemplateEditor>


                </SimpleDialog>


            </DrawerLayout>
        }

        console.info(`render ${this.constructor.name} for ${cmsPage.slug} in ${new Date() - startTime}ms`)

        return content
    }

    handleComponentEditChange(cmsComponentEdit, str) {
        if (cmsComponentEdit.key) {
            const json = JSON.parse(this.state.template)
            let item = Util.getComponentByKey(cmsComponentEdit.key, json);

            if (item) {
                // empty object but keep reference
                for (const key in item) {
                    delete item[key]
                }
                // set property of new object to existing reference
                Object.assign(item, JSON.parse(str))

                this.handleTemplateSaveChange(json)
            }
        }
    }

    handleComponentEditClose(e) {
        const {_cmsActions, cmsComponentEdit} = this.props
        if (e.key === 'save') {
            this.saveCmsPage(this.state.template, this.props.cmsPage, 'template')
        }
        _cmsActions.editCmsComponent(null, cmsComponentEdit.component)
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
                query: gql(query),
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
        const kvk = resolvedDataJson._meta.keyValueKey
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
    children: PropTypes.any,
    cmsPageVariables: PropTypes.object,
    cmsPage: PropTypes.object,
    cmsPages: PropTypes.object,
    cmsComponentEdit: PropTypes.object,
    keyValue: PropTypes.object,
    updateCmsPage: PropTypes.func.isRequired,
    slug: PropTypes.string,
    user: PropTypes.object.isRequired,
    /* with Router */
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    /* Reference to the parent JsonDom */
    _parentRef: PropTypes.object,
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

const gqlQueryKeyValue = gql`query{keyValue(key:"CmsViewContainerSettings"){_id key value}}`
const urlSensitivMap = {}
const CmsViewContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const {slug, urlSensitiv, user} = ownProps,
                variables = {
                    slug
                }
            if (!user.isAuthenticated) {
                const kv = localStorage.getItem(NO_SESSION_KEY_VALUES_SERVER)
                if (kv) {
                    variables.nosession = kv
                }
            }


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
        props: ({data: {loading, cmsPage, variables}}) => {
            if (cmsPage)
                urlSensitivMap[cmsPage.slug] = cmsPage.urlSensitiv
            return {
                cmsPageVariables: variables,
                cmsPage,
                loading
            }
        }
    }),
    graphql(gql`query cmsPages($filter: String){cmsPages(filter:$filter){results{slug}}}`, {
        skip: props => props.dynamic || !isEditMode(props),
        options(ownProps) {
            const {slug} = ownProps,
                variables = {
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
    graphql(gql`mutation updateCmsPage($_id:ID!,$template:String,$slug:String,$script:String,$dataResolver:String,$ssr:Boolean,$public:Boolean){updateCmsPage(_id:$_id,template:$template,slug: $slug,script:$script,dataResolver:$dataResolver,ssr:$ssr,public:$public){slug template script dataResolver ssr public online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, ...rest}, key) => {
                return mutate({
                    variables: {_id, [key]: rest[key]},
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
                                slug
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
                                modifiedAt: updateCmsPage.modifiedAt
                            }

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                data.cmsPage.resolvedData = updateCmsPage.resolvedData
                                data.cmsPage.subscriptions = updateCmsPage.subscriptions
                            }
                            store.writeQuery({query: gqlQuery, variables, data})
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

