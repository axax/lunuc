import * as types from '../constants/ActionTypes'

export const addError = ({key, msg}) => ({
	type: types.ADD_ERROR,
	key,
	msg
})