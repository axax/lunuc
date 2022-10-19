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

export default function App(props) {
    const globalDefaultState = {
        user:{isAuthenticated:false},
        networkStatus:{loading:false},
        messages:{},
        notifications:[],
        cmsRender:null
    }
    const reducerFn = (state, action) => {
        const {type, payload} = action
        switch (type) {
            case 'NETWORK_STATUS':
                return Object.assign({},state,{networkStatus:payload})
            case 'CMS_RENDER':
                return Object.assign({},state,{cmsRender:payload})
            case 'MESSAGE':
                let messages = state.messages
                if(payload.add){
                    messages[payload.add.key] = payload.add
                }
                if(payload.remove){
                    delete messages[payload.remove]
                }
                if(payload.removeAll){
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
                return Object.assign({},state,{messages:{},user:{userData:payload,isAuthenticated:!!payload}})
            default:
                return state
        }
    }


    const [state, dispatch] = useReducer(reducerFn, globalDefaultState)

    _app_.dispatcher = {
        dispatch,
        setUser:(user)=>{
            _app_.user = user
            dispatch({type: 'LOGIN', payload: user})
        },
        addError:(add) =>{
            dispatch({type:'MESSAGE',payload:{add}})
        },
        addNotification:(payload) =>{
            dispatch({type:'NOTIFICATION',payload})
        }
    }

  /*  setTimeout(()=>{
     //   _app_.dispatcher.dispatch({type:'NOTIFICATION',payload:{add:{key:'sss',msg:'xxxx'}}})
    },1000)*/
    return <AppContext.Provider value={{state}}>
            {props.children ||
            <UserDataContainer>
                <Routes/>
            </UserDataContainer>}
        </AppContext.Provider>
}
