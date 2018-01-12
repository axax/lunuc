import * as types from '../constants/ActionTypes'
import update from 'immutability-helper'


export default function errorHandler(state = {messages:{}}, action) {
	switch (action.type) {
		case types.ADD_ERROR:
			return update(state, {messages:{$merge: {[action.key]: {msg: action.msg, type: 'error'}}}})
		case types.CLEAR_ERROR:
			return update(state, {messages:{$unset: [action.key]}})
		case types.CLEAR_ERRORS:
			return update(state, {messages:{$set: {}}})
		default:
			return state
	}
}
