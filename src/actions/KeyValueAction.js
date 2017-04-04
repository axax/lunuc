import * as types from '../constants/ActionTypes'

export const setKeyValue = ({key, value}) => ({
	type: types.KEYVALUE_SET,
	key,
	value
})