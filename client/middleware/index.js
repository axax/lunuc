import {ApolloClient} from '@apollo/client/core'
import {createHttpLink, ApolloLink} from '@apollo/client'
import {setContext} from '@apollo/link-context'
import {onError} from '@apollo/link-error'
import {WebSocketLink} from '@apollo/link-ws'
import { getMainDefinition } from '@apollo/client/utilities'
//import {OfflineCache} from './cache'
import {InMemoryCache} from '@apollo/client/cache'
import {addError} from 'client/actions/ErrorHandlerAction'
import {setNetworkStatus} from 'client/actions/NetworkStatusAction'
import Util from '../util'
import Hook from 'util/hook'

const location = window.location
const httpUri = `${location.protocol}//${location.hostname}:${location.port}/graphql`
const wsUri = (location.protocol === 'https:' ? 'wss' : 'ws') + `://${location.hostname}:${location.port}/ws`


// create a middleware for state handling and to attach the hook
let loadingCounter = 0, _store

function addLoader() {
    loadingCounter++
    if (loadingCounter === 1) {
        _store.dispatch(setNetworkStatus({
            networkStatus: {loading: true}
        }))
    }
}

function removeLoader() {
    loadingCounter--
    if (loadingCounter === 0) {
        // send loading false when all request are done
        _store.dispatch(setNetworkStatus({
            networkStatus: {loading: false}
        }))
    }
}

if (window.fetch) {
    const oldfetch = fetch
    fetch = function (input, opts) {
        addLoader()
        return new Promise((resolve, reject) => {
            oldfetch(input, opts).then((...args) => {
                removeLoader()
                resolve(...args)
            }, (...args) => {
                removeLoader()
                reject(...args)
            })
        })
    }
}

export function configureMiddleware(store) {
    _store = store

    //// TODO: batch queries is not support in graphql-express --> replace with ApolloServer
    //const httpLink = new BatchHttpLink({uri: httpUri})
    // the link to our graphql api
    const httpLink = createHttpLink({uri: httpUri})

    // create a middleware with the authentication
    const authLink = setContext((req) => {
        const headers = {
            ['Content-Language']: _app_.lang
        }

        const token = Util.getAuthToken()
        if (token) {
            headers['Authorization'] = token
        }
        if (_app_.session) {
            headers['x-session'] = _app_.session
        }


        return {headers}
    })


    // create a middleware for error handling
    const errorLink = onError(({networkError, graphQLErrors, operation, response}) => {
        // check for mongodb/graphql errors
        let errorCount = 0
        if (graphQLErrors) {
            graphQLErrors.map(({message, locations, path, state}) => {
                    // don't handle errors with a state.
                    if (!state) {
                        errorCount++
                        _app_.lastGraphQLError = message
                        store.dispatch(addError({
                            key: 'graphql_error-' + errorCount,
                            msg: message + (path ? ' (in operation ' + path.join('/') + ')' : '')
                        }))
                    }
                }
            )
        }
        if (networkError) {
            if (errorCount == 0) {
                // this is only shown if not already a graphql_error has dispatched
                store.dispatch(addError({key: 'api_error', msg: networkError.message}))
            }
        }
    })

    const statusLink = new ApolloLink((operation, forward) => {
        return forward(operation).map((data) => {
            _app_.session = operation.getContext().response.headers.get('x-session')
            /* HOOK */
            Hook.call('ApiResponse', data)
            return data
        })
    })


    // combine the links (the order is important)
    const combinedLink = ApolloLink.from([
        errorLink,
        statusLink,
        authLink,
        httpLink
    ])

    let link = null, wsLink = null
    try {
        wsLink = new WebSocketLink({
            uri: wsUri,
            options: {
                reconnect: true, //auto-reconnect
            }
        })


        // create my middleware using the applyMiddleware method from subscriptions-transport-ws
        const subscriptionMiddleware = {
            applyMiddleware(options, next) {
                options.auth = Util.getAuthToken()
                options.session = _app_.session
                next()
            }
        }

        // add the middleware to the web socket link via the Subscription Transport client
        wsLink.subscriptionClient.use([subscriptionMiddleware])

        // add ws link
        link = ApolloLink.split(
            ({ query }) => {
                const definition = getMainDefinition(query);
                return (
                    definition.kind === 'OperationDefinition' &&
                    definition.operation === 'subscription'
                );
            },
            wsLink,
            combinedLink
        )


        // add ws link
        /*link = ApolloLink.split(
            operation => {
                const operationAST = getOperationAST(operation.query, operation.operationName)
                return !!operationAST && operationAST.operation === 'subscription'
            },
            wsLink,
            combinedLink
        )*/
    } catch (e) {
        // without ws
        console.warn('WS might not work', e)
        link = combinedLink
    }

    const cacheOptions = {
        dataIdFromObject: (o) => {
            if (o.__typename === 'Token') {
                // this is the login methode
                return o.__typename + (o.user ? o.user.username : '')
            } else if (o.__typename === 'KeyValueGlobal') {
                return o.__typename + o.key
            } else if (o.__typename === 'KeyValue') {
                // key alone is not unique -> add user id as well
                // if user doesnt exit anymore createdBy is null --> us _id in that case
                return o.__typename + (!o.createdBy ? o._id : o.createdBy._id + o.key)
            } else if (o._id) {
                return o.__typename + o._id + (o.cacheKey ? o.cacheKey : '')
            }
            // Make sure to return null if this object doesn't have an ID
            return null
        },
        addTypename: true
    }

    // create the apollo client
    const client = new ApolloClient({
        link,
        // use restore on the cache instead of initialState
        cache: new InMemoryCache(cacheOptions),
        ssrMode: false,
        /* if this is set to greater than 0 and fetch-policy is network-only, the policy gets changed to cache-first before the time im ms has passed */
        ssrForceFetchDelay: 0,
        connectToDevTools: true,
        queryDeduplication: true,
        defaultOptions: {
            watchQuery: {
                errorPolicy: 'all'
            },
            query: {
                errorPolicy: 'all'
            },
            mutate: {
                errorPolicy: 'all'
            }
        }
    })

    return client
}
