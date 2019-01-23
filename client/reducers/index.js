import {combineReducers} from 'redux'
import errorHandler from './ErrorHandlerReducer'
import notification from './NotificationReducer'
import networkStatusHandler from './NetworkStatusReducer'
import user from './UserReducer'
import cms from './CmsReducer'

export default combineReducers({
    errorHandler,
    notification,
    networkStatusHandler,
    user,
    cms
})
