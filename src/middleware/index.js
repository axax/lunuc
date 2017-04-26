import ApolloClient, {createNetworkInterface} from 'apollo-client'
import {applyMiddleware} from 'redux'

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