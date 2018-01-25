import * as types from '../constants/ActionTypes'


export default function errorHandler(state = {messages:{}}, action) {
	switch (action.type) {
		case types.ADD_ERROR:
			const addError = Object.assign({},{messages:{}},state)
            addError.messages[action.key] = {msg: action.msg, type: 'error'}
			return addError
		case types.CLEAR_ERROR:
            const clearError = Object.assign({},{messages:{}},state)
			delete clearError.messages[action.key]
			return clearError
		case types.CLEAR_ERRORS:
			return Object.assign({},state,{messages:{}})
		default:
			return state
	}
}
