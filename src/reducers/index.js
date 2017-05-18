import {combineReducers} from 'redux'
import keyvalue from './KeyValueReducer'
import errorHandler from './ErrorHandlerReducer'
import {client} from '../middleware/'


const rootReducer = combineReducers({
	keyvalue,
	errorHandler,
	remote: client.reducer()
})

export default rootReducer
