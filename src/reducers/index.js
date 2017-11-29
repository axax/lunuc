import {combineReducers} from 'redux'
import errorHandler from './ErrorHandlerReducer'
import user from './UserReducer'
import {client} from '../middleware/'

export default combineReducers({
    errorHandler,
    user
})
