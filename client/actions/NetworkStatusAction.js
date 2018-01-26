import {SET_NETWORK_STATUS} from '../constants/ActionTypes'

export const setNetworkStatus = ({networkStatus}) => ({
	type: SET_NETWORK_STATUS,
    networkStatus
})
