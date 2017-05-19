import ApolloClient, {createNetworkInterface} from 'apollo-client'
import {applyMiddleware} from 'redux'
import * as Actions from '../actions/ErrorHandlerAction'

const networkInterface = createNetworkInterface({
	uri: `http://${window.location.hostname}:3000/graphql`,
})

const logErrors = networkInterface => ({
	query: request => networkInterface.query(request).then(d => {
		// check for mongodb/graphql errors
		if( d.errors && d.errors.length ){
			client.store.dispatch(Actions.addError({key:'graphql_error',msg:d.errors[0].message}))
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


export const client = new ApolloClient({
	reduxRootSelector: state => state.remote,
	networkInterface: networkInterfaceDecorator,
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