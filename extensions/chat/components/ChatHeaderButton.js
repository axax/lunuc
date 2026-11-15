import React from 'react'
import {_t} from '../../../util/i18n.mjs'
import {CHAT_BASE_URL} from '../constants'
import {getUnreadTotal, useChatStore} from '../util/chatStore'
import {Icon} from './common'

const buttonStyle = {
    position: 'relative', width: 40, height: 40, padding: 8, border: 'none', borderRadius: '50%',
    background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'inline-flex'
}
const badgeStyle = {
    position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box',
    borderRadius: 9, background: '#25d366', color: '#fff', font: '600 11px/18px sans-serif', textAlign: 'center'
}

/* messenger icon with unread counter in the admin header; mounting it also starts the
   subscription, so notifications arrive on every admin page */
const ChatHeaderButton = () => {
    const state = useChatStore()
    const total = getUnreadTotal(state)
    const title = _t('chat.title') + (total ? ` (${total})` : '')
    return <button type="button" style={buttonStyle} title={title} aria-label={title}
                   onClick={() => _app_.history.push(CHAT_BASE_URL)}>
        <Icon name="chat"/>
        {total > 0 && <span style={badgeStyle}>{total > 99 ? '99+' : total}</span>}
    </button>
}

export default ChatHeaderButton
