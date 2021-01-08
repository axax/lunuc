import * as types from '../constants/ActionTypes'

export const editTemplate = (key, json, scope) => ({
	type: types.CMS_EDIT_TEMPLATE,
    key,
    json,
    scope
})

export const editCmsData = (editData) => ({
	type: types.CMS_EDIT_DATA,
    editData
})
