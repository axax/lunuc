export default function networkStatusHandler(state = {networkStatus:{loading:false}}, action) {
	switch (action.type) {
		case 'SET_NETWORK_STATUS':
			return {networkStatus:action.networkStatus}
		default:
			return state
	}
}
