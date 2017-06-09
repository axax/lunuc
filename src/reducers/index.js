import {combineReducers} from 'redux'
import errorHandler from './ErrorHandlerReducer'
import user from './UserReducer'
import {client} from '../middleware/'


const rootReducer = combineReducers({
	errorHandler,
	user,
	remote: client.reducer()
})

export default rootReducer
