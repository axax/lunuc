import ApolloClient, {createNetworkInterface} from 'apollo-client'
import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws'
import {applyMiddleware} from 'redux'
import * as Actions from '../actions/ErrorHandlerAction'
import {gql} from 'react-apollo'


// Create regular NetworkInterface by using apollo-client's API
const networkInterface = createNetworkInterface({
	uri: `http://${window.location.hostname}:3000/graphql`,
})

// Create WebSocket client for subsciption
const wsClient = new SubscriptionClient('ws://localhost:5000/', {
	reconnect: true,
	connectionParams: {
		// Pass any arguments you want for initialization
	}
})

// Error handler
const logErrors = networkInterface => ({
	query: request => networkInterface.query(request).then(d => {
		// check for mongodb/graphql errors
		if( !request.variables || request.variables._errorHandling!==false ) {
			if (d.errors && d.errors.length) {
				client.store.dispatch(Actions.addError({key: 'graphql_error', msg: d.errors[0].message}))
			}
		}
		return d
	}).catch( e => {
		// check for server status error like 500, 504...
		client.store.dispatch(Actions.addError({key:'api_error',msg:e.message}))
		return e
	}),
	use: middlewares => networkInterface.use(middlewares)
})

const networkInterfaceDecorator = logErrors(networkInterface)

networkInterfaceDecorator.use([{
	applyMiddleware(req, next) {
		if (!req.options.headers) {
			req.options.headers = {}  // Create the header object if needed.
		}

		// get the authentication token from local storage if it exists
		const token = localStorage.getItem('token')
		req.options.headers.authorization = token ? `JWT ${token}` : null
		next()
	}
}])


// Extend the network interface with the WebSocket
const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
	networkInterfaceDecorator,
	wsClient
)


export const client = new ApolloClient({
	reduxRootSelector: state => state.remote,
	networkInterface: networkInterfaceWithSubscriptions,
	dataIdFromObject: (o) => {
		if (o.__typename === 'KeyValue') {
			return o.__typename + o.key
		} else if (o._id) {
			return o._id
		}

		// Make sure to return null if this object doesn't have an ID
		return null
	} // will be used by Apollo Client caching
})

/*
wsClient.subscribeToMore({
	document: gql`
        subscription notify {
            key
            message
        }`,
	variables: {},
	updateQuery: (prev, {subscriptionData}) => {
		console.log(subscriptionData)
		// Modify your store and return new state with the new arrived data
	}
})*/