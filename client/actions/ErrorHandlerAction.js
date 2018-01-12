import * as types from '../constants/ActionTypes'

export const addError = ({key, msg}) => ({
	type: types.ADD_ERROR,
	key,
	msg
})

export const clearError = (key) => ({
	type: types.CLEAR_ERROR,
	key
})


export const clearErrors = () => ({
    type: types.CLEAR_ERRORS
})