import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {CHAT_BASE_URL}  from './constants'

const ChatContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ './containers/ChatContainer')} />

export default () => {
    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: CHAT_BASE_URL + '/:id*', layout:'base', layoutProps: {contentStyle:{padding:0}}, component: ChatContainer})
    })

    Hook.on('JsonDom', ({components}) => {
        components['ChatContainer'] = ChatContainer
    })
}
