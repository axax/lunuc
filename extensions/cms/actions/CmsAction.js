import * as types from '../constants/ActionTypes'

export const editCmsComponent = (key, json, scope) => ({
	type: types.CMS_EDIT_COMPONENT,
    key,
    json,
    scope
})

export const editCmsData = (editData) => ({
	type: types.CMS_EDIT_DATA,
    editData
})
