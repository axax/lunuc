import * as types from '../constants/ActionTypes'


export default function notification(state = null, action) {
    switch (action.type) {
        case types.ADD_NOTIFICATION:
            return {key: action.key, message: action.message}
        default:
            return state
    }
}
