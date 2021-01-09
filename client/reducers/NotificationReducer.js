export default function notification(state = null, action) {
    switch (action.type) {
        case 'ADD_NOTIFICATION':
            return {key: action.key, message: action.message}
        default:
            return state
    }
}
