import ApolloClient, {createNetworkInterface} from 'apollo-client'

export const client = new ApolloClient({
	reduxRootSelector: state => state.remote,
	networkInterface: createNetworkInterface({
		uri: `http://${window.location.hostname}:3000/graphql`,
	}),
	dataIdFromObject: (o) => {
		if (o.__typename === 'KeyValue') {
			return o.__typename + o.key
		}

		// Make sure to return null if this object doesn't have an ID
		return null
	} // will be used by Apollo Client caching
})