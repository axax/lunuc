import * as types from '../constants/ActionTypes'


export default function cmsEditor(state = {editData:null,edit: {key: null, json: {}, scope: null}}, action) {
    switch (action.type) {
        case types.CMS_EDIT_TEMPLATE:
            return {...state, edit: {key: action.key, json: action.json, scope: action.scope}}
        case types.CMS_EDIT_DATA:
            return {...state, editData: action.editData}
        default:
            return state
    }
}
