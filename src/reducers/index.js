import {combineReducers} from 'redux'
import keyvalue from './KeyValueReducer'
import {client} from '../middleware/'


const rootReducer = combineReducers({
	keyvalue,
	remote: client.reducer()
})

export default rootReducer
