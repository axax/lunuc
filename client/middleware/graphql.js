import React, {useState, useEffect} from 'react'
import Util from '../util/index.mjs'
import Hook from '../../util/hook.cjs'
import {deepMerge} from "../../util/deepMerge.mjs";


const NetworkStatus = {
    /*loading: 1,
    setVariables: 2,
    fetchMore: 3,
    refetch: 4,
    poll: 6,*/
    ready: 7,
    error: 8
}
const RequestType = {
    query: 1,
    mutate: 2
}

const CACHE_FIRST = 'cache-first'

let GRAPHQL_URL, GRAPHQL_WS_URL

export let SSR_FETCH_CHAIN = {}

export const getGraphQlUrl = () => {
    if (!GRAPHQL_URL) {
        if(_app_.graphqlOptions){
            GRAPHQL_URL = _app_.graphqlOptions.url
        }else {
            const location = window.location
            GRAPHQL_URL = `${location.protocol}//${location.hostname}:${location.port}/graphql`
        }
    }
    return GRAPHQL_URL
}

export const getGraphQlWsUrl = () => {
    if (!GRAPHQL_WS_URL) {
        if(_app_.graphqlOptions){
            GRAPHQL_WS_URL = _app_.graphqlOptions.wsUrl
        }else {
            const location = window.location
            GRAPHQL_WS_URL = (location.protocol === 'https:' ? 'wss' : 'ws') + `://${location.hostname}:${location.port}/lunucws`
        }
    }
    return GRAPHQL_WS_URL
}


export const setGraphQlOptions = ({url}) => {
    GRAPHQL_URL = url
}

// create a middleware for state handling and to attach the hook
let loadingCounter = 0

function addLoader() {
    loadingCounter++
    if (loadingCounter === 1 && _app_.dispatcher) {
       _app_.dispatcher.dispatch({type:'NETWORK_STATUS',payload:{loading:true}})
    }
}

function removeLoader() {
    loadingCounter--
    if (loadingCounter === 0 && _app_.dispatcher) {
        // send loading false when all request are done
        _app_.dispatcher.dispatch({type:'NETWORK_STATUS',payload:{loading:false}})
    }
}


/* Websocket */
let wsCurrentConnection, subscribeCount = 0, openWsSubscription = [], sharedKeyIdMap = {}


const isConnected = ws => ws && ws.readyState === 1

const createWsSubscription = (id, subId, payload, next) => {

    const withSameId = openWsSubscription.find(f => f.id === id)

    if (withSameId) {
        withSameId.nexts[subId] = next
    } else {
        openWsSubscription.push({
            id,
            payload,
            nexts: {[subId]: next}
        })

        if (isConnected(wsCurrentConnection)) {
            wsCurrentConnection.send(JSON.stringify({type: 'start', clientId: _app_.clientId, id, payload}))
        }
    }

}

const removeWsSubscription = (id, subId) => {

    for (let i = 0; i < openWsSubscription.length; i++) {
        if (openWsSubscription[i].id === id) {
            const data = openWsSubscription[i]

            delete data.nexts[subId]

            if (Object.keys(data.nexts).length > 0) {
                return false
            }
            // remove from array by id
            openWsSubscription.splice(i, 1)
            break
        }
    }

    if (isConnected(wsCurrentConnection)) {
        wsCurrentConnection.send(`{"type":"stop","id":${id}}`)
    } else {
        console.log('ws connection not ready')
    }

    return true
}

let setUpWsWasCalled = false
const setUpWs = () => {
    if (!setUpWsWasCalled && !_app_.ssr && !window._disableWsConnection) {
        setUpWsWasCalled = true
        try {
            wsCurrentConnection = new WebSocket(getGraphQlWsUrl(), ['graphql-ws'])

            wsCurrentConnection.onopen = () => {
                wsCurrentConnection.send('{"type":"connection_init","payload":{}}')

                for (let i = 0; i < openWsSubscription.length; i++) {
                    const sub = openWsSubscription[i]
                    wsCurrentConnection.send(JSON.stringify({type: 'start', id: sub.id, clientId: _app_.clientId, payload: sub.payload}))
                }

                return false
            }
            wsCurrentConnection.onerror = error => {
                console.log(`WebSocket error: ${error}`)
            }

            wsCurrentConnection.onclose = () => {
                console.log(`WebSocket closed.  Try to reconnect in 5 seconds`)
                setUpWsWasCalled = false
                setTimeout(setUpWs, 5000)
            }

            wsCurrentConnection.addEventListener('message', (e) => {
                const msg = JSON.parse(e.data)
                if (msg.payload) {
                    Hook.call('ApiClientWsResponse', {payload: msg.payload})

                    for (let i = 0; i < openWsSubscription.length; i++) {
                        const sub = openWsSubscription[i]
                        const subIds = Object.keys(sub.nexts)
                        subIds.forEach(subId => {
                            sub.nexts[subId](msg.payload)
                        })

                    }
                }
            }, false)


        } catch (e) {
            // without ws
            console.warn('WS might not work', e)
        }

    }
}
const setUpWsIfNeeded = (data) => {
    if (data && data.cmsPage && data.cmsPage.subscriptions) {
        // only setup subscription if needed
        setUpWs()
    }
}
const getHeaders = (lang, headersExtra={}) => {
    const headers = {
        'Content-Language': lang || _app_.lang,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-client-id': _app_.clientId,
        ...headersExtra
    }

    const token = Util.getAuthToken()
    if (token) {
        headers['Authorization'] = token
    }
    if (_app_.session) {
        // x-session is only set when USE_COOKIES is false
        headers['x-session'] = _app_.session
    }

    return headers
}

const getCacheKey = ({query, variables = {}, lang = _app_.lang, userId = _app_.user._id}) => {
    const {slug, ...rest} = variables
    return (slug !== undefined ? slug + '|' : query) + lang + (userId?'-'+userId+'-':'') + Object.keys(rest).filter(key => rest[key] ).sort().map(key=>key + '-' + rest[key]).join('|')
}


const getFetchMore = ({prevData, type, query, variables, fetchPolicy}) => {
    return (opt) => {
        finalFetch({type, query, variables: {...variables, ...opt.variables}, fetchPolicy}).then((fetchMoreResult) => {
            opt.updateQuery(prevData, {fetchMoreResult: fetchMoreResult.data})
        }).catch((e)=>{
            console.log(e)
            opt.updateQuery(e)
        })
    }
}

const FETCH_BY_ID = {}

