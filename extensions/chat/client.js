import React from 'react'
import Hook from 'util/hook.cjs'
import {lazy} from 'client/components/Async'
import {CHAT_BASE_URL}  from './constants'

const ChatContainer = lazy(() => import(/* webpackChunkName: "chat" */ './containers/ChatContainer'))

export default () => {
    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: CHAT_BASE_URL + '/:id*', layout:'base', layoutProps: {contentStyle:{padding:0}}, component: ChatContainer})
    })

    // in a CmsPage: {"t": "ChatContainer"} (optional "p": {"height": "600px"}), see dbscripts/cmspages/system/messenger
    Hook.on('JsonDom', ({components}) => {
        components['ChatContainer'] = ChatContainer
    })
}
