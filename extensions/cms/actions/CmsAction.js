import * as types from '../constants/ActionTypes'

export const editCmsComponent = (key, json, scope) => ({
	type: types.CMS_EDIT_COMPONENT,
    key,
    json,
    scope
})