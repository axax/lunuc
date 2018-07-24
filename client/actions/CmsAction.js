import * as types from '../constants/ActionTypes'

export const editCmsComponent = (key, component) => ({
	type: types.CMS_EDIT_COMPONENT,
    key,
    component
})