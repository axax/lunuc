import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {CHAT_BASE_URL}  from './constants'
import {_t, registerTrs} from '../../util/i18n.mjs'
import ChatHeaderButton from './components/ChatHeaderButton'
import {getChatState, getUnreadTotal} from './util/chatStore'
import {translations} from './translations/admin'

const ChatIcon = (props) => <Async {...props} expose="ChatIcon" load={() =>import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')} />


registerTrs({
    de:{
        'chat.title': 'Messenger'
    },
    en:{
        'chat.title': 'Messenger'
    }
}, 'chatbase')
// also needed outside of the messenger page (notifications)
registerTrs(translations, 'ChatContainer')

export default () => {

    // add entry to main menu
    Hook.on('UserMenu', ({menuItems}) => {
        const unread = getUnreadTotal(getChatState())
        menuItems.splice(2, 0, {name: _t('chat.title') + (unread ? ` (${unread})` : ''), onClick: ()=> {
                _app_.history.push(CHAT_BASE_URL)
            }, icon: <ChatIcon />})
    })

    // messenger icon with unread counter in the header (also receives the notifications)
    Hook.on('HeaderRight', ({headerRight}) => {
        headerRight.push(<ChatHeaderButton key="chatHeaderButton"/>)
    })

}
