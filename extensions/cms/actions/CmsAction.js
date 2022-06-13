import * as types from '../constants/ActionTypes'

export const cmsRender = (props, {slug, id, time}) => ({
    type: types.CMS_RENDER,
    props,
    slug,
    id,
    time
})