export const clearFetchById = (id) => {
    if(FETCH_BY_ID[id]){
        console.log(`abort fetch with id ${id}`)
        FETCH_BY_ID[id].abort()
        delete FETCH_BY_ID[id]
    }
}
const FETCHING_BY_CACHEKEY = {}
export const finalFetch = ({type = RequestType.query, cacheKey, id, timeout,  query, variables, hiddenVariables, fetchPolicy = CACHE_FIRST, lang, headersExtra}) => {

    if(!query){
        console.error('query is missing in finalFetch')
        return
    }
    if (!cacheKey && type === RequestType.query) {
        cacheKey = getCacheKey({query, variables, lang})
    }
    if(cacheKey && FETCHING_BY_CACHEKEY[cacheKey]){
        // exact same query is running
        // prevent duplicate queries
        return FETCHING_BY_CACHEKEY[cacheKey]
    }
    const controller = new AbortController()

    if(id){
        clearFetchById(id)
        FETCH_BY_ID[id] = controller
    }

    const timeoutId = timeout === 0 ? 0 :setTimeout(() => {
        controller._timeout = true
        controller.abort()
    }, timeout || 60000)

    const finalizeRequest = () =>{
        clearTimeout(timeoutId)
        if(cacheKey){
            delete FETCHING_BY_CACHEKEY[cacheKey]
        }
    }

    const promise = new Promise((resolve, reject) => {

        if (type === RequestType.query && fetchPolicy === CACHE_FIRST) {
            const fromCache = client.readQuery({cacheKey})
            if (fromCache) {
                const resolveData = {
                    data: fromCache,
                    loading: false,
                    networkStatus: NetworkStatus.ready,
                    fetchMore: getFetchMore({prevData: fromCache, fetchPolicy, variables, type, query})
                }

                resolve(resolveData)
                setUpWsIfNeeded(resolveData.data)
                return
            }
        }

        let body
        if (hiddenVariables) {
            body = JSON.stringify({query, variables: {...variables, ...hiddenVariables}})
        } else {
            body = JSON.stringify({query, variables})
        }
        addLoader()
        fetch(getGraphQlUrl(), {
            method: 'POST',
            signal: controller.signal,
            credentials: 'include',
            headers: getHeaders(lang, headersExtra),
            body
        }).then(r => {
            finalizeRequest()
            removeLoader()
            if (r.ok) {
                // x-session is only set when USE_COOKIES is false
                _app_.session = r.headers.get('x-session')

                r.json().then(response => {
                    if (!response.isAuth && _app_.user && _app_.user._id) {
                        // if a user is logged in and for some reason user session is not valid anymore update user in client
                        _app_.dispatcher.setUser(null)
                    }
                    if (response.errors) {
                        const rejectData = {...response, loading: false, networkStatus: NetworkStatus.ready}
                        if (response.errors) {
                            rejectData.error = response.errors[0]
                            _app_.dispatcher.addError({
                                key: 'graphql_error',
                                msg: rejectData.error.message /* + (rejectData.error.path ? ' (in operation ' + rejectData.error.path.join('/') + ')' : '') */
                            })
                        }
                        reject(rejectData)
                    } else {
                        const resolveData = {...response, loading: false, networkStatus: NetworkStatus.ready}
                        setUpWsIfNeeded(response.data)
                        if (type === RequestType.query) {

                            resolveData.fetchMore = getFetchMore({
                                prevData: response.data,
                                fetchPolicy,
                                variables,
                                type,
                                query
                            })

                            Hook.call('ApiClientQueryResponse', {response})
                            resolve(resolveData)
                            if (fetchPolicy !== 'no-cache') {
                                client.writeQuery({cacheKey, query, variables, data: response.data})
                            }
                        } else {
                            resolve(resolveData)
                        }


                    }

                }).catch(error => {
                    reject({error, loading: false, networkStatus: NetworkStatus.error})
                    _app_.dispatcher.addError({
                        key: 'graphql_error',
                        msg: error.message + (error.path ? ' (in operation ' + error.path.join('/') + ')' : '')
                    })
                })
            } else {
                reject({error: {message: r.statusText}, loading: false, networkStatus: NetworkStatus.error})
                _app_.dispatcher.addError({key: 'api_error', msg: r.status + ' - ' + r.statusText})
            }

        }).catch(error => {
            finalizeRequest()
            removeLoader()
            reject({error, loading: false, networkStatus: NetworkStatus.error})
            _app_.dispatcher.addError({
                key: 'api_error',
                msg: controller._timeout ? 'Request timeout reached' : error.message
            })

        })
    })
    promise._controller = controller
    if(cacheKey){
        FETCHING_BY_CACHEKEY[cacheKey] = promise
    }
    return promise
}

let CACHE_QUERIES = {}, CACHE_ITEMS = {}, QUERY_WATCHER = {}

_app_.CACHE_QUERIES = CACHE_QUERIES

