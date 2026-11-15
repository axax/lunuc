import React, {useEffect, useState} from 'react'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'
import {actions, getPush, getRoomPicture, getRoomTitle, notificationPermission} from '../util/chatStore'
import {Avatar, Icon, IconButton, Modal, Switch} from './common'

const QUERY_USERS = 'query chatUsers{chatUsers{_id username picture}}'

/* users that can be added to a chat: same user group (any role), see chatUserMatch in the resolver */
const useUsers = () => {
    const [users, setUsers] = useState(null)
    useEffect(() => {
        let active = true
        client.query({query: QUERY_USERS, fetchPolicy: 'no-cache'}).then(r => {
            if (active) setUsers(r.data.chatUsers || [])
        }).catch(() => active && setUsers([]))
        return () => {
            active = false
        }
    }, [])
    return users
}

const UserList = ({users, exclude = [], selected, onToggle}) => {
    const [search, setSearch] = useState('')
    const needle = search.trim().toLowerCase()
    const list = (users || []).filter(u => exclude.indexOf(u._id) < 0 && (!needle || u.username.toLowerCase().indexOf(needle) >= 0))
    return <>
        <div className="lchat-search">
            <Icon name="search" size={18}/>
            <input type="search" autoFocus value={search} placeholder={_t('Chat.searchUser')} onChange={e => setSearch(e.target.value)}/>
        </div>
        <div className="lchat-userlist">
            {!users && <div className="lchat-empty">{_t('Chat.loading')}</div>}
            {users && list.length === 0 && <div className="lchat-empty">{_t('Chat.noUsers')}</div>}
            {list.map(u => <button type="button" key={u._id} className={'lchat-user' + (selected && selected.indexOf(u._id) >= 0 ? ' is-selected' : '')}
                                   onClick={() => onToggle(u)}>
                <Avatar name={u.username} picture={u.picture} size={40}/>
                <span>{u.username}</span>
                {selected && <span className="lchat-checkbox"><Icon name="check" size={16}/></span>}
            </button>)}
        </div>
    </>
}

export const NewChatDialog = ({onClose, onCreated}) => {
    const users = useUsers()
    const [group, setGroup] = useState(false)
    const [selected, setSelected] = useState([])
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)

    const create = (data) => {
        setBusy(true)
        actions.createRoom(data).then(room => {
            onCreated(room._id)
        }).catch(() => setBusy(false))
    }

    return <Modal title={group ? _t('Chat.newGroup') : _t('Chat.newChat')} onClose={onClose}
                  footer={group && <button type="button" className="lchat-btn" disabled={busy || !name.trim() || !selected.length}
                                           onClick={() => create({name: name.trim(), users: selected})}>
                      {_t('Chat.createGroup')} ({selected.length})</button>}>
        {group ? <input className="lchat-input" value={name} maxLength={100} placeholder={_t('Chat.groupName')}
                        onChange={e => setName(e.target.value)}/> :
            <button type="button" className="lchat-user" onClick={() => setGroup(true)}>
                <span className="lchat-avatar lchat-avatar--accent" style={{width: 40, height: 40}}><Icon name="groupAdd" size={22}/></span>
                <span>{_t('Chat.newGroup')}</span>
            </button>}
        <UserList users={users} selected={group ? selected : null} onToggle={u => {
            if (group) {
                setSelected(selected.indexOf(u._id) >= 0 ? selected.filter(id => id !== u._id) : [...selected, u._id])
            } else if (!busy) {
                create({users: [u._id], direct: true})
            }
        }}/>
    </Modal>
}

export const SettingsDialog = ({settings, onClose}) => {
    const [permission, setPermission] = useState(notificationPermission())
    const set = key => value => actions.setSettings({[key]: value})
    const [push, setPush] = useState(null) // status of web push on this device
    const [pushBusy, setPushBusy] = useState(false)
    const [testResult, setTestResult] = useState(null)
    const loadPush = () => getPush().getStatus().then(setPush).catch(() => setPush({state: 'unsupported'}))
    useEffect(() => {
        if (getPush()) loadPush()
    }, [])
    const pushHint = !push ? _t('Chat.loading') :
        push.state === 'unsupported' ? _t('Chat.push.unsupported') :
            push.state === 'no-serviceworker' ? _t('Chat.push.noServiceWorker') :
                push.state === 'denied' ? _t('Chat.notify.denied') :
                    _t('Chat.push.hint') + (push.devices ? ' ' + _t('Chat.push.devices', {count: push.devices}) : '')
    const hint = permission === 'unsupported' ? _t('Chat.notify.unsupported') :
        permission === 'denied' ? _t('Chat.notify.denied') : _t('Chat.notify.hint')

    return <Modal title={_t('Chat.settings')} onClose={onClose}>
        <div className="lchat-section">{_t('Chat.settings.notifications')}</div>
        <Switch label={_t('Chat.notify.desktop')} hint={hint}
                checked={settings.notify && permission === 'granted'}
                disabled={permission === 'unsupported' || permission === 'denied'}
                onChange={on => {
                    if (on) {
                        actions.enableNotifications().then(setPermission)
                    } else {
                        actions.setSettings({notify: false})
                    }
                }}/>
        {getPush() && <Switch label={_t('Chat.push.label')} hint={pushHint} checked={!!(push && push.subscribed)}
                              disabled={!push || pushBusy || ['unsupported', 'no-serviceworker', 'denied'].indexOf(push.state) >= 0}
                              onChange={on => {
                                  setPushBusy(true)
                                  actions.setPush(on).catch(e => console.warn('push', e)).then(() => {
                                      setPermission(notificationPermission())
                                      return loadPush()
                                  }).then(() => setPushBusy(false))
                              }}/>}
        {push && push.subscribed && <div className="lchat-inline">
            <button type="button" className="lchat-link" onClick={() => getPush().test().then(count => setTestResult(count)).catch(() => setTestResult(0))}>
                {_t('Chat.push.test')}</button>
            {testResult !== null && <small>{_t('Chat.push.testResult', {count: testResult})}</small>}
        </div>}
        <Switch label={_t('Chat.notify.preview')} hint={_t('Chat.notify.previewHint')} checked={settings.preview} onChange={set('preview')}/>
        <Switch label={_t('Chat.notify.sound')} checked={settings.sound} onChange={set('sound')}/>
        <div className="lchat-section">{_t('Chat.settings.appearance')}</div>
        <div className="lchat-options">
            {['whatsapp', 'theme'].map(key =>
                <button type="button" key={key} className={'lchat-option lchat-option--' + key + (settings.accent === key ? ' is-active' : '')}
                        onClick={() => actions.setSettings({accent: key})}>
                    <span className="lchat-option-preview"><i/><i/></span>
                    {_t('Chat.accent.' + key)}
                </button>)}
        </div>
        <Switch label={_t('Chat.wallpaper')} checked={settings.wallpaper} onChange={set('wallpaper')}/>
        <div className="lchat-section">{_t('Chat.settings.input')}</div>
        <Switch label={_t('Chat.enterSend')} hint={_t('Chat.enterSendHint')} checked={settings.enterSend} onChange={set('enterSend')}/>
    </Modal>
}

export const RoomInfo = ({room, onClose, onLeft}) => {
    const users = useUsers()
    const myId = _app_.user._id
    const [adding, setAdding] = useState(false)
    const [name, setName] = useState(null)
    const title = getRoomTitle(room)
    const isCreator = room.createdBy === myId
    const memberIds = room.users.map(u => u._id)
    const confirmThen = (text, fn) => {
        // eslint-disable-next-line no-alert
        if (window.confirm(text)) fn()
    }

    return <div className="lchat-info">
        <div className="lchat-bar">
            <IconButton icon="close" title={_t('Chat.close')} onClick={onClose}/>
            <span className="lchat-bar-title">{room.direct ? _t('Chat.contactInfo') : _t('Chat.groupInfo')}</span>
        </div>
        <div className="lchat-info-body">
            <div className="lchat-info-head">
                <Avatar name={title} picture={getRoomPicture(room)} group={!room.direct} size={120}/>
                {name === null ? <div className="lchat-info-title">
                    <span>{title}</span>
                    {!room.direct && <IconButton icon="edit" size={18} title={_t('Chat.rename')} onClick={() => setName(room.name)}/>}
                </div> : <form className="lchat-info-title" onSubmit={e => {
                    e.preventDefault()
                    if (name.trim() && name.trim() !== room.name) actions.renameRoom(room._id, name.trim())
                    setName(null)
                }}>
                    <input className="lchat-input" autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)}
                           onKeyDown={e => e.key === 'Escape' && setName(null)}/>
                    <IconButton icon="check" title={_t('Chat.save')} onClick={e => e.currentTarget.form.requestSubmit()}/>
                </form>}
                {!room.direct && <small>{_t('Chat.members', {count: room.users.length})}</small>}
            </div>

            <Switch label={_t('Chat.mute')} hint={_t('Chat.muteHint')} checked={!!room.muted}
                    onChange={() => actions.toggleMute(room._id)}/>

            {!room.direct && <>
                <div className="lchat-section">{_t('Chat.members', {count: room.users.length})}</div>
                <button type="button" className="lchat-user" onClick={() => setAdding(true)}>
                    <span className="lchat-avatar lchat-avatar--accent" style={{width: 40, height: 40}}><Icon name="personAdd" size={22}/></span>
                    <span>{_t('Chat.addMember')}</span>
                </button>
                {room.users.map(u => <div className="lchat-user" key={u._id}>
                    <Avatar name={u.username} picture={u.picture} size={40}/>
                    <span>{u._id === myId ? _t('Chat.you') : u.username}</span>
                    {u._id === room.createdBy && <small className="lchat-tag">{_t('Chat.admin')}</small>}
                    {isCreator && u._id !== myId &&
                        <IconButton icon="close" size={18} title={_t('Chat.removeMember')}
                                    onClick={() => confirmThen(_t('Chat.removeMemberConfirm', {user: u.username}), () => actions.removeUser(room._id, u._id))}/>}
                </div>)}
            </>}

            <div className="lchat-section"/>
            {!room.direct && <button type="button" className="lchat-user is-danger"
                                     onClick={() => confirmThen(_t('Chat.leaveConfirm'), () => actions.removeUser(room._id, myId).then(onLeft))}>
                <Icon name="logout"/><span>{_t('Chat.leave')}</span>
            </button>}
            {(isCreator || room.direct) && <button type="button" className="lchat-user is-danger"
                                   onClick={() => confirmThen(_t('Chat.deleteConfirm'), () => actions.deleteRoom(room._id).then(onLeft))}>
                <Icon name="trash"/><span>{_t('Chat.deleteChat')}</span>
            </button>}
        </div>
        {adding && <Modal title={_t('Chat.addMember')} onClose={() => setAdding(false)}>
            <UserList users={users} exclude={memberIds} onToggle={u => {
                actions.addUser(room._id, u._id)
                setAdding(false)
            }}/>
        </Modal>}
    </div>
}
