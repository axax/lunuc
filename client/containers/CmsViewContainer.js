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
const Divider = (props) => <Async {...props} expose="Divider"
                                  load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>


// the graphql query is also need to access and update the cache when data arrive from a supscription
const gqlQuery = gql`query cmsPage($slug: String!,$query:String){ cmsPage(slug: $slug,query: $query){cacheKey slug urlSensitiv template script dataResolver ssr resolvedData html subscriptions _id modifiedAt createdBy{_id username}}}`


const editorStyle = {
    backgroundColor: '#fff',
    border: '#cfcfcf solid 1px',
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
        if( props.keyValue ) {
            // TODO optimize so JSON.parse is only called once
            try {
                settings = JSON.parse(props.keyValue.value)
            } catch (e) {
                settings = {}
            }
        }else{
            settings = {}
        }

        return {
            settings,
            template,
            script,
            dataResolver,
            ssr
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
                                variables: {slug, query: window.location.search.substring(1)}
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
                                            variables: {slug},
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

    handleSsrChange = (e, ssr) => {
        this.setState({ssr})
        this.saveCmsPage(ssr, this.props.cmsPage, 'ssr')
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
            props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            props.location.search !== this.props.location.search ||
            props.location.hash !== this.props.location.hash ||
            props.user !== this.props.user ||
            props.cmsPages !== this.props.cmsPages ||
            props.children != this.props.children ||
            (isEditMode(props) && (state.template !== this.state.template || state.script !== this.state.script)) ||
            this.state.settings.fixedLayout !== state.settings.fixedLayout
    }

    componentWillReceiveProps(props) {
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
        const {cmsPage, cmsPages, location, history, _parentRef, id, loading, className, children, user, dynamic} = this.props
        let {template, script, dataResolver} = this.state
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
                                 children={children}
                                 className={className}
                                 _parentRef={_parentRef}
                                 template={template}
                                 script={script}
                                 resolvedData={cmsPage.resolvedData}
                                 editMode={editMode}
                                 scope={JSON.stringify(scope)}
                                 history={history}
                                 setKeyValue={this.setKeyValue.bind(this)}
                                 onChange={this.handleTemplateSaveChange}/>
        let content
        if (!editMode) {
            content = jsonDom
        } else {
            const {settings} = this.state
            const sidebar = () => <div>
                <MenuList>
                    <MenuListItem onClick={e => {
                        const win = window.open(location.pathname + '?preview=true', '_blank')
                        win.focus()
                    }} button primary="Preview"/>
                </MenuList>
                <Divider />

                <div style={{padding: '10px'}}>

                    <DataResolverEditor
                        style={editorStyle}
                        onChange={this.handleDataResolverChange}
                        onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'dataResolver')}>{dataResolver}</DataResolverEditor>

                    <TemplateEditor
                        style={editorStyle}
                        onChange={this.handleTemplateChange}
                        onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'template')}>{template}</TemplateEditor>

                    <ScriptEditor
                        style={editorStyle}
                        onChange={this.handleClientScriptChange}
                        onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'script')}>{script}</ScriptEditor>

                    <Expandable title="Settings">
                        <SimpleSwitch
                            label="SSR (Server side Rendering)"
                            checked={!!this.state.ssr}
                            onChange={this.handleSsrChange}
                        />
                    </Expandable>


                    {cmsPages && cmsPages.results && cmsPages.results.length > 1 &&

                    <Expandable title="Related pages">
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
                                        <SimpleSwitch key="switch" color="default"
                                                      checked={settings.fixedLayout}
                                                      onChange={this.handleChangeFixed.bind(this)} contrast
                                                      label="Fixed"/>,

                                        <Button key="button" size="small" color="inherit" onClick={e => {
                                            this.props.history.push(config.ADMIN_BASE_URL + '/cms')
                                        }}>Back</Button>
                                    ]
                                    }
                                    drawerWidth="500px"
                                    title={'Edit Page "' + cmsPage.slug + '"'}>
                {jsonDom}
            </DrawerLayout>
        }

        console.info(`render ${this.constructor.name} for ${cmsPage.slug} in ${new Date() - startTime}ms`)

        return content
    }

    handleChangeFixed(e) {
       this.setState({settings: Object.assign({}, this.state.settings, {fixedLayout: e.target.checked})},this.saveSettings)
    }

    saveSettings(){
        this.setKeyValue('CmsViewContainerSettings',this.state.settings)
    }

    setKeyValue(arg1, arg2) {
        let key, value
        if (arg1.constructor === String) {
            key = arg1
            value = arg2
        } else if (arg1.constructor === Object) {
            key = arg1.key
            value = arg1.value
        }


        if (!key || !value) {
            return
        }

        if (value.constructor === Object) {
            value = JSON.stringify(value)
        }

        const {client, user} = this.props
        const variables = {
            key,
            value
        }

        if (user.isAuthenticated) {
            const gqlQuery = gql`mutation setKeyValue($key:String!,$value:String){setKeyValue(key:$key,value:$value){key value status createdBy{_id username}}}`
            client.mutate({
                mutation: gqlQuery,
                variables,
                update: (store, {data}) => {
                },
            })
            localStorage.removeItem('NoUserKeyValues')
        } else {
            const kv = localStorage.getItem('NoUserKeyValues')
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
            localStorage.setItem('NoUserKeyValues', JSON.stringify(json))
        }

    }
}


CmsViewContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    loading: PropTypes.bool,
    cmsPage: PropTypes.object,
    cmsPages: PropTypes.object,
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
    id: PropTypes.string,
    /* if dynamic is set to true that means it is a child of another CmsViewContainer */
    dynamic: PropTypes.bool,
    /* if true data gets refetched with query on url change*/
    urlSensitiv: PropTypes.bool
}

const gqlQueryRel = gql`query cmsPages($filter: String){cmsPages(filter:$filter){results{slug}}}`
const gqlQueryKeyValue = gql`query{keyValue(key:"CmsViewContainerSettings"){_id key value}}`

const urlSensitivMap = {}
const CmsViewContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const {slug, urlSensitiv} = ownProps,
                variables = {
                    slug
                }

            const kv = localStorage.getItem('NoUserKeyValues')

            console.log(kv)

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
        props: ({data: {loading, cmsPage}}) => {
            if (cmsPage)
                urlSensitivMap[cmsPage.slug] = cmsPage.urlSensitiv
            return {
                cmsPage,
                loading
            }
        }
    }),
    graphql(gqlQueryRel, {
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
    graphql(gql`mutation updateCmsPage($_id: ID!,$template: String,$slug: String,$script: String,$dataResolver: String,$ssr: Boolean){updateCmsPage(_id:$_id,template:$template,slug: $slug,script:$script,dataResolver:$dataResolver,ssr:$ssr){slug template script dataResolver ssr resolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`, {
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
        user: store.user
    }
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(withApollo(withRouter(CmsViewContainerWithGql)))