export const client = {
    query: ({query, variables, fetchPolicy, timeout, id}) => {
        return finalFetch({id, timeout, query, variables, fetchPolicy})
    },
    clearCacheWith:({start}) =>{
        const clearedKeys= []
        Object.keys(CACHE_QUERIES).forEach(key=>{
            if(key.startsWith(start)){
                clearedKeys.push(key)
                delete CACHE_QUERIES[key]
            }
        })
        return clearedKeys
    },
    writeQuery: ({query, variables, data, cacheKey}) => {
        let oldCacheKey
        if (data &&
            query &&
            variables &&
            data.cmsPage &&
            ['full',true].indexOf(data.cmsPage.urlSensitiv)<0 &&
            variables.query) {

            oldCacheKey = cacheKey || getCacheKey({query, variables})

            const newVariables = Object.assign({}, variables)
            delete newVariables.query
            cacheKey = getCacheKey({query, variables: newVariables})
            CACHE_QUERIES[oldCacheKey] = {__alias: cacheKey}
            console.log('new cacheKey with alias')
        }

        if (!cacheKey) {
            cacheKey = getCacheKey({query, variables})
        }
        CACHE_QUERIES[cacheKey] = data
        const update = QUERY_WATCHER[cacheKey] || QUERY_WATCHER[oldCacheKey]

        if (update) {
            if (data.__optimistic) {
                // return optimistic response
                update(data.__optimistic)
            } else {
                update(data)
            }
        }
    },
    readQuery: ({query, variables, cacheKey}) => {
        if (!cacheKey) {
            cacheKey = getCacheKey({query, variables})
        }
        let res = CACHE_QUERIES[cacheKey]
        if(res && res.__alias){
            console.log('read cache from alias')
            res = CACHE_QUERIES[res.__alias]
        }
        if (res && res.__optimistic) {
            // return optimistic response
            return res.__optimistic
        }
        return res
    },
    clearCache: ({query, variables, cacheKey}) => {
        if (!cacheKey) {
            cacheKey = getCacheKey({query, variables})
        }
        delete CACHE_QUERIES[cacheKey]
    },
    clearCacheStartsWith: (key) => {
        Object.keys(CACHE_QUERIES).forEach(k => {
            if (k.startsWith(key)) {
                delete CACHE_QUERIES[k]
            }
        })
    },
    addQueryWatcher: ({cacheKey, update}) => {
        QUERY_WATCHER[cacheKey] = update
    },
    resetStore: () => {
        CACHE_QUERIES = {}
        CACHE_ITEMS = {}
    },
    mutate: ({mutation, variables, update, optimisticResponse}, _ref) => {
        const res = finalFetch({type: RequestType.mutate, query: mutation, variables})

        if (update) {
            let proxy = client

            if (optimisticResponse) {
                proxy = {
                    ...client,
                    readQuery: ({query, variables, cacheKey}) => {
                        if (!cacheKey) {
                            cacheKey = getCacheKey({query, variables})
                        }
                        const res = CACHE_QUERIES[cacheKey]
                        if (res) {
                            delete res.__optimistic
                        }
                        return res
                    },
                    writeQuery: ({query, variables, data, cacheKey}) => {
                        const existingData = proxy.readQuery({query, variables, cacheKey})
                        if(existingData) {
                            delete existingData.__optimistic
                        }

                        data = {...existingData, __optimistic: data}
                        client.writeQuery({cacheKey, query, variables, data})
                    }
                }
                update(proxy, {data: optimisticResponse})
            }


            res.then((r) => {
                if (optimisticResponse) {
                    Object.keys(r.data).forEach(key => {
                        r.data[key] = {...optimisticResponse[key], ...r.data[key]}
                    })
                }
                proxy.writeQuery = client.writeQuery
                update(proxy, r)
            }).catch((e) => {
                proxy.writeQuery = client.writeQuery
                console.log(e)
                update(proxy, e)
            })
        }
        return res
    },
    subscribe: ({query, variables, extensions}) => {
        setUpWs()
        subscribeCount++

        const shareKey = query + (variables ? JSON.stringify(variables) : '') + (extensions ? JSON.stringify(extensions) : '')

        let id, subId
        if (sharedKeyIdMap[shareKey]) {
            id = sharedKeyIdMap[shareKey]
            subId = subscribeCount
        } else {
            subId = id = subscribeCount
            sharedKeyIdMap[shareKey] = id
        }

        return {
            subscribe: ({next}) => {
                const payload = {
                    variables,
                    query,
                    extensions,
                    lang: _app_.lang,
                    auth: Util.getAuthToken(), // auth is only set when USE_COOKIES is false
                    session: _app_.session, // session is only set when USE_COOKIES is false
                    clientId: _app_.clientId
                }
                createWsSubscription(id, subId, payload, next)
                return {
                    unsubscribe: () => {
                        if (removeWsSubscription(id, subId)) {
                            delete sharedKeyIdMap[shareKey]
                        }
                    }
                }
            }
        }
    }
}

