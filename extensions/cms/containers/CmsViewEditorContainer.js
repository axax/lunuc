import React from 'react'
import {isEditMode, getSlugVersion, getGqlVariables, settingKeyPrefix, gqlQueryKeyValue, gqlQuery} from '../util/cmsView'
import PropTypes from 'prop-types'
import {graphql} from 'react-apollo'
import compose from 'util/compose'
import gql from 'graphql-tag'



class CmsViewEditorContainer extends React.Component {

    constructor(props) {
        super(props)
    }


    render() {
        const {WrappedComponent, ...props} = this.props
        return <WrappedComponent {...props} />
    }

}


CmsViewEditorContainer.propTypes = {
    updateCmsPage: PropTypes.func.isRequired,
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
    graphql(gql`mutation updateCmsPage($_id:ID!,$_version:String,$template:String,$slug:String,$script:String,$serverScript:String,$resources:String,$dataResolver:String,$ssr:Boolean,$public:Boolean,$urlSensitiv:Boolean,$query:String,$props:String){updateCmsPage(_id:$_id,_version:$_version,template:$template,slug:$slug,script:$script,serverScript:$serverScript,resources:$resources,dataResolver:$dataResolver,ssr:$ssr,public:$public,urlSensitiv:$urlSensitiv,query:$query,props:$props){slug template script serverScript resources dataResolver ssr public urlSensitiv online resolvedData html subscriptions _id modifiedAt createdBy{_id username} status cacheKey}}`, {
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
 * Connect the component to
 * the Redux store.
 */
export default CmsViewEditorContainerWithGql

