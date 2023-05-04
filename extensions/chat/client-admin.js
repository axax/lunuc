import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {CHAT_BASE_URL}  from './constants'
import {_t, registerTrs} from '../../util/i18n.mjs'

const ChatIcon = (props) => <Async {...props} expose="ChatIcon" load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')} />


registerTrs({
    de:{
        'chat.title': 'Messenger'
    },
    en:{
        'chat.title': 'Messenger'
    }
}, 'chatbase')

export default () => {

    // add entry to main menu
    Hook.on('UserMenu', ({menuItems}) => {
        menuItems.unshift({name: _t('chat.title'), onClick: ()=> {
                _app_.history.push(CHAT_BASE_URL)
            }, icon: <ChatIcon />})
    })

}
