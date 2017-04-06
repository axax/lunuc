import ApolloClient, {createNetworkInterface} from 'apollo-client'

/*
 export const client = new ApolloClient({
 networkInterface: createNetworkInterface({
 uri: 'https://api.graph.cool/simple/v1/__APIURL__',
 dataIdFromObject: record => record.id,  // will be used by Apollo Client caching
 }),
 })*/

export const client = new ApolloClient({
	reduxRootSelector: state => state.remote,
	networkInterface: createNetworkInterface({
		uri: `http://${window.location.hostname}:3000/graphql`,
		dataIdFromObject: record => record.id,  // will be used by Apollo Client caching
	}),
})