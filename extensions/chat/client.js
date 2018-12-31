import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const ChatContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "chat" */ './containers/ChatContainer')} />
const ChatIcon = (props) => <Async {...props} expose="ChatIcon" load={import(/* webpackChunkName: "chat" */ '../../gensrc/ui/admin')} />

export default () => {

    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: ADMIN_BASE_URL + '/chat/:id*', component: ChatContainer})
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Chats', to: ADMIN_BASE_URL + '/chat', auth: true, icon: <ChatIcon />})
    })
}