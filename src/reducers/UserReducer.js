import * as types from '../constants/ActionTypes'
import update from 'immutability-helper'


export default function user(state = {userToken:localStorage.getItem('token'),userData:null,isAuthenticated:false}, action) {
	switch (action.type) {
		case types.USER_SET:
			return update(state, {userData:{$set:action.userData},isAuthenticated:{$set:action.isAuthenticated}})
		default:
			return state
	}
}
