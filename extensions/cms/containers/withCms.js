import React from 'react'
import {connect} from 'react-redux'
import {
    getGqlVariables, CMS_PAGE_QUERY, isEditMode, urlSensitivMap,
    settingKeyPrefix
} from '../util/cmsView'
import Async from 'client/components/Async'
import compose from '../../../util/compose'
import DomUtil from '../../../client/util/dom'
import {NO_SESSION_KEY_VALUES, NO_SESSION_KEY_VALUES_SERVER} from 'client/constants'
import {setPropertyByPath} from "../../../client/util/json";
import {client, graphql} from '../../../client/middleware/graphql'

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
            const {slug, dynamic, cmsPage, loading} = this.props
            if (!cmsPage) {
                if (!loading) {
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

                            if (_app_.redirect404 && _app_.redirect404 !== location.pathname) {
                                location.replace(_app_.redirect404)
                                return null
                            }

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

            const {user, cmsPage, slug} = this.props
            if (!key || !value || !cmsPage) {
                return
            }

            let resolvedDataJson
            if (!internal) {
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
                    mutation: 'mutation setKeyValue($key:String!,$value:String){setKeyValue(key:$key,value:$value){key value status createdBy{_id username}}}',
                    variables,
                    update: (store, {data: {setKeyValue}}) => {
                        if (callback) {
                            callback({key, value, setKeyValue})
                        }
                        if (resolvedDataJson) {
                            this.updateResolvedData({json: resolvedDataJson})
                        } else {

                            /*  try {
                                  const storedData = store.readQuery({
                                      query: QUERY_KEY_VALUES,
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
                    this.updateResolvedData({json: resolvedDataJson})
                }
            }

        }


        updateResolvedData({json, path, value}) {

            const {cmsPageVariables, cmsPage} = this.props

            const storeData = client.readQuery({
                query: CMS_PAGE_QUERY,
                variables: cmsPageVariables
            })

            // upadate data in resolvedData string
            if (storeData.cmsPage && storeData.cmsPage.resolvedData) {
                const newData = Object.assign({}, storeData.cmsPage)
                if (path && value) {
                    const resolvedDataJson = JSON.parse(cmsPage.resolvedData)
                    setPropertyByPath(value, path, resolvedDataJson)
                    newData.resolvedData = JSON.stringify(resolvedDataJson)
                } else {
                    newData.resolvedData = JSON.stringify(json)
                }

                client.writeQuery({
                    query: CMS_PAGE_QUERY,
                    variables: cmsPageVariables,
                    data: {...storeData, cmsPage: newData}
                })

            }
        }
    }

    const withGql = compose(
        graphql(CMS_PAGE_QUERY, {
            options(ownProps) {
                let hiddenVariables
                if (!ownProps.dynamic) {
                    const urlStacK = ownProps.history._urlStack
                    hiddenVariables = {
                        meta: JSON.stringify({referer: urlStacK && urlStacK.length>1?urlStacK[1]:document.referrer})
                    }
                }

                return {
                    variables: getGqlVariables(ownProps),
                    hiddenVariables,
                    fetchPolicy: ownProps.fetchPolicy || (isEditMode(ownProps) && !ownProps.dynamic ? 'network-only' : 'cache-and-network') // cache-first
                }
            },
            props: ({data: {loading, cmsPage, variables, fetchMore, networkStatus}, ownProps}) => {
                const result = {
                    cmsPageVariables: variables,
                    loading,
                    fetchMore,
                    cmsPage,
                    networkStatus
                }
                if (cmsPage) {
                    urlSensitivMap[cmsPage.slug] = !!cmsPage.urlSensitiv
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
    )(withGql)

}
