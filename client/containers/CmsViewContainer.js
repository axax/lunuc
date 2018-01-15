import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import JsonDom from '../components/JsonDom'
import ContentEditable from '../components/generic/ContentEditable'
import logger from '../../util/logger'
import {DrawerLayout, Button, MenuList, MenuListItem, Divider, Col, Row, Textarea} from 'ui'
import update from 'immutability-helper'
import {withRouter} from 'react-router-dom'


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


class CmsViewContainer extends React.Component {
    static logger = logger(CmsViewContainer.name)

    state = {
        template: null,
        templateError: null,
        script: null,
        dataResolver: null
    }



    componentDidMount() {
        window.addEventListener('beforeunload',  (e) => {
            // blur on unload to make sure everything gets saved
            document.activeElement.blur()
        })
    }




    saveCmsPage = (value, data, key) => {
        const t = value.trim()
        if (t != data[key]) {
            console.log('save cms', key)

            const {updateCmsPage} = this.props
            updateCmsPage(
                update(data, {[key]: {$set: t}}), key
            )
        }
    }

    handleClientScriptChange = (str) => {
        this.setState({script: str})
    }

    dataResolverSaveTimeout=0
    handleDataResolverChange = (str) => {
        this.setState({dataResolver: str})
        clearTimeout(this.dataResolverSaveTimeout)
        this.dataResolverSaveTimeout = setTimeout(()=>{
            // auto save after some time
            this.saveCmsPage(str, this.props.cmsPage, 'dataResolver')
        },1000)
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

    handleJsonError = (e) => {
        setTimeout(() => {
            this.setState({templateError: `${e.message}`})
        }, 1)
    }


    componentWillReceiveProps(nextProps) {
        if (nextProps.cmsPage) {
            const {template, script, dataResolver } = nextProps.cmsPage
            this.setState({template, script, dataResolver})
        }
    }


    render() {
        const {cmsPage, user, location} = this.props
        const {template, script, dataResolver, templateError} = this.state

        if (!cmsPage )
            return <BaseLayout />

        if( !user.isAuthenticated || isPreview(location) ){
            return <span dangerouslySetInnerHTML={{__html: cmsPage.html}} />
        }
console.log('render cms')

        let js, jsError, resolvedData, resolveDataError

        try {
            js = new Function(script)();
        } catch (e) {
            jsError = e.message
        }

        try {
            resolvedData = JSON.parse(cmsPage.resolvedData)
            if( resolvedData.error ){
                resolveDataError = resolvedData.error
            }
        }catch(e){
            resolveDataError = e.message
        }

        const sidebar = () => <div>
            <MenuList>
                <MenuListItem onClick={e => {
                    this.props.history.push('/cms')
                }} button primary="Back"/>
            </MenuList>
            <Divider />

            <div style={{padding: '10px'}}>
                <h3>Json data resolver</h3>

                <ContentEditable
                    style={editorStyle}
                    onChange={this.handleDataResolverChange}
                    onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'dataResolver')}>{dataResolver}</ContentEditable>
                {resolveDataError}

                <h3>Json template</h3>

                <ContentEditable
                    style={editorStyle}
                    onChange={this.handleTemplateChange}
                    onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'template')}>{template}</ContentEditable>

                {templateError}


                <h3>Script</h3>

                <ContentEditable
                    style={editorStyle}
                    onChange={this.handleClientScriptChange}
                    onBlur={v => this.saveCmsPage.bind(this)(v, cmsPage, 'script')}>{script}</ContentEditable>
                {jsError}

            </div>

        </div>


        const scope = {page: {slug: cmsPage.slug}, script: js, data: resolvedData}

        return <DrawerLayout sidebar={sidebar()}
                             drawerWidth="500px"
                             title={'Edit Page "' + cmsPage.slug + '"'}>
            <JsonDom template={template} scope={JSON.stringify(scope)} onChange={this.handleTemplateSaveChange}
                     onError={this.handleJsonError}/>
        </DrawerLayout>
    }
}


CmsViewContainer.propTypes = {
    users: PropTypes.array,
    match: PropTypes.object,
    loading: PropTypes.bool,
    cmsPage: PropTypes.object,
    user: PropTypes.object,
    updateCmsPage: PropTypes.func.isRequired
}

const gqlQuery = gql`query cmsPage($slug: String!, $render: Boolean){ cmsPage(slug: $slug, render: $render){slug template script dataResolver resolvedData html _id createdBy{_id username}}}`
const CmsViewContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const slug = (ownProps.match.params.slug)

            return {
                variables: {
                    slug,
                    render: !ownProps.user.isAuthenticated || isPreview(ownProps.location)
                },
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, cmsPage}}) => ({
            cmsPage,
            loading
        })
    }),
    graphql(gql`mutation updateCmsPage($_id: ID!,$template: String,$slug: String,$script: String,$dataResolver: String){updateCmsPage(_id:$_id,template:$template,slug: $slug,script:$script,dataResolver:$dataResolver){slug template script dataResolver resolvedData html _id createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id,...rest},key) => {
                return mutate({
                    variables: {_id, [key]:rest[key]},
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
                        // Read the data from the cache for this query.
                        const slug = (ownProps.match.params.slug),
                        render = (!ownProps.user.isAuthenticated || isPreview(ownProps.location))

                        const data = store.readQuery({query: gqlQuery, variables: {slug,render}})
                        if (data.cmsPage) {
                            // update cmsPage
                            data.cmsPage = {_id,[key]:updateCmsPage[key],...rest}

                            // update resolvedData
                            if( updateCmsPage.resolvedData ){
                                data.cmsPage.resolvedData=updateCmsPage.resolvedData
                            }

                            store.writeQuery({query: gqlQuery, variables: {slug,render}, data})
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

