import {ApolloClient} from 'apollo-client'
import {createHttpLink} from 'apollo-link-http'
import {setContext} from 'apollo-link-context'
import {onError} from 'apollo-link-error'
import {WebSocketLink} from 'apollo-link-ws'
import {ApolloLink} from 'apollo-link'
import {getOperationAST} from 'graphql'
import {OfflineCache} from './cache'
import * as Actions from 'client/actions/ErrorHandlerAction'


const httpUri = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/graphql`
const wsUri = (window.location.protocol === 'https:' ? 'wss' : 'ws') + `://${window.location.hostname}:${window.location.port}/ws`


export function configureMiddleware(store) {



    // the link to our graphql api
    const httpLink = createHttpLink({uri: httpUri})

    // create a middleware link with the authentication
    const middlewareLink = setContext((req) => {
        // get the authentication token from local storage if it exists
        const token = localStorage.getItem('token')
        return {
            headers: {
                authorization: token ? `JWT ${token}` : null,
            }
        }
    })

    // create a link for error handling
    const errorLink = onError(({networkError, graphQLErrors, operation, response}) => {
        console.log(operation)
        // check for mongodb/graphql errors
        if (graphQLErrors) {
            graphQLErrors.map(({message, locations, path}) =>
                store.dispatch(Actions.addError({
                    key: 'graphql_error',
                    msg: message + ' (in operation ' + path.join('/') + ')'
                }))
            )
            // hide error in console log
            response.errors = null
        }
        if (networkError) store.dispatch(Actions.addError({key: 'api_error', msg: networkError.message}))

    })

    // combine the links
    const httpLinkWithError = errorLink.concat(httpLink)
    const httpLinkWithErrorAndMiddleware = middlewareLink.concat(httpLinkWithError)


    const wsLink = new WebSocketLink({
        uri: wsUri,
        options: {
            reconnect: true, //auto-reconnect
        }
    })

    // create my middleware using the applyMiddleware method from subscriptions-transport-ws
    const subscriptionMiddleware = {
        applyMiddleware (options, next) {
            // get the authentication token from local storage if it exists
            const token = localStorage.getItem('token')

            options.auth = token ? `JWT ${token}` : null
            next()
        }
    }

    // add the middleware to the web socket link via the Subscription Transport client
    wsLink.subscriptionClient.use([subscriptionMiddleware])

    // add ws link
    const link = ApolloLink.split(
        operation => {
            const operationAST = getOperationAST(operation.query, operation.operationName)
            return !!operationAST && operationAST.operation === 'subscription'
        },
        wsLink,
        httpLinkWithErrorAndMiddleware
    )

    const cacheOptions = {
        dataIdFromObject: (o) => {
            if (o.__typename === 'KeyValue') {
                return o.__typename + o.key
            } else if (o._id) {
                return o.__typename + o._id
            }
            // Make sure to return null if this object doesn't have an ID
            return null
        },
        addTypename: true
    }

    const cache = new OfflineCache(cacheOptions)




    // create the apollo client
    const client =  new ApolloClient({
        link,
        // use restore on the cache instead of initialState
        cache: cache,
        ssrMode: false,
        ssrForceFetchDelay: 100,
        connectToDevTools: true,
        queryDeduplication: true,
        /*defaultOptions: {
             watchQuery: {
             fetchPolicy: 'cache-and-network',
             errorPolicy: 'all',
             },
             query: {
             fetchPolicy: 'cache-and-network',
             errorPolicy: 'all',
             },
             mutate: {
             errorPolicy: 'all',
             },
        }*/
    })

    return client
}