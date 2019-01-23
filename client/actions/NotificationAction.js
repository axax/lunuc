import * as types from '../constants/ActionTypes'

export const addNotification = ({key, message}) => ({
	type: types.ADD_NOTIFICATION,
	key,
	message
})