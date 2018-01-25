import * as types from '../constants/ActionTypes'

export default function user(state = {userToken:localStorage.getItem('token'),userData:null,isAuthenticated:false}, action) {
	switch (action.type) {
		case types.USER_SET:
            return Object.assign({},state,{userData:action.userData,isAuthenticated:action.isAuthenticated})
		default:
			return state
	}
}
