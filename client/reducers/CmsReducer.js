import * as types from '../constants/ActionTypes'


export default function cms(state = {edit: {key: null, component: {}, scope: null}}, action) {
    switch (action.type) {
        case types.CMS_EDIT_COMPONENT:
            return {...state, edit: {key: action.key, component: action.component, scope: action.scope}}
        default:
            return state
    }
}
