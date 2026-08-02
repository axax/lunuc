import React from 'react'
import {
    getGqlVariables, getCmsPageQuery, isEditMode, urlSensitivMap,
} from '../util/cmsView.mjs'
import Async from 'client/components/Async'
import compose from '../../../util/compose'
import DomUtil from '../../../client/util/dom.mjs'
import {setPropertyByPath} from '../../../client/util/json.mjs'
import {client, graphql} from '../../../client/middleware/graphql'
import {
    QUERY_KEY_VALUES,
    QUERY_SET_KEY_VALUE,
    QUERY_SET_KEY_VALUE_GLOBAL,
    setKeyValueToLS,
    getKeyValueFromLS
} from '../../../client/util/keyvalue'
import {NO_SESSION_KEY_VALUES} from '../../../client/constants/index.mjs'
import {_t, registerTrs} from '../../../util/i18n.mjs'


// admin pack
const ErrorPage = (props) => <Async {...props}
                                    load={() =>import(/* webpackChunkName: "errorPage" */ '../../../client/components/layout/ErrorPage')}/>


const CmsViewEditorContainer = (props) => <Async {...props}
                                                 load={() =>import(/* webpackChunkName: "admin" */ './CmsViewEditorContainer')}/>

// enhance cmsview with editor functionalities if in edit mode
export default function (WrappedComponent) {

    class Wrapper extends React.Component {
        constructor(props) {
            super(props)

            registerTrs({
                de: {
                    'ErrorPage.title.504': 'Wartungsarbeiten',
                    'ErrorPage.message.504': 'Bitte haben Sie einen kurzen Moment Geduld. Wir sind gleich zurück.'
                },
                en: {
                    'ErrorPage.title.504': 'Maintenance',
                    'ErrorPage.message.504': 'We are sorry. Please try again in a moment'
                }
            }, 'ErrorPage')

            if (props.cmsData) {
                this._localCmsPage = normalizeCmsData(props.cmsData)
            }
        }

        componentDidUpdate(prevProps) {
            // take over a new json that was passed in from outside
            if (this.props.cmsData && this.props.cmsData !== prevProps.cmsData) {
                this._localCmsPage = normalizeCmsData(this.props.cmsData)
                this.forceUpdate()
            }
        }

        /**
         * local mode: the cmsPage is passed in as json with the cmsData prop and every change
         * is returned as json instead of being written through graphql
         */
        get isLocal() {
            return !!this.props.cmsData
        }

        getCmsPage() {
            return this.isLocal ? this._localCmsPage : this.props.cmsPage
        }

        /**
         * reads the current cmsPage. Used by the components that live outside of this wrapper
         * @returns {Object|null} the store data containing the cmsPage
         */
        readCmsPage = () => {
            if (this.isLocal) {
                return {cmsPage: this._localCmsPage}
            }
            try {
                return client.readQuery({
                    query: getCmsPageQuery(this.props),
                    variables: this.props.cmsPageVariables
                })
            } catch (e) {
                console.warn('cmsPage not in store', e)
                return null
            }
        }

        /**
         * writes the cmsPage back. In local mode nothing is persisted, the json is returned instead
         * @param {Object} storeData the store data containing the cmsPage
         */
        writeCmsPage = (storeData) => {
            if (this.isLocal) {
                // keep it in a field instead of the state, so two writes in the same tick
                // do not read a stale value
                this._localCmsPage = storeData.cmsPage
                this.forceUpdate()
                if (this.props.onCmsDataChange) {
                    this.props.onCmsDataChange(this._localCmsPage)
                }
                return
            }
            client.writeQuery({
                query: getCmsPageQuery(this.props),
                variables: this.props.cmsPageVariables,
                data: storeData
            })
        }

        render() {
            const {cmsData, onCmsDataChange, ...props} = this.props
            const {slug, dynamic, loading} = props
            const cmsPage = this.getCmsPage()

            const cmsProps = {
                cmsLocal: this.isLocal,
                readCmsPage: this.readCmsPage,
                writeCmsPage: this.writeCmsPage,
                updateResolvedData: this.updateResolvedData.bind(this),
                setKeyValue: this.setKeyValue.bind(this),
                getKeyValue: this.getKeyValue.bind(this)
            }

            if (!cmsPage) {
                if (!loading) {
                    console.warn(`cmsPage ${slug} missing`)
                    if (!dynamic) {

                        // add meta tag here instead of in the ErrorPage. It is faster, because for the ErrorPage we need to load extra bundles
                        DomUtil.noIndexNoFollow()

                        if (props.networkStatus === 8) {
                            console.log('Network status = 8')
                            setTimeout(() => {
                                window.location.href = window.location.href
                            }, 10000)
                            return <ErrorPage code="504" message={_t('ErrorPage.message.504')}
                                              hideBackButton={true}
                                              title={_t('ErrorPage.title.504')} background="#f4a742"/>
                        }
                        if (isEditMode(this.props)) {
                            return <CmsViewEditorContainer WrappedComponent={WrappedComponent}
                                                           {...props}
                                                           {...cmsProps}
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
                return <CmsViewEditorContainer WrappedComponent={WrappedComponent}
                                               {...props}
                                               {...cmsProps}
                                               cmsPage={cmsPage}/>
            } else {
                return <WrappedComponent {...props}
                                         {...cmsProps}
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

            // in local mode there is no server roundtrip
            if(local || this.isLocal){
                return getKeyValueFromLS(key)
            }

            client.query({
                query: QUERY_KEY_VALUES,
                variables: {keys: key.constructor!==Array?[key]:key}
            }).then(callback).catch(callback)
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

            const cmsPage = this.getCmsPage()

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

            // local mode: nothing is persisted, the value only lives in the returned json
            if (this.isLocal) {
                if (resolvedDataJson) {
                    this.updateResolvedData({json: resolvedDataJson})
                }
                if (callback) {
                    callback({key, value})
                }
                return
            }

            const variables = {
                key,
                value: value && value.constructor !== String ? JSON.stringify(value) : value
            }

            if (global || _app_.user.isAuthenticated) {
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
            const cmsPage = this.getCmsPage()
            const storeData = this.readCmsPage()

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

                this.writeCmsPage({...storeData, cmsPage: newData})
            }
        }
    }

    const withGql = compose(
        graphql(getCmsPageQuery, {
            skip: (props, prevData, prevLang) => {
                if (props.cmsData) {
                    // local mode, there is nothing to load
                    return true
                }
                if (prevData &&
                    _app_.lang===prevLang &&
                    prevData.cmsPage &&
                    prevData.cmsPage.slug === props.slug &&
                    ['full',true].indexOf(prevData.cmsPage.urlSensitiv)<0 &&
                    !props.isRefetch) {
                    return true
                }
                return false
            },
            options(ownProps) {
                let hiddenVariables
                if (!ownProps.dynamic) {
                    const urlStack = ownProps.history && ownProps.history._urlStack
                    hiddenVariables = {
                        meta: JSON.stringify({isRefetch: ownProps.isRefetch, referer: urlStack && urlStack.length > 1 ? urlStack[1] : document.referrer})
                    }
                }
                return {
                    variables: getGqlVariables(ownProps),
                    hiddenVariables,
                    fetchPolicy: ownProps.fetchPolicy ||
                        (isEditMode(ownProps) ? 'network-only' :
                            (_app_.defaultFetchPolicy && _app_.defaultFetchPolicy[ownProps.slug]?_app_.defaultFetchPolicy[ownProps.slug]:
                                (['full','client',true,undefined].indexOf(urlSensitivMap[ownProps.slug])>=0?'cache-and-network':'cache-first'))) // cache-first
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
                    urlSensitivMap[cmsPage.slug] = cmsPage.urlSensitiv
                }
                return result
            }
        })
    )(Wrapper)

    return withGql

}


/**
 * resolvedData is expected to be a json string everywhere downstream
 * @param {Object} cmsPage
 */
function normalizeCmsData(cmsPage) {
    if (cmsPage && cmsPage.resolvedData && cmsPage.resolvedData.constructor !== String) {
        return {...cmsPage, resolvedData: JSON.stringify(cmsPage.resolvedData)}
    }
    return cmsPage
}