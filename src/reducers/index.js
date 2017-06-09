import {combineReducers} from 'redux'
import keyvalue from './KeyValueReducer'
import errorHandler from './ErrorHandlerReducer'
import user from './UserReducer'
import {client} from '../middleware/'


const rootReducer = combineReducers({
	keyvalue,
	errorHandler,
	user,
	remote: client.reducer()
})

export default rootReducer
