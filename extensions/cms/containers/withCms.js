import React from 'react'
import {graphql, withApollo} from '@apollo/react-hoc'
import {connect} from 'react-redux'
import {gql} from '@apollo/client'
import {
    getGqlVariables, gqlQuery, isEditMode, urlSensitivMap,
    settingKeyPrefix
} from '../util/cmsView'
import Async from 'client/components/Async'
import compose from '../../../util/compose'
import DomUtil from '../../../client/util/dom'
import {NO_SESSION_KEY_VALUES, NO_SESSION_KEY_VALUES_SERVER} from 'client/constants'
import {setPropertyByPath} from "../../../client/util/json";

// admin pack
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../../client/components/layout/ErrorPage')}/>


const CmsViewEditorContainer = (props) => <Async {...props}
                                                 load={import(/* webpackChunkName: "admin" */ './CmsViewEditorContainer')}/>

// enhance cmsview with editor functionalities if in edit mode
export default function (WrappedComponent) {

    class Wrapper extends React.Component {
        constructor(props) {
            super(props)
        }

        render() {
            const {slug, dynamic, cmsPage, loading, aboutToChange} = this.props
            if (!cmsPage) {
                if (!loading && !aboutToChange) {
                    console.warn(`cmsPage ${slug} missing`)
                    if (!dynamic) {

                        // add meta tag here instead of in the ErrorPage. It is faster, because for the ErrorPage we need to load extra bundles
                        DomUtil.createAndAddTag('meta', 'head', {
                            name: 'robots',
                            content: 'noindex,nofollow',
                            id: 'errorPageNoindex'
                        })

                        if (this.props.networkStatus === 8) {
                            console.log('Network status = 8')
                            setTimeout(() => {
                                window.location.href = window.location.href
                            }, 10000)
                            return <ErrorPage code="504" message="We are sorry. Please try again in a moment"
                                              title="Maintenance" background="#f4a742"/>
                        }
                        if (isEditMode(this.props)) {
                            return <CmsViewEditorContainer updateResolvedData={this.updateResolvedData.bind(this)}
                                                           setKeyValue={this.setKeyValue.bind(this)}
                                                           WrappedComponent={WrappedComponent} {...this.props}
                                                           cmsPage={{name: {}}}/>
                        } else {
                            return <ErrorPage/>
                        }
                    } else {
                        return <div>Cms page {slug} doesn't exist</div>
                    }
                }
            }

            if (!dynamic && isEditMode(this.props) && window.self === window.top) {
                return <CmsViewEditorContainer updateResolvedData={this.updateResolvedData.bind(this)}
                                               setKeyValue={this.setKeyValue.bind(this)}
                                               WrappedComponent={WrappedComponent} {...this.props}/>
            } else {
                return <WrappedComponent updateResolvedData={this.updateResolvedData.bind(this)}
                                         setKeyValue={this.setKeyValue.bind(this)}
                                         {...this.props}
                                         cmsPage={cmsPage}/>
            }
        }


        setKeyValue({key, value, server, internal, callback}) {

            const {client, user, cmsPage, slug} = this.props
            if (!key || !value || !cmsPage) {
                return
            }

            let resolvedDataJson
            if(!internal) {
                resolvedDataJson = JSON.parse(cmsPage.resolvedData)

                // Update data in resolved data
                const kvk = resolvedDataJson._meta && resolvedDataJson._meta.keyValueKey
                if (kvk) {
                    if (!resolvedDataJson[kvk]) {
                        resolvedDataJson[kvk] = {}
                    }
                    resolvedDataJson[kvk][key] = value
                }
            }

            const variables = {
                key,
                value: value.constructor === Object ? JSON.stringify(value) : value
            }

            if (user.isAuthenticated) {
                client.mutate({
                    mutation: gql`mutation setKeyValue($key:String!,$value:String){setKeyValue(key:$key,value:$value){key value status createdBy{_id username}}}`,
                    variables,
                    update: (store, {data: {setKeyValue}}) => {
                        if(callback){
                            callback(setKeyValue)
                        }
                        if(resolvedDataJson){
                            this.updateResolvedData({json:resolvedDataJson})
                        }else{

                            /*try {
                                const storedData = store.readQuery({
                                    query: gql`query keyValue($key:String!){keyValue(key:$key){key value createdBy{_id}}}`,
                                    variables: {key: settingKeyPrefix + slug}
                                })
                                console.log(storedData)

                                let newData = {keyValue: null}
                                if (storedData.keyValue) {
                                    newData.keyValue = Object.assign({}, storedData.keyValue, {value: setKeyValue.value})
                                } else {
                                    newData.keyValue = setKeyValue
                                }

                                // Write our data back to the cache.
                                store.writeQuery({
                                    query: gql`query keyValue($key:String!){keyValue(key:$key){key value createdBy{_id}}}`,
                                    variables: {key: settingKeyPrefix + slug},
                                    data: newData
                                })
                            }catch (e) {
                                console.log(e)

                            }*/
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
                if (resolvedDataJson) {
                    this.updateResolvedData({json:resolvedDataJson})
                }
            }

        }


        updateResolvedData({json, path, value}) {

            const {client, cmsPageVariables, cmsPage} = this.props

            const storeData = client.readQuery({
                query: gqlQuery(),
                variables: cmsPageVariables
            })

            // upadate data in resolvedData string
            if (storeData.cmsPage && storeData.cmsPage.resolvedData) {
                const newData = Object.assign({}, storeData.cmsPage)
                if(path && value){
                    const resolvedDataJson = JSON.parse(cmsPage.resolvedData)
                    setPropertyByPath(value, path, resolvedDataJson)
                    newData.resolvedData = JSON.stringify(resolvedDataJson)
                }else{
                    newData.resolvedData = JSON.stringify(json)
                }
                client.writeQuery({
                    query: gqlQuery(),
                    variables: cmsPageVariables,
                    data: {...storeData, cmsPage: newData}
                })

            }
        }
    }
    const withGql = compose(
        graphql(gqlQuery(), {
            skip: props => props.aboutToChange,
            options(ownProps) {
                return {
                    /*context: {fetchOptions: {method: ownProps.dynamic?'POST':'GET'}},*/
                    variables: getGqlVariables(ownProps),
                    nextFetchPolicy: 'cache-first',
                    fetchPolicy: ownProps.fetchPolicy || (isEditMode(ownProps) && !ownProps.dynamic ? 'network-only' : 'cache-and-network') // cache-first
                }
            },
            props: ({data: {loading, cmsPage, variables, fetchMore, networkStatus}, ownProps}) => {
                const result = {
                    cmsPageVariables: variables,
                    loading,
                    fetchMore,
                    cmsPage,
                    renewing: false,
                    aboutToChange: false,
                    networkStatus
                }

                if (cmsPage) {
                    if (variables.slug !== cmsPage.slug) {
                        // we define a new state here when component is reused with a new slug
                        result.aboutToChange = true
                    } else {
                        // check if query changed
                        let query = cmsPage.cacheKey.split('#')[0]
                        if (!query) query = undefined
                        if (query !== variables.query) {
                            // renewing is another state
                            // the difference to loading is that it is set to true if the page has already been loading before
                            result.renewing = true
                        }
                    }
                    urlSensitivMap[cmsPage.slug] = !!cmsPage.urlSensitiv

                    if (!loading && !cmsPage.urlSensitiv && variables.query) {
                        console.log('update cache')
                        // update cache to avoid second unneeded request
                        const data = ownProps.client.readQuery({
                            query: gqlQuery(),
                            variables
                        })
                        delete variables.query
                        ownProps.client.writeQuery({query: gqlQuery(), variables, data})
                    }

                }
                return result
            }
        })
    )(Wrapper)


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
    return connect(
        mapStateToProps
    )(withApollo(withGql))

}
