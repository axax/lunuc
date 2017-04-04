import * as types from '../constants/ActionTypes'
import { fromJS} from 'immutable'

// In Immutable Maps JavaScript Object properties are always strings
const initialState = fromJS({
	pairs: {
		key: 'value'
	}
})

export default function keyvalue(state = initialState, action) {
	switch (action.type) {
		case types.KEYVALUE_SET:
			return state.updateIn(['pairs'], map => map.set(action.key, action.value))
		default:
			return state
	}
}
