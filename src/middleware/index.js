import ApolloClient, {createNetworkInterface} from 'apollo-client'
import {applyMiddleware} from 'redux'
import * as Actions from '../actions/ErrorHandlerAction'

const networkInterface = createNetworkInterface({
	uri: `http://${window.location.hostname}:3000/graphql`,
})


networkInterface.use([{
	applyMiddleware(req, next) {
		if (!req.options.headers) {
			req.options.headers = {}  // Create the header object if needed.
		}

		// get the authentication token from local storage if it exists
		const token = localStorage.getItem('token')
		req.options.headers.authorization = token ? `JWT ${token}` : null
		next()
	}
}]).useAfter([{
	applyAfterware({ response }, next ) {
		if (response.status !== 200) {
			client.store.dispatch(Actions.addError({key:'api_error',msg:response.status+' '+response.statusText}))
			if( response.status === 504 ){
				localStorage.removeItem('token')
			}
		}
		next()
	}
}])


export const client = new ApolloClient({
	reduxRootSelector: state => state.remote,
	networkInterface: networkInterface,
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