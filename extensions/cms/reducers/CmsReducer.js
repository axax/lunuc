import * as types from '../constants/ActionTypes'


export default function cms(state = {render: null}, action) {
    switch (action.type) {
        case types.CMS_RENDER:
            return {...state, render: {props: action.props, time: action.time, slug: action.slug, id: action.id}}
        default:
            return state
    }
}
