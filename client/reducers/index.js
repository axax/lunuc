import {combineReducers} from 'redux'
import errorHandler from './ErrorHandlerReducer'
import user from './UserReducer'

export default combineReducers({
    errorHandler,
    user
})
