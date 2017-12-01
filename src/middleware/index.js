import {ApolloClient} from 'apollo-client'
import {createHttpLink} from 'apollo-link-http'
import {setContext} from 'apollo-link-context'
import {onError} from 'apollo-link-error'
import {WebSocketLink} from 'apollo-link-ws'
import {ApolloLink} from 'apollo-link'
import {getOperationAST} from 'graphql'
import {OfflineCache} from './cache'
import {applyMiddleware} from 'redux'
import * as Actions from '../actions/ErrorHandlerAction'


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

        /* if (operation.operationName === 'IgnoreErrorsQuery') {
         }*/


        // check for mongodb/graphql errors
        if (response && response.errors && response.errors.length) {
            if (operation.variables && operation.variables._ignoreErrors) {
                // ignore errors
                response.errors = null
            } else if (!operation.variables || operation.variables._errorHandling !== false) {
                store.dispatch(Actions.addError({key: 'graphql_error', msg: response.errors[0].message}))
                response.errors = null
            }
        } else if (networkError) {
            // check for server status error like 500, 504...
            store.dispatch(Actions.addError({key: 'api_error', msg: networkError.message}))
        }
    })

    // combine the links
    const httpLinkWithError = errorLink.concat(httpLink)
    const httpLinkWithErrorAndMiddleware = middlewareLink.concat(httpLinkWithError)


    // add ws link
    const link = ApolloLink.split(
        operation => {
            const operationAST = getOperationAST(operation.query, operation.operationName)
            return !!operationAST && operationAST.operation === 'subscription'
        },
        new WebSocketLink({
            uri: wsUri,
            options: {
                reconnect: true, //auto-reconnect
                // // carry login state (should use secure websockets (wss) when using this)
                // connectionParams: {
                //   authToken: localStorage.getItem("Meteor.loginToken")
                // }
            }
        }),
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
    return new ApolloClient({
        link,
        // use restore on the cache instead of initialState
        cache: cache.restore(window.__APOLLO_CLIENT__),
        ssrMode: false,
        ssrForceFetchDelay: 100,
        connectToDevTools: true,
        queryDeduplication: true
    })
}