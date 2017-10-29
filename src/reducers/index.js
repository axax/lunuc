import {combineReducers} from 'redux'
import errorHandler from './ErrorHandlerReducer'
import user from './UserReducer'
import {client} from '../middleware/'
import Environment from '../environment'
import { createTransform, persistCombineReducers } from 'redux-persist'
import storage from 'redux-persist/es/storage' // default: localStorage if web, AsyncStorage if react-native


let rootReducer
if( Environment.REDUX_PERSIST ){

    const transform = createTransform(
        (state, key) => {

            if (state.optimistic.length > 0) {
                console.log('optimistic call')
                return
            }

            return state
        },
        (state, key) => {
            let newState = Object.assign({}, state)

            // Filter some queries we don't want to persist
            newState.data = Object.keys(state.data)
                .filter(key => (
                        key.indexOf('$ROOT_QUERY.login') < 0 &&
                        key.indexOf('ROOT_QUERY.notification') < 0 &&
                        key.indexOf('ROOT_SUBSCRIPTION.notification') < 0
                    )
                )
                .reduce((res, key) => (res[key] = state.data[key], res), {})

            return newState
        },
        {whitelist: ['remote']}
    )

    rootReducer = persistCombineReducers({
        key: 'root',
        storage,
        transforms: [transform],
        blacklist: ['keyvalue', 'errorHandler', 'user']
    }, {
        errorHandler,
        user,
        remote: client.reducer()
    })
}else{
    rootReducer = combineReducers({
        errorHandler,
        user,
        remote: client.reducer()
    })
}


export default rootReducer
