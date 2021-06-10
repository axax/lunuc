import React, {useState, useEffect} from 'react'
import Util from '../util'
import {getStore} from '../store/index'
import {setNetworkStatus} from '../actions/NetworkStatusAction'
import {addError} from '../actions/ErrorHandlerAction'


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

const location = window.location
let GRAPHQL_URL = `${location.protocol}//${location.hostname}:${location.port}/graphql`
let GRAPHQL_WS_URL = (location.protocol === 'https:' ? 'wss' : 'ws') + `://${location.hostname}:${location.port}/ws`

export let SSR_FETCH_CHAIN = {}


export const setGraphQlOptions = ({url}) => {
    GRAPHQL_URL = url
}

// create a middleware for state handling and to attach the hook
let loadingCounter = 0

function addLoader() {
    loadingCounter++
    if (loadingCounter === 1) {
        getStore().dispatch(setNetworkStatus({
            networkStatus: {loading: true}
        }))
    }
}

function removeLoader() {
    loadingCounter--
    if (loadingCounter === 0) {
        // send loading false when all request are done
        getStore().dispatch(setNetworkStatus({
            networkStatus: {loading: false}
        }))
    }
}


/* Websocket */
let wsCurrentConnection, subscribeCount = 0, openWsSubscription = []

const createWsSubscription = (id, payload, next) => {
    openWsSubscription.push({
        id,
        payload,
        next
    })

    if (wsCurrentConnection && wsCurrentConnection.readyState === 1) {
        wsCurrentConnection.send(JSON.stringify({type:'start', id, payload}))
    }
}

const removeWsSubscription = (id) => {
    if (wsCurrentConnection) {
        if (wsCurrentConnection.readyState === 1) {
            wsCurrentConnection.send(`{"type":"stop","id":${id}}`)
        }
    }
    // remove from array by id
    for (let i = 0; i < openWsSubscription.length; i++) {
        if(openWsSubscription[i].id === id){
            openWsSubscription.splice(i, 1)
            break
        }
    }
}


const setUpWs = () => {
    if (!_app_.ssr) {

        try {
            wsCurrentConnection = new WebSocket(GRAPHQL_WS_URL, ['graphql-ws'])

            if (navigator.userAgent.indexOf('Chrome-Lighthouse') > -1) {
                throw Error('Chrome-Lighthouse does not support ws')
            }

            wsCurrentConnection.onopen = () => {
                wsCurrentConnection.send('{"type":"connection_init","payload":{}}')

                for (let i = 0; i < openWsSubscription.length; i++) {
                    const sub = openWsSubscription[i]
                    wsCurrentConnection.send(JSON.stringify({type:'start', id:sub.id, payload:sub.payload}))
                }

                return false
            }
            wsCurrentConnection.onerror = error => {
                console.log(`WebSocket error: ${error}`)
            }

            wsCurrentConnection.onclose = () => {
                console.log(`WebSocket closed.  Try to reconnect in 5 seconds`)
                setTimeout(setUpWs, 5000)
            }

            wsCurrentConnection.addEventListener('message', (e) => {
                const msg = JSON.parse(e.data)
                if (msg.payload) {
                    for (let i = 0; i < openWsSubscription.length; i++) {
                        const sub = openWsSubscription[i]
                        sub.next(msg.payload)
                    }
                }
            }, false)


        } catch (e) {
            // without ws
            console.warn('WS might not work', e)
        }

    }
}
setUpWs()
const getHeaders = (lang) => {
    const headers = {
        'Content-Language': lang || _app_.lang,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
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

const getCacheKey = ({query, variables}) => {
    return query + (variables ? JSON.stringify(variables) : '')
}

const getFetchMore = ({prevData, type, query, variables, fetchPolicy}) => {
    return (opt) => {
        finalFetch({type, query, variables: {...variables, ...opt.variables}, fetchPolicy}).then((fetchMoreResult) => {

            opt.updateQuery(prevData, {fetchMoreResult: fetchMoreResult.data})
        }).catch(opt.updateQuery)
    }
}

export const finalFetch = ({type = RequestType.query, cacheKey, query, variables, hiddenVariables, fetchPolicy = 'cache-first', signal, lang}) => {

    return new Promise((resolve, reject) => {

        if (type === RequestType.query) {
            if (!cacheKey) {
                cacheKey = getCacheKey({query, variables})
            }

            if (fetchPolicy === 'cache-first') {
                const fromCache = client.readQuery({cacheKey})
                if (fromCache) {
                    const resolveData = {
                        data: fromCache,
                        loading: false,
                        networkStatus: NetworkStatus.ready,
                        fetchMore: getFetchMore({prevData: fromCache, fetchPolicy, variables, type, query})
                    }

                    resolve(resolveData)

                    return
                }
            }
        }

        let body
        if (hiddenVariables) {
            body = JSON.stringify({query, variables: {...variables, ...hiddenVariables}})
        } else {
            body = JSON.stringify({query, variables})
        }

        addLoader()
        fetch(GRAPHQL_URL, {
            method: 'POST',
            signal,
            credentials: 'include',
            headers: getHeaders(lang),
            body
        }).then(r => {
            removeLoader()
            // x-session is only set when USE_COOKIES is false
            _app_.session = r.headers.get('x-session')

            r.json().then(response => {
                if (!r.ok || response.errors) {
                    const rejectData = {...response, loading: false, networkStatus: NetworkStatus.ready}
                    if (response.errors) {
                        rejectData.error = response.errors[0]
                        getStore().dispatch(addError({
                            key: 'graphql_error',
                            msg: rejectData.error.message /* + (rejectData.error.path ? ' (in operation ' + rejectData.error.path.join('/') + ')' : '') */
                        }))
                    }
                    reject(rejectData)
                } else {
                    const resolveData = {...response, loading: false, networkStatus: NetworkStatus.ready}

                    if (type === RequestType.query) {

                        resolveData.fetchMore = getFetchMore({
                            prevData: response.data,
                            fetchPolicy,
                            variables,
                            type,
                            query
                        })

                        if (fetchPolicy !== 'no-cache') {
                            client.writeQuery({cacheKey, data: response.data})
                        }
                    }

                    resolve(resolveData)
                }

            }).catch(error => {
                reject({error, loading: false, networkStatus: NetworkStatus.error})
                getStore().dispatch(addError({
                    key: 'graphql_error',
                    msg: error.message + (error.path ? ' (in operation ' + error.path.join('/') + ')' : '')
                }))
            })

        }).catch(error => {
            removeLoader()
            reject({error, loading: false, networkStatus: NetworkStatus.error})
            getStore().dispatch(addError({key: 'api_error', msg: error.message}))

        })
    })
}

let CACHE_QUERIES = {}, CACHE_ITEMS = {}, QUERY_WATCHER = {}

export const client = {
    query: ({query, variables, fetchPolicy}) => {
        return finalFetch({query, variables, fetchPolicy})
    },
    writeQuery: ({query, variables, data, cacheKey}) => {
        if (!cacheKey) {
            cacheKey = getCacheKey({query, variables})
        }
        CACHE_QUERIES[cacheKey] = data
        window.CACHE_QUERIES = CACHE_QUERIES
        const update = QUERY_WATCHER[cacheKey]
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
        const res = CACHE_QUERIES[cacheKey]
        if (res && res.__optimistic) {
            // return optimistic response
            return res.__optimistic
        }
        return res
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
                        delete existingData.__optimistic

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
                update(proxy, e)
            })
        }
        return res
    },
    subscribe: ({query, variables, extensions}) => {
        subscribeCount++

        const id = subscribeCount


        return {
            subscribe: ({next}) => {
                const payload = {
                    variables,
                    query,
                    extensions,
                    auth: Util.getAuthToken(), // auth is only set when USE_COOKIES is false
                    session: _app_.session // session is only set when USE_COOKIES is false
                }
                createWsSubscription(id, payload, next)
                return {
                    unsubscribe: () => {
                        removeWsSubscription(id)
                    }
                }
            }
        }
    }
}

