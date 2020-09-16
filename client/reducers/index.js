import {combineReducers} from 'redux'
import Hook from '../../util/hook'
import errorHandler from './ErrorHandlerReducer'
import notification from './NotificationReducer'
import networkStatusHandler from './NetworkStatusReducer'
import user from './UserReducer'


const reducers = {
    errorHandler,
    notification,
    networkStatusHandler,
    user
}

export const getReducers = ()=>{
    Hook.call('reducer', {reducers})

    return combineReducers(reducers)
}
