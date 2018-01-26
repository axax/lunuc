import * as types from '../constants/ActionTypes'


export default function errorHandler(state = {messages:{}}, action) {
	switch (action.type) {
		case types.ADD_ERROR:
			return {...state, messages:{...state.messages,[action.key]:{msg: action.msg, type: 'error'}}}
		case types.CLEAR_ERROR:
            const clearError = {...state,message:{...state.messages}}
			delete clearError.messages[action.key]
			return clearError
		case types.CLEAR_ERRORS:
			return Object.assign({},state,{messages:{}})
		default:
			return state
	}
}
