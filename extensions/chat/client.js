import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const ChatContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "chat" */ './containers/ChatContainer')} />
// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/chat/:id*', component: ChatContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'My chats', to: ADMIN_BASE_URL+'/chat', auth: true})
})