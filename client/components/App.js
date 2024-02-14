import React, {useReducer} from 'react'
import Routes from './routing/Routes'
import UserDataContainer from 'client/containers/UserDataContainer'

/*
 * The Provider component provides
 * the React store to all its child
 * components so we don't need to pass
 * it explicitly to all the components.
 */
import {AppContext} from './AppContext'

/*setTimeout(()=>{
    _app_.dispatcher.dispatch({type:'MESSAGE',payload:{add:{key:'sss',msg:'xxxx'}}})
},1000)*/

/*setTimeout(()=>{
    _app_.dispatcher.dispatch({type:'NOTIFICATION',payload:{message:'test'}})
},1000)
**/

export default function App(props) {
    const globalDefaultState = {
        user:{isAuthenticated:false},
        networkStatus:{loading:false},
        messages:{},
        notifications:[]
    }
    const reducerFn = (state, action) => {
        const {type, payload} = action
        switch (type) {
            case 'NETWORK_STATUS':
                return Object.assign({},state,{networkStatus:payload})
            case 'MESSAGE':
                let messages = state.messages
                if(payload.add){
                    messages[payload.add.key] = payload.add
                }
                if(payload.remove){
                    if(!messages[payload.remove]){
                        return state
                    }
                    delete messages[payload.remove]
                }
                if(payload.removeAll){
                    if(Object.keys(messages).length===0){
                        return state
                    }
                    messages = {}
                }
                return Object.assign({},state,{messages})
            case 'NOTIFICATION':
                const notifications = state.notifications
                if(payload) {
                    notifications.push(payload)
                }else{
                    notifications.shift()
                }
                return Object.assign({},state,{notifications})
            case 'LOGIN':
                const user = Object.assign({},payload, {
                    isAuthenticated:!!payload, /* attribute is deprecated */
                    userData: payload /* attribute is deprecated */
                })
                return Object.assign({},state,{messages:{},user:user})
            default:
                return state
        }
    }


    const [state, dispatch] = useReducer(reducerFn, globalDefaultState)

    _app_.dispatcher = {
        dispatch,
        setUser:(user)=>{
            dispatch({type: 'LOGIN', payload: user})
        },
        addError:(add) =>{
            dispatch({type:'MESSAGE',payload:{add}})
        },
        addNotification:(payload) =>{
            dispatch({type:'NOTIFICATION',payload})
        }
    }

    // set user to our global _app_ context
    _app_.user = state.user

    //console.log('App render', state)
    return <AppContext.Provider value={{state}}>
            {props.children ||
            <UserDataContainer>
                <Routes/>
            </UserDataContainer>}
        </AppContext.Provider>
}
