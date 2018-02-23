import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import JsonDom from 'client/components/JsonDom'
import {Typography, DrawerLayout, Button, MenuList, MenuListItem, Divider, Col, Row, SimpleSwitch} from 'ui/admin'
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import DataResolverEditor from 'client/components/cms/DataResolverEditor'
import TemplateEditor from 'client/components/cms/TemplateEditor'
import ScriptEditor from 'client/components/cms/ScriptEditor'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import Util from 'client/util'
import {getType} from 'util/types'

// the graphql query is also need to access and update the cache when data arrive from a supscription
const gqlQuery = gql`query cmsPage($slug: String!,$query:String){ cmsPage(slug: $slug,query: $query){slug template script dataResolver ssr resolvedData html subscriptions _id modifiedAt createdBy{_id username}}}`


const editorStyle = {
    backgroundColor: '#fff',
    border: '#cfcfcf solid 1px',
    padding: '10px',
    minHeight: 200,
    overflow: 'auto',
    whiteSpace: 'pre',
    fontFamily: 'monospace'
}

const isPreview = (location) => {
    const params = new URLSearchParams(location.search)
    return params.get('preview')
}

const isEditMode = (props) => {
    const {user, location, dynamic} = props
    return (user.isAuthenticated && !isPreview(location) && !dynamic)
}


class CmsViewContainer extends React.Component {
    oriTitle = document.title

    dataResolverSaveTimeout = 0
    registeredSubscriptions = {}


    constructor(props) {
        super(props)

        const {template, script, dataResolver, ssr} = props.cmsPage || {}

        this.state = {
            template: template,
            script: script,
            dataResolver: dataResolver,
            ssr: ssr
        }

        if (!props.dynamic)
            document.title = props.slug

        this.setUpSubsciptions(props)
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
                let query = '_id'

                type.fields.map(({name, required, multi, reference}) => {

                    if (reference) {
                        // todo: field name might be different than name
                        //query += ' ' + name + '{_id name}'
                    } else {
                        query += ' ' + name
                    }
                })

                const qqlSubscribe = gql`subscription{subscribe${subs}{action data{${query}}}}`

                this.registeredSubscriptions[subs] = client.subscribe({
                    query: qqlSubscribe,
                    variables: {},

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
                                        refResults[idx] = Object.assign({}, refResults[idx], Util.removeNullValues(data))
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
        this.setState({script})
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

    shouldComponentUpdate(props,state){
        // only update if cms page was modified
        return !this.props.cmsPage ||
            props.cmsPage.modifiedAt !== this.props.cmsPage.modifiedAt ||
            props.cmsPage.resolvedData !== this.props.cmsPage.resolvedData ||
            props.location.search!==this.props.location.search ||
            props.user!==this.props.user ||
            (isEditMode(props) && (state.template!==this.state.template || state.script!==this.state.script))
    }

    componentWillReceiveProps(props) {
        this.setUpSubsciptions(props)
        // in case props change and differ from inital props
        if (props.cmsPage) {
            const {template, script, dataResolver, ssr} = props.cmsPage
            this.setState({template, script, dataResolver, ssr})
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
        const {cmsPage, location,history, _parentRef, id, loading, className} = this.props

        let {template, script, dataResolver} = this.state
        if (!cmsPage) {
            if (!loading)
                console.warn('cmsPage missing')
            return null
        }

        const editMode = isEditMode(this.props)


        if (cmsPage.ssr && !editMode) {
            // it was already rendered on the server side
            return <span dangerouslySetInnerHTML={{__html: cmsPage.html}}/>
        }

        const scope = {page: {slug: cmsPage.slug},pathname: location.pathname, params: Util.extractQueryParams()}

        const startTime = new Date()

        const jsonDom = <JsonDom id={id}
                                 className={className}
                                 _parentRef={_parentRef}
                                 template={template}
                                 script={script}
                                 resolvedData={cmsPage.resolvedData}
                                 editMode={editMode}
                                 scope={JSON.stringify(scope)}
                                 history={history}
                                 onChange={this.handleTemplateSaveChange}/>
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

                    <Typography variant="headline">Settings</Typography>
                    <SimpleSwitch
                        label="SSR (Server side Rendering)"
                        checked={!!this.state.ssr}
                        onChange={this.handleSsrChange}
                    />
                </div>
            </div>


            content = <DrawerLayout sidebar={sidebar()}
                                    drawerSize="large"
                                    toolbarRight={
                                        <Button size="small" color="inherit" onClick={e => {
                                            this.props.history.push(config.ADMIN_BASE_URL + '/cms')
                                        }}>Back</Button>
                                    }
                                    drawerWidth="500px"
                                    title={'Edit Page "' + cmsPage.slug + '"'}>
                {jsonDom}
            </DrawerLayout>
        }

        console.info(`render ${this.constructor.name} for ${cmsPage.slug} in ${new Date() - startTime}ms`)

        return content
    }
}


CmsViewContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    loading: PropTypes.bool,
    cmsPage: PropTypes.object,
    user: PropTypes.object.isRequired,
    updateCmsPage: PropTypes.func.isRequired,
    slug: PropTypes.string,
    dynamic: PropTypes.bool,
    history: PropTypes.object.isRequired,
    location: PropTypes.object.isRequired,
    match: PropTypes.object.isRequired,
    /* Reference to the parent JsonDom */
    _parentRef: PropTypes.object,
    id: PropTypes.string
}

const CmsViewContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const slug = ownProps.slug
            return {
                variables: {
                    slug,
                    query: window.location.search.substring(1)
                },
                fetchPolicy: isEditMode(ownProps) ? 'network-only' : 'cache-and-network'
            }
        },
        props: ({data: {loading, cmsPage}}) => ({
            cmsPage,
            loading
        })
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
                        const slug = ownProps.slug

                        const data = store.readQuery({
                            query: gqlQuery,
                            variables: {slug, query: window.location.search.substring(1)}
                        })
                        if (data.cmsPage) {
                            // update cmsPage
                            data.cmsPage = {_id, [key]: updateCmsPage[key], ...rest, modifiedAt: updateCmsPage.modifiedAt}

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                data.cmsPage.resolvedData = updateCmsPage.resolvedData
                                data.cmsPage.subscriptions = updateCmsPage.subscriptions
                            }
                            store.writeQuery({query: gqlQuery, variables: {slug}, data})
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

