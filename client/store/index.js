//import {getReducers} from '../reducers/index'

let store

export const getStore = (initialState) => {

	/*const store = createStore(rootReducer, initialState, composeEnhancers(
		applyMiddleware(
            reduxLogger
		)
	))*/
	if(!store) {
   //     store = createStore(getReducers(), initialState)
    }

    return store
}
