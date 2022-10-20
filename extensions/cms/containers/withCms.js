import React from 'react'
import {
    getGqlVariables, CMS_PAGE_QUERY, isEditMode, urlSensitivMap,
    settingKeyPrefix
} from '../util/cmsView.mjs'
import Async from 'client/components/Async'
import compose from '../../../util/compose'
import DomUtil from '../../../client/util/dom.mjs'
import {setPropertyByPath} from '../../../client/util/json.mjs'
import {client, graphql} from '../../../client/middleware/graphql'
import {
    QUERY_KEY_VALUES_GLOBAL,
    QUERY_KEY_VALUES,
    QUERY_SET_KEY_VALUE,
    QUERY_SET_KEY_VALUE_GLOBAL,
    setKeyValueToLS,
    getKeyValueFromLS
} from '../../../client/util/keyvalue'
import {NO_SESSION_KEY_VALUES} from '../../../client/constants/index.mjs'

// admin pack
const ErrorPage = (props) => <Async {...props}
                                    load={import(/* webpackChunkName: "admin" */ '../../../client/components/layout/ErrorPage')}/>


const CmsViewEditorContainer = (props) => <Async {...props}
                                                 load={import(/* webpackChunkName: "admin" */ './CmsViewEditorContainer')}/>

/*const AdminComponents = (props) => <Async {...props} expose="AdminComponents"
                                          load={import( webpackChunkName: "admin" '../client-admin')}/>*/



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
                                                           WrappedComponent={WrappedComponent}
                                                           {...this.props}
                                                           cmsPage={{name: {}}}/>
                        } else {

                            if (_app_.redirect404 !== location.pathname) {
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
            if (isEditMode(this.props) && window.self === window.top) {
                return <CmsViewEditorContainer updateResolvedData={this.updateResolvedData.bind(this)}
                                               setKeyValue={this.setKeyValue.bind(this)}
                                               getKeyValue={this.getKeyValue.bind(this)}
                                               WrappedComponent={WrappedComponent}
                                               {...this.props}/>
            } else {
                return <WrappedComponent updateResolvedData={this.updateResolvedData.bind(this)}
                                         setKeyValue={this.setKeyValue.bind(this)}
                                         getKeyValue={this.getKeyValue.bind(this)}
                                         {...this.props}
                                         cmsPage={cmsPage}/>
            }
        }




        /**
         * get a user or gobal value by a key
         * @param {String} key
         * @param {Boolean} server if true the values are sent to the server on a request
         * @param {Boolean} global if true the value is stored as globally for all users
         * @param {Boolean} local only lookup in localStorage
         * @param {Function} callback a function that gets called at the end
         */
        getKeyValue({key, global, local, server, callback}){

            if (!key) {
                return
            }

            if(local){
                return getKeyValueFromLS(key)
            }

            /*if (global || this.props.user.isAuthenticated) {
                client.query({
                    query: global ? QUERY_KEY_VALUES_GLOBAL : QUERY_KEY_VALUES,
                    variables: {keys: key.constructor!==Array?[key]:key}
                }).then((res)=>{
                    let result
                    if(res.data ){
                        const data = global ? res.data.keyValueGlobals : res.data.keyValues
                        if(data){
                            if(key.constructor!==Array){
                                result = data.results[0]
                            }else{
                                result = data.results
                            }
                        }
                    }
                    callback(result)
                }).catch(callback)
            }else {
                callback(getKeyValueFromLS(key))
            }*/
        }


        /**
         * set a user or gobal value by a key
         * @param {String} key
         * @param {Any} value
         * @param {Boolean} server if true the values are sent to the server on a request
         * @param {Boolean} internal if true resolved data get updated automatically
         * @param {Boolean} global if true the value is stored as globally for all users
         * @param {Function} callback a function that gets called at the end
         *
         */
        setKeyValue({key, value, server, internal, global, callback}) {

            const {cmsPage} = this.props

            if (!key || value === undefined || !cmsPage) {
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
                value: value && value.constructor !== String ? JSON.stringify(value) : value
            }

            if (global || _app_.user) {
                client.mutate({
                    mutation: global ? QUERY_SET_KEY_VALUE_GLOBAL : QUERY_SET_KEY_VALUE,
                    variables,
                    update: (store, {data}) => {

                        if (!data) {
                            return
                        }

                        if (resolvedDataJson) {
                            this.updateResolvedData({json: resolvedDataJson})
                        }

                        if (callback) {
                            callback({key, value, setKeyValue: data.setKeyValue})
                        }

                    },
                })
                // clear local key values as there is a user session now
                if(!_app_.noStorage) {
                    localStorage.removeItem(NO_SESSION_KEY_VALUES)
                    localStorage.removeItem(NO_SESSION_KEY_VALUES+'_SERVER')
                }
            } else {
                setKeyValueToLS({key, value, server})

                if (resolvedDataJson) {
                    this.updateResolvedData({json: resolvedDataJson})
                }
                if (callback) {
                    callback({key, value})
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
            if (storeData && storeData.cmsPage && storeData.cmsPage.resolvedData) {
                const newData = Object.assign({}, storeData.cmsPage)
                if (path && value !== undefined) {
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
            skip: (props, prevData) => {
                if (prevData &&
                    prevData.cmsPage &&
                    prevData.cmsPage.slug === props.slug &&
                    (!prevData.cmsPage.urlSensitiv || prevData.cmsPage.urlSensitiv==='client') &&
                    !props.isRefetch) {
                    return true
                }
                return false
            },
            options(ownProps) {
                let hiddenVariables
                if (!ownProps.dynamic) {
                    const urlStack = ownProps.history._urlStack
                    hiddenVariables = {
                        meta: JSON.stringify({referer: urlStack && urlStack.length > 1 ? urlStack[1] : document.referrer})
                    }
                }
                return {
                    variables: getGqlVariables(ownProps),
                    hiddenVariables,
                    fetchPolicy: ownProps.fetchPolicy || (isEditMode(ownProps) ? 'network-only' : 'cache-and-network') // cache-first
                }
            },
            props: ({data: {loading, cmsPage, variables, fetchMore, refetch, networkStatus}, ownProps}) => {
                const result = {
                    cmsPageVariables: variables,
                    loading,
                    fetchMore,
                    refetch,
                    cmsPage,
                    networkStatus
                }
                if (cmsPage) {
                    if (variables.slug !== cmsPage.slug) {
                        // we define a new state here when component is reused with a new slug
                        result.aboutToChange = true
                    }
                    urlSensitivMap[cmsPage.slug] = cmsPage.urlSensitiv && cmsPage.urlSensitiv!=='client'
                }
                return result
            }
        })
    )(Wrapper)

    return withGql

}