export const graphql = (query, operationOptions = {}) => {

    let finalQuery  = query.constructor === String?query.trim():null

    return (WrappedComponent) => {

        class Wrapper extends React.Component {

            prevRespone = {}

            render() {
                if(query.constructor === Function) {
                    finalQuery = query(this.props, this.state)
                }

                if (finalQuery.startsWith('mutation')) {
                    const props = operationOptions.props({
                        mutate: (props) => {
                            return client.mutate({mutation: finalQuery, ...props}, this)
                        },
                        ownProps: this.props
                    })

                    return <WrappedComponent {...props} {...this.props} />
                }

                let finalProps

                const {refetchProps,refetchOptions} = this.state || {}

                if(refetchProps){
                    finalProps = Object.assign({isRefetch:true, refetchOptions}, this.props, refetchProps)
                } else {
                    finalProps = this.props
                }
                const prevData = this.prevRespone.data

                const options = operationOptions.options ? (typeof operationOptions.options === 'function' ? operationOptions.options(finalProps) : operationOptions.options) : {},
                    variables = options.variables,
                    skip = operationOptions.skip ? (typeof operationOptions.skip === 'function' ? operationOptions.skip(finalProps, prevData, this.prevRespone.lang) : operationOptions.skip) : false

                return <Query skip={skip} query={finalQuery} variables={variables}
                              hiddenVariables={options.hiddenVariables}
                              fetchPolicy={options.fetchPolicy}>{(res) => {

                    let data = res.data
                    if (!data && (res.loading || skip)) {
                        data = prevData
                    }
                    if(refetchOptions && refetchOptions.extendData) {
                        data = deepMerge({}, prevData, res.data)
                    }else {
                        res.lang = _app_.lang
                        this.prevRespone = res
                    }
                    const props = operationOptions.props({
                        data: {
                            variables, ...data,
                            loading: res.loading,
                            networkStatus: res.networkStatus,
                            fetchMore: res.fetchMore,
                            refetch: (refetchProps, refetchOptions={})=>{
                                this.setState({refetchProps,refetchOptions})
                            }
                        },
                        ownProps: finalProps
                    })

                    return <WrappedComponent {...props} {...finalProps} />
                }}</Query>
            }
        }

        return Wrapper
    }
}


export const Query = props => {
    const {children, query, ...options} = props,
        result = useQuery(query, options)
    return children && result ? children(result) : null
}
/*
export const Subscription = props => {
    const result = useSubscription(props.subscription, props)
    return props.children && result ? props.children(result) : null
}*/

export const useQuery = (query, {variables, hiddenVariables, fetchPolicy = CACHE_FIRST, skip}) => {
    const cacheKey = getCacheKey({query, variables})
    let currentData = null
    const checkCache = _app_.ssr || skip || fetchPolicy === CACHE_FIRST || fetchPolicy === 'cache-and-network'
    if (checkCache) {
        currentData = client.readQuery({cacheKey})
        setUpWsIfNeeded(currentData)
    }
    const initialLoading = (_app_.ssr || skip || (fetchPolicy === 'cache-first' && currentData)) ? false : true
    const initialData = {
        cacheKey,
        data: currentData,
        networkStatus: 0,
        loading: initialLoading,
        fetchMore: getFetchMore({
            fetchPolicy,
            variables,
            type: RequestType.query,
            query
        })
    }

    if (_app_.ssr) {

        if (!currentData) {
            SSR_FETCH_CHAIN[cacheKey] = {query, variables}
        }
        return initialData
    }

    const [response, setResponse] = useState(initialData)

    const cacheDeletedAt = checkCache && response.data && !response.errors && !currentData ? Date.now(): response.cacheDeletedAt

    useEffect(() => {

        let controller

        const newResponse = {cacheDeletedAt, cacheKey, fetchMore: initialData.fetchMore}
        newResponse.loading = response.networkStatus !== NetworkStatus.error

        client.addQueryWatcher({
            cacheKey, update: data => {
                if (data !== newResponse.data) {
                    setResponse({...newResponse, loading: false, data})
                }
            }
        })

        if (initialLoading) {
            if (newResponse.loading) {
                const promise = finalFetch({
                    cacheKey,
                    query,
                    variables,
                    hiddenVariables,
                    fetchPolicy
                })

                controller = promise._controller
                promise.then(response => {
                    setResponse({...response, cacheDeletedAt, cacheKey})
                }).catch(error => {
                    if (!controller.signal.aborted || controller._timeout) {
                        setResponse(error)
                    }
                })
            }
        }

        return () => {
            if (controller) {
                console.log('Abort request in useQuery',variables.slug)
                controller.abort()
            }
        }
    }, [cacheKey,cacheDeletedAt])

    if (!initialLoading) {
        response.data = currentData
        return initialData
    }

    if (response.cacheKey && initialData.cacheKey !== response.cacheKey) {
        if(currentData) {
            response.data = currentData
        }
        response.loading = true
    }

    return response
}