export const graphql = (query, operationOptions = {}) => {
    query = query.trim()

    return (WrappedComponent) => {

        class Wrapper extends React.Component {

            render() {
                //this.renderCount++
                //console.log(this.renderCount,query)
                if (query.startsWith('mutation')) {


                    const props = operationOptions.props({
                        mutate: (props) => {

                            return client.mutate({mutation: query, ...props}, this)
                        },
                        ownProps: this.props
                    })

                    return <WrappedComponent {...props} {...this.props} />
                }


                const options = operationOptions.options ? (typeof operationOptions.options === 'function' ? operationOptions.options(this.props) : operationOptions.options) : {},
                    variables = options.variables,
                    skip = operationOptions.skip ? (typeof operationOptions.skip === 'function' ? operationOptions.skip(this.props, this.prevData) : operationOptions.skip) : false

                return <Query skip={skip} query={query} variables={variables} hiddenVariables={options.hiddenVariables}
                              fetchPolicy={options.fetchPolicy}>{(res) => {

                    let data = res.data
                    if (!data && res.loading) {
                        data = this.prevData
                    }
                    this.prevData = data
                    const props = operationOptions.props({
                        data: {
                            variables, ...data,
                            loading: res.loading,
                            networkStatus: res.networkStatus,
                            fetchMore: res.fetchMore
                        },
                        ownProps: this.props
                    })

                    return <WrappedComponent {...props} {...this.props} />
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

export const useQuery = (query, {variables, hiddenVariables, fetchPolicy = 'cache-first', skip}) => {


    const cacheKey = getCacheKey({query, variables})

    const [response, setResponse] = useState({
        data: _app_.ssr ? client.readQuery({cacheKey}) : null,
        networkStatus: 0,
        loading: !_app_.ssr,
        fetchMore: getFetchMore({
            fetchPolicy,
            variables,
            type: RequestType.query,
            query
        })
    })

    if (_app_.ssr) {

        if (!response.data) {
            SSR_FETCH_CHAIN[cacheKey] = {query, variables}
        }

        return response
    }


    useEffect(() => {

        const controller = new AbortController()
        if (!skip) {
            const newResponse = {}
            newResponse.loading = response.networkStatus !== NetworkStatus.error

            if (fetchPolicy !== 'network-only' || fetchPolicy !== 'no-cache') {
                newResponse.data = client.readQuery({cacheKey})

                if (newResponse.data && fetchPolicy === 'cache-first') {
                    newResponse.loading = false
                }
            }

            client.addQueryWatcher({
                cacheKey, update: data => {
                    // console.log(data, response.data)
                    if (data !== response.data) {
                        setResponse({...response, loading: false, data})
                    }
                }
            })

            setResponse(newResponse)

            if (newResponse.loading) {

                finalFetch({
                    cacheKey,
                    query,
                    variables,
                    hiddenVariables,
                    fetchPolicy,
                    signal: controller.signal
                }).then(response => {
                    setResponse(response)
                }).catch(error => {
                    if (!controller.signal.aborted) {
                        setResponse(error)
                    }
                })
            }
        }

        return () => {
            controller.abort()
        }
    }, [cacheKey])


    return response
}
