import React from 'react'
import Hook from 'util/hook.cjs'
import {lazy} from 'client/components/Async'
import {CHAT_BASE_URL}  from './constants'

const ChatContainer = lazy(() => import(/* webpackChunkName: "admin" */ './containers/ChatContainer'))

export default () => {
    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: CHAT_BASE_URL + '/:id*', layout:'base', layoutProps: {contentStyle:{padding:0}}, component: ChatContainer})
    })

    Hook.on('JsonDom', ({components}) => {
        components['ChatContainer'] = ChatContainer
    })
}
