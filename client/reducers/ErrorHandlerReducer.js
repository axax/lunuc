export default function errorHandler(state = {messages:{}}, action) {
	switch (action.type) {
		case 'ADD_ERROR':
			return {...state, messages:{...state.messages,[action.key]:{msg: action.msg, type: 'error'}}}
		case 'CLEAR_ERROR':
            const clearError = Object.assign({},{messages:Object.assign({},state.messages)})
			delete clearError.messages[action.key]
			return clearError
		case 'CLEAR_ERRORS':
			return Object.assign({},state,{messages:{}})
		default:
			return state
	}
}
