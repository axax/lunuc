import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import {CHAT_BASE_URL}  from './constants'

const ChatContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "chat" */ './containers/ChatContainer')} />
const ChatIcon = (props) => <Async {...props} expose="ChatIcon" load={import(/* webpackChunkName: "chat" */ '../../gensrc/ui/admin')} />

export default () => {

    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: CHAT_BASE_URL + '/:id*', component: ChatContainer})
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Chats', to: CHAT_BASE_URL, auth: true, icon: <ChatIcon />})
    })
}