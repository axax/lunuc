import React, {useState} from 'react'
import {_t} from '../../../util/i18n.mjs'
import {getRoomPicture, getRoomTitle, messagePreview} from '../util/chatStore'
import {formatListTime, messageDate} from '../util/chatUtil'
import {Avatar, Icon, IconButton} from './common'

export const Ticks = ({msg, room}) => {
    if (msg.failed) return <span className="lchat-ticks is-failed" title={msg.failed}><Icon name="error" size={16}/></span>
    if (msg.pending) return <span className="lchat-ticks"><Icon name="clock" size={14}/></span>
    const others = (room.users || []).filter(u => u && u._id !== msg.createdBy._id)
    const readers = others.filter(u => (msg.readBy || []).indexOf(u._id) >= 0)
    const all = others.length > 0 && readers.length === others.length
    const title = readers.length ? _t('Chat.readBy', {users: readers.map(u => u.username).join(', ')}) : _t('Chat.sent')
    return <span className={'lchat-ticks' + (all ? ' is-read' : '')} title={title}>
        <Icon name={readers.length ? 'checkAll' : 'check'} size={16}/>
    </span>
}

const ChatSidebar = ({state, selectedId, onSelect, onNewChat, onSettings, onLogout, banner}) => {
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('all')
    const myId = _app_.user._id
    const {rooms, typing} = state
    const needle = search.trim().toLowerCase()

    const visible = rooms.filter(room => {
        if (filter === 'unread' && !room.unread) return false
        if (filter === 'groups' && room.direct) return false
        if (!needle) return true
        return getRoomTitle(room).toLowerCase().indexOf(needle) >= 0 ||
            (room.users || []).some(u => u && u.username.toLowerCase().indexOf(needle) >= 0) ||
            messagePreview(room.lastMessage).toLowerCase().indexOf(needle) >= 0
    })

    return <div className="lchat-side">
        <div className="lchat-bar">
            <Avatar name={_app_.user.username} picture={_app_.user.picture} size={36}/>
            <span className="lchat-bar-title">{_t('Chat.title')}</span>
            <IconButton icon="newChat" title={_t('Chat.newChat')} onClick={onNewChat}/>
            <IconButton icon="settings" title={_t('Chat.settings')} onClick={onSettings}/>
            <IconButton icon="logout" title={_t('Chat.logout')} onClick={onLogout}/>
        </div>
        {banner}
        <div className="lchat-search">
            <Icon name="search" size={18}/>
            <input type="search" value={search} placeholder={_t('Chat.search')} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="lchat-chips">
            {['all', 'unread', 'groups'].map(key =>
                <button type="button" key={key} className={'lchat-chip' + (filter === key ? ' is-active' : '')}
                        onClick={() => setFilter(key)}>{_t('Chat.filter.' + key)}</button>)}
        </div>
        <div className="lchat-list" role="list">
            {!state.ready && <div className="lchat-empty">{_t('Chat.loading')}</div>}
            {state.error && <div className="lchat-empty is-error">{state.error}</div>}
            {state.ready && !state.error && visible.length === 0 &&
                <div className="lchat-empty">
                    {rooms.length === 0 ? _t('Chat.noChats') : _t('Chat.noResults')}
                    {rooms.length === 0 && <button type="button" className="lchat-btn" onClick={onNewChat}>{_t('Chat.newChat')}</button>}
                </div>}
            {visible.map(room => {
                const last = room.lastMessage
                const title = getRoomTitle(room)
                const typers = Object.values(typing[room._id] || {})
                const mine = last && last.createdBy._id === myId
                return <button type="button" role="listitem" key={room._id}
                               className={'lchat-item' + (selectedId === room._id ? ' is-active' : '')}
                               onClick={() => onSelect(room._id)}>
                    <Avatar name={title} picture={getRoomPicture(room)} group={!room.direct} size={48}/>
                    <span className="lchat-item-main">
                        <span className="lchat-item-row">
                            <span className="lchat-item-title">{title}</span>
                            {last && <span className={'lchat-item-time' + (room.unread ? ' is-unread' : '')}>{formatListTime(messageDate(last))}</span>}
                        </span>
                        <span className="lchat-item-row">
                            <span className="lchat-item-text">
                                {typers.length ? <em>{room.direct ? _t('Chat.typing') : _t('Chat.typingUser', {user: typers[0]})}</em> : last ? <>
                                    {mine && !last.deleted && <Ticks msg={last} room={room}/>}
                                    {!room.direct && !mine && <span>{last.createdBy.username}: </span>}
                                    {messagePreview(last)}
                                </> : <span>{_t('Chat.noMessages')}</span>}
                            </span>
                            {room.muted && <Icon name="bellOff" size={16}/>}
                            {room.unread > 0 && <span className={'lchat-badge' + (room.muted ? ' is-muted' : '')}>{room.unread > 99 ? '99+' : room.unread}</span>}
                        </span>
                    </span>
                </button>
            })}
        </div>
    </div>
}

export default ChatSidebar
