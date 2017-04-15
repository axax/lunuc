import {createStore, compose, applyMiddleware} from 'redux'
import {persistStore, autoRehydrate} from 'redux-persist'

import rootReducer from '../reducers/index'
import { client } from '../middleware/index'


// Example of a middleware logger
function logger({ getState }) {
	return (next) => (action) => {
		//console.log('will dispatch', action)

		// Call the next dispatch method in the middleware chain.
		let returnValue = next(action)

		//console.log('state after dispatch', getState())

		// This will likely be the action itself, unless
		// a middleware further in chain changed it.
		return returnValue
	}
}



// Enhander for Redux DevTools Extension
const composeEnhancers =
	typeof window === 'object' &&
	window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ ?
		window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({
			// Specify extension’s options like name, actionsBlacklist, actionsCreators, serialize...
		}) : compose


export default function configureStore(initialState) {
	const store = createStore(rootReducer, initialState, composeEnhancers(
		applyMiddleware(
			logger,
			client.middleware() // apollo client middleware
		),
		autoRehydrate()
	))

	// begin periodically persisting the store
	persistStore(store, {blacklist: ['keyvalue']}, () => {
		console.log('rehydration complete')
	})

	return store
}
