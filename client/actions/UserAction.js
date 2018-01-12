import * as types from '../constants/ActionTypes'

export const setUser = (userData, isAuthenticated) => ({
	type: types.USER_SET,
	userData,
	isAuthenticated
})