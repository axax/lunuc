import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import JsonDom from 'client/components/JsonDom'
import {Typography,DrawerLayout, Button, MenuList, MenuListItem, Divider, Col, Row, Switch} from 'ui/admin'
import update from 'immutability-helper'
import {withRouter} from 'react-router-dom'
import {ADMIN_BASE_URL} from 'gen/config'
import DataResolverEditor from 'client/components/cms/DataResolverEditor'
import TemplateEditor from 'client/components/cms/TemplateEditor'
import ScriptEditor from 'client/components/cms/ScriptEditor'

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
    const {user,location,dynamic} = props
    return (user.isAuthenticated && !isPreview(location) && !dynamic)
}


class CmsViewContainer extends React.Component {
    oriTitle = document.title

    dataResolverSaveTimeout = 0

    constructor(props) {
        super(props)

        const {template, script, dataResolver, ssr} = props.cmsPage || {}

        this.state = {
            template: template,
            script: script,
            dataResolver: dataResolver,
            ssr: ssr
        }
    }

    saveCmsPage = (value, data, key) => {
        if (value != data[key]) {
            console.log('save cms', key)

            const {updateCmsPage} = this.props
            updateCmsPage(
                update(data, {[key]: {$set: value}}), key
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

    componentWillReceiveProps(nextProps) {
        // in case props change and differ from inital props
        if (nextProps.cmsPage) {
            const {template, script, dataResolver, ssr} = nextProps.cmsPage
            this.setState({template, script, dataResolver, ssr})
        }
    }

    componentDidMount() {
        window.addEventListener('beforeunload', (e) => {
            // blur on unload to make sure everything gets saved
            document.activeElement.blur()
        })
    }

    componentWillUpdate(props) {
        document.title = props.slug
    }

    componentWillUnmount() {
        document.title = this.oriTitle
    }

    render() {
        const {cmsPage, location, loading} = this.props

        let {template, script, dataResolver} = this.state
        if (!cmsPage) {
            console.warn('cmsPage missing')
            return null
        }

        const editMode = isEditMode(this.props)


        if (cmsPage.ssr && !editMode) {
            // it was already rendered on the server side
            return <span dangerouslySetInnerHTML={{__html: cmsPage.html}}/>
        }
        console.log('render cms', loading)

        const scope = {page: {slug: cmsPage.slug}}


        const jsonDom = <JsonDom template={template}
                                 script={script}
                                 resolvedData={cmsPage.resolvedData}
                                 editMode={editMode}
                                 scope={JSON.stringify(scope)}
                                 onChange={this.handleTemplateSaveChange}/>

        if (!editMode) {
            return jsonDom
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

                    <Typography type="headline">Settings</Typography>
                    <Switch
                        label="SSR (Server side Rendering)"
                        checked={!!this.state.ssr}
                        onChange={this.handleSsrChange}
                    />
                </div>
            </div>


            return <DrawerLayout sidebar={sidebar()}
                                 drawerSize="large"
                                 toolbarRight={
                                     <Button color="contrast" onClick={e => {
                                         this.props.history.push(ADMIN_BASE_URL + '/cms')
                                     }}>Back</Button>
                                 }
                                 drawerWidth="500px"
                                 title={'Edit Page "' + cmsPage.slug + '"'}>
                {jsonDom}
            </DrawerLayout>
        }
    }
}


CmsViewContainer.propTypes = {
    loading: PropTypes.bool,
    cmsPage: PropTypes.object,
    user: PropTypes.object,
    updateCmsPage: PropTypes.func.isRequired,
    slug: PropTypes.string,
    dynamic: PropTypes.bool,
    history: PropTypes.object,
    location: PropTypes.object
}

const gqlQuery = gql`query cmsPage($slug: String!){ cmsPage(slug: $slug){slug template script dataResolver ssr resolvedData html _id createdBy{_id username}}}`
const CmsViewContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const slug = ownProps.slug
            return {
                variables: {
                    slug
                },
                fetchPolicy: isEditMode(ownProps)?'network-only':'cache-and-network'
            }
        },
        props: ({data: {loading, cmsPage}}) => ({
            cmsPage,
            loading
        })
    }),
    graphql(gql`mutation updateCmsPage($_id: ID!,$template: String,$slug: String,$script: String,$dataResolver: String,$ssr: Boolean){updateCmsPage(_id:$_id,template:$template,slug: $slug,script:$script,dataResolver:$dataResolver,ssr:$ssr){slug template script dataResolver ssr resolvedData html _id createdBy{_id username} status}}`, {
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

                        const data = store.readQuery({query: gqlQuery, variables: {slug}})
                        if (data.cmsPage) {
                            // update cmsPage
                            data.cmsPage = {_id, [key]: updateCmsPage[key], ...rest}

                            // update resolvedData
                            if (updateCmsPage.resolvedData) {
                                data.cmsPage.resolvedData = updateCmsPage.resolvedData
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
    const {user} = store
    return {
        user
    }
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(withRouter(CmsViewContainerWithGql))

