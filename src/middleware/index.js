import {ApolloClient} from 'apollo-client'
import {createHttpLink} from 'apollo-link-http'
import {setContext} from 'apollo-link-context'
import {InMemoryCache} from 'apollo-cache-inmemory'
import { onError } from 'apollo-link-error'

import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws'
import {applyMiddleware} from 'redux'
import * as Actions from '../actions/ErrorHandlerAction'


// the link to our graphql api
const httpLink = createHttpLink({uri: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/graphql`})

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


const errorLink = onError(({ networkError, graphQLErrors, operation, response }) => {
    console.log(operation, graphQLErrors)

    // check for mongodb/graphql errors
    if (operation.variables && operation.variables._ignoreErrors) {
        //d.errors = null
    } else if (!operation.variables || operation.variables._errorHandling !== false) {
       /* if (d.errors && d.errors.length) {
            client.store.dispatch(Actions.addError({key: 'graphql_error', msg: d.errors[0].message}))
        }*/
    }
})

const httpLinkWithError = errorLink.concat(httpLink)



// use with apollo-client
const link = middlewareLink.concat(httpLinkWithError)

// cache
const cache = new InMemoryCache({
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
})


// Error handler
/*const logErrors = networkInterface => ({
    query: request => networkInterface.query(request).then(d => {
        // check for mongodb/graphql errors
        if (request.variables && request.variables._ignoreErrors) {
            d.errors = null
        } else if (!request.variables || request.variables._errorHandling !== false) {
            if (d.errors && d.errors.length) {
                client.store.dispatch(Actions.addError({key: 'graphql_error', msg: d.errors[0].message}))
            }
        }
        return d
    }).catch(e => {
        // check for server status error like 500, 504...
        client.store.dispatch(Actions.addError({key: 'api_error', msg: e.message}))
        return e
    }),
    use: middlewares => networkInterface.use(middlewares)
})*/


//const networkInterfaceDecorator = logErrors(networkInterface)





/*
 // Create WebSocket client for subsciption
 const wsClient = new SubscriptionClient((window.location.protocol === 'https:' ? 'wss' : 'ws') + `://${window.location.hostname}:${window.location.port}/ws`, {
 reconnect: true,
 connectionParams: {
 // Pass any arguments you want for initialization
 }
 })
 */

// Extend the network interface with the WebSocket
/*const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
    networkInterfaceDecorator,
    wsClient
)*/



// create the apollo client
export const client = new ApolloClient({
    link,
    // use restore on the cache instead of initialState
    cache: cache.restore(window.__APOLLO_CLIENT__),
    ssrMode: false,
    ssrForceFetchDelay: 100,
    connectToDevTools: true,
    queryDeduplication: true
})