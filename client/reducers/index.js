import {combineReducers} from 'redux'
import errorHandler from './ErrorHandlerReducer'
import networkStatusHandler from './NetworkStatusReducer'
import user from './UserReducer'

export default combineReducers({
    errorHandler,
    networkStatusHandler,
    user
})
