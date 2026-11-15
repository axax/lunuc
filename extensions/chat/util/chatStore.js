/*
 * Client state of the messenger (admin/chat).
 * One instance per window: it is started by the admin header (unread badge, notifications)
 * and used by the ChatContainer. Server api: see ../resolver/index.js
 */
import {useEffect, useState} from 'react'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'
import {CHAT_BASE_URL} from '../constants'

const MSG = '_id chat message replyTo reactions edited deleted nonce readBy createdBy{_id username picture} media{_id name mimeType}'
const ROOM = `_id name direct createdBy unread muted users{_id username picture} lastMessage{${MSG}}`

const Q_ROOMS = `query chatRooms{chatRooms{${ROOM}}}`
const Q_MESSAGES = `query chatRoomMessages($chat:ID!,$before:ID,$limit:Int){chatRoomMessages(chat:$chat,before:$before,limit:$limit){${MSG}}}`
const M_SEND = `mutation chatSend($chat:ID!,$message:String,$replyTo:ID,$media:[ID],$nonce:String){chatSend(chat:$chat,message:$message,replyTo:$replyTo,media:$media,nonce:$nonce){${MSG}}}`
const M_EDIT = `mutation chatEdit($_id:ID!,$message:String!){chatEdit(_id:$_id,message:$message){${MSG}}}`
const M_DELETE = `mutation chatDelete($_id:ID!){chatDelete(_id:$_id){${MSG}}}`
const M_REACT = `mutation chatReact($_id:ID!,$emoji:String){chatReact(_id:$_id,emoji:$emoji){${MSG}}}`
const M_READ = `mutation chatMarkRead($chat:ID!){chatMarkRead(chat:$chat)}`
const M_MUTE = `mutation chatMute($chat:ID!,$muted:Boolean!){chatMute(chat:$chat,muted:$muted)}`
const M_TYPING = `mutation chatTyping($chat:ID!){chatTyping(chat:$chat)}`
const M_CREATE = `mutation chatCreateRoom($name:String,$users:[ID]!,$direct:Boolean){chatCreateRoom(name:$name,users:$users,direct:$direct){${ROOM}}}`
const M_RENAME = `mutation chatRenameRoom($chat:ID!,$name:String!){chatRenameRoom(chat:$chat,name:$name){${ROOM}}}`
const M_ADD_USER = `mutation chatAddUser($chat:ID!,$user:ID!){chatAddUser(chat:$chat,user:$user){${ROOM}}}`
const M_REMOVE_USER = `mutation chatRemoveUser($chat:ID!,$user:ID!){chatRemoveUser(chat:$chat,user:$user){${ROOM}}}`
const M_DELETE_ROOM = `mutation chatDeleteRoom($chat:ID!){chatDeleteRoom(chat:$chat)}`
const S_EVENT = `subscription subscribeChatEvent{subscribeChatEvent{type chat user username message{${MSG}} room{${ROOM}}}}`

const PAGE_SIZE = 50
const TYPING_TTL = 4000
const STALE_AFTER = 30000   // a cached conversation is loaded again when it is opened after this time
const AWAY_AFTER = 10000    // hidden / suspended for longer: the websocket may be dead, events were missed
const SETTINGS_KEY = 'lunuc.chat.settings'
const SOUND_LOCK_KEY = 'lunuc.chat.lastSound'
const HOME_KEY = 'lunuc.chat.home'

// url of a chat: the admin route, or the CmsPage the messenger is used on (setHome)
let home = null
export const getChatUrl = (chatId) => (home ? home + chatId : CHAT_BASE_URL + '/' + chatId)

const DEFAULT_SETTINGS = {
    notify: false,      // desktop notifications
    sound: true,        // sound for new messages
    preview: true,      // show the message text in notifications
    enterSend: true,    // enter sends, shift+enter = new line
    accent: 'whatsapp', // 'whatsapp' | 'theme'
    wallpaper: true
}

const loadSettings = () => {
    try {
        return {...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')}
    } catch (e) {
        return {...DEFAULT_SETTINGS}
    }
}

let state = {
    ready: false,
    error: null,
    rooms: [],
    messages: {},   // chatId -> {items (oldest first), hasMore, loading, loaded}
    typing: {},     // chatId -> {userId: username}
    activeChat: null,
    settings: loadSettings()
}

const listeners = new Set()
let started = false, subscription = null, lastRoomsLoad = 0, originalTitle = null
const typingTimers = {}, readTimers = {}
let lastTypingSent = 0

const me = () => (_app_.user && _app_.user._id ? String(_app_.user._id) : null)

const setState = (patch) => {
    state = {...state, ...patch}
    listeners.forEach(l => l(state))
    updateTitle()
}

const errorMessage = e => (e && e.error && e.error.message) || (e && e.message) || String(e)

const query = (q, variables) => client.query({query: q, variables, fetchPolicy: 'no-cache', silent: true}).then(r => r.data)
const mutate = (mutation, variables, silent) => client.mutate({mutation, variables, silent}).then(r => r.data)

/* ---------- helpers used by the ui ---------- */

export const getRoomTitle = (room) => {
    if (!room) return ''
    if (room.direct) {
        const other = (room.users || []).find(u => u && u._id !== me())
        if (other) return other.username
    }
    return room.name || ''
}

export const getRoomPicture = (room) => {
    if (room && room.direct) {
        const other = (room.users || []).find(u => u && u._id !== me())
        return other ? other.picture : null
    }
    return null
}

export const getUnreadTotal = (s = state) => s.rooms.reduce((sum, r) => sum + (r.muted ? 0 : (r.unread || 0)), 0)

export const messagePreview = (msg) => {
    if (!msg) return ''
    if (msg.deleted) return _t('Chat.deletedMessage')
    if (msg.message) return msg.message
    if (msg.media && msg.media.length) {
        const m = msg.media[0]
        return (m.mimeType && m.mimeType.indexOf('image') === 0 ? '📷 ' : '📎 ') + (m.name || _t('Chat.attachment'))
    }
    return ''
}

const sortRooms = rooms => rooms.slice().sort((a, b) => {
    const ka = a.lastMessage ? a.lastMessage._id : a._id, kb = b.lastMessage ? b.lastMessage._id : b._id
    // tmp ids ('#…') of pending messages are the newest
    if (ka[0] === '#' || kb[0] === '#') return ka[0] === kb[0] ? 0 : (ka[0] === '#' ? -1 : 1)
    return ka < kb ? 1 : ka > kb ? -1 : 0
})

const patchRoom = (chatId, fn) => {
    let found = false
    const rooms = state.rooms.map(r => {
        if (r._id === chatId) {
            found = true
            return {...r, ...fn(r)}
        }
        return r
    })
    if (found) setState({rooms: sortRooms(rooms)})
    return found
}

const patchMessages = (chatId, fn) => {
    const cur = state.messages[chatId]
    if (!cur) return
    setState({messages: {...state.messages, [chatId]: {...cur, ...fn(cur)}}})
}

const upsertMessage = (msg) => {
    patchMessages(msg.chat, cur => {
        const items = cur.items.slice()
        let idx = items.findIndex(m => m._id === msg._id)
        if (idx < 0 && msg.nonce) {
            idx = items.findIndex(m => m.nonce && m.nonce === msg.nonce)
        }
        if (idx >= 0) {
            items[idx] = msg
        } else {
            items.push(msg)
        }
        return {items}
    })
    patchRoom(msg.chat, r => {
        const last = r.lastMessage
        if (!last || last._id === msg._id || (msg.nonce && last.nonce === msg.nonce) || last._id[0] === '#' || msg._id[0] === '#' || msg._id > last._id) {
            return {lastMessage: msg}
        }
        return {}
    })
}

/* ---------- notifications ---------- */

const updateTitle = () => {
    if (typeof document === 'undefined') return
    const total = getUnreadTotal()
    const base = document.title.replace(/^\(\d+\+?\) /, '')
    const next = (total > 0 ? `(${total > 99 ? '99+' : total}) ` : '') + base
    if (document.title !== next) {
        document.title = next
    }
}

let audioCtx
const playSound = (id) => {
    try {
        // several admin tabs: only one of them plays the sound
        if (localStorage.getItem(SOUND_LOCK_KEY) === id) return
        localStorage.setItem(SOUND_LOCK_KEY, id)
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return
        audioCtx = audioCtx || new Ctx()
        if (audioCtx.state === 'suspended') audioCtx.resume()
        const t = audioCtx.currentTime
        ;[[880, 0], [1320, 0.12]].forEach(([freq, offset]) => {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain()
            osc.type = 'sine'
            osc.frequency.value = freq
            gain.gain.setValueAtTime(0.0001, t + offset)
            gain.gain.exponentialRampToValueAtTime(0.12, t + offset + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.22)
            osc.connect(gain)
            gain.connect(audioCtx.destination)
            osc.start(t + offset)
            osc.stop(t + offset + 0.25)
        })
    } catch (e) {
        // no sound (e.g. blocked until the first user interaction)
    }
}

export const notificationPermission = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

const isLooking = (chatId) => typeof document !== 'undefined' && !document.hidden && document.hasFocus() && state.activeChat === chatId

/* web push of the extension push (optional): notifications also arrive while the admin is closed */
export const getPush = () => (typeof _app_ !== 'undefined' && _app_.push) || null

const showNotification = (room, msg) => {
    const {settings} = state
    if (room.muted) return
    const push = getPush()
    if (push && push.isSubscribed()) {
        // the notification comes from the service worker (web push); the page only adds its
        // sound while the user is here, on another chat or page
        if (settings.sound && !document.hidden && document.hasFocus()) playSound(msg._id)
        return
    }
    if (settings.sound) playSound(msg._id)
    if (!settings.notify || notificationPermission() !== 'granted') return

    const title = getRoomTitle(room)
    const text = settings.preview ? messagePreview(msg) : _t('Chat.newMessage')
    const url = getChatUrl(room._id)
    const picture = msg.createdBy && msg.createdBy.picture
    const options = {
        body: (room.direct ? '' : msg.createdBy.username + ': ') + text,
        tag: 'lunuc-chat-' + room._id, // one notification per chat, also with several tabs
        renotify: true,
        icon: picture ? `/uploads/${picture}?format=jpeg&width=96&height=96` : '/favicon-192x192.png',
        data: {url}
    }
    try {
        const n = new Notification(title, options)
        n.onclick = () => {
            window.focus()
            _app_.history.push(url)
            n.close()
        }
    } catch (e) {
        // e.g. Chrome on Android only allows notifications through the service worker
        if (navigator.serviceWorker) {
            navigator.serviceWorker.ready.then(reg => reg.showNotification(title, options)).catch(() => {})
        }
    }
}

const rememberHome = () => {
    try {
        localStorage.setItem(HOME_KEY, home || '')
    } catch (e) {
    }
}

/* ---------- events from the server ---------- */

const setTyping = (chatId, userId, username) => {
    const key = chatId + userId
    clearTimeout(typingTimers[key])
    const cur = {...(state.typing[chatId] || {})}
    if (username) {
        cur[userId] = username
        typingTimers[key] = setTimeout(() => setTyping(chatId, userId, null), TYPING_TTL)
    } else {
        if (!cur[userId]) return
        delete cur[userId]
    }
    setState({typing: {...state.typing, [chatId]: cur}})
}

const onEvent = (event) => {
    if (!event) return
    const {type, chat, user, username, message, room} = event
    const myId = me()

    if (type === 'message' && message) {
        const known = state.rooms.find(r => r._id === chat)
        setTyping(chat, user, null)
        if (!known) {
            actions.loadRooms(true)
            return
        }
        const isNew = !(state.messages[chat] && state.messages[chat].items.find(m => m._id === message._id))
        upsertMessage(message)
        if (user !== myId && isNew) {
            if (isLooking(chat)) {
                actions.markRead(chat)
            } else {
                patchRoom(chat, r => ({unread: (r.unread || 0) + 1}))
                showNotification(known, message)
            }
        }
    } else if (type === 'edit' && message) {
        patchMessages(chat, cur => ({items: cur.items.map(m => (m._id === message._id ? message : m))}))
        patchRoom(chat, r => (r.lastMessage && r.lastMessage._id === message._id ? {lastMessage: message} : {}))
    } else if (type === 'read') {
        const addReader = m => (m.readBy && m.readBy.indexOf(user) < 0 ? {...m, readBy: [...m.readBy, user]} : m)
        patchMessages(chat, cur => ({items: cur.items.map(addReader)}))
        patchRoom(chat, r => ({
            ...(r.lastMessage ? {lastMessage: addReader(r.lastMessage)} : {}),
            ...(user === myId ? {unread: 0} : {})
        }))
    } else if (type === 'typing') {
        setTyping(chat, user, username)
    } else if (type === 'room' && room) {
        const existing = state.rooms.find(r => r._id === room._id)
        if (existing) {
            patchRoom(room._id, () => ({name: room.name, users: room.users, createdBy: room.createdBy, direct: room.direct}))
        } else {
            setState({rooms: sortRooms([room, ...state.rooms])})
        }
    } else if (type === 'roomRemoved') {
        removeRoomLocal(chat)
    }
}

const removeRoomLocal = (chatId) => {
    const messages = {...state.messages}
    delete messages[chatId]
    setState({
        rooms: state.rooms.filter(r => r._id !== chatId),
        messages,
        activeChat: state.activeChat === chatId ? null : state.activeChat
    })
}

const upsertRoom = (room) => {
    if (!room) return
    if (state.rooms.find(r => r._id === room._id)) {
        patchRoom(room._id, () => ({name: room.name, users: room.users, createdBy: room.createdBy, direct: room.direct}))
    } else {
        setState({rooms: sortRooms([room, ...state.rooms])})
    }
}

/* ---------- actions ---------- */

export const actions = {
    start() {
        if (started || !me() || typeof window === 'undefined') return
        started = true
        actions.loadRooms(true)
        subscription = client.subscribe({query: S_EVENT}).subscribe({
            next: (payload) => {
                try {
                    onEvent(payload && payload.data && payload.data.subscribeChatEvent)
                } catch (e) {
                    console.error('chat event', e)
                }
            }
        })
        /*
         * Events are lost while the page is hidden or suspended (standby, app in the background,
         * network change) - on iOS the websocket even stays "open" without receiving anything.
         * Coming back: new connection, load the chats again and every conversation that is shown
         * or opened afterwards.
         */
        let awaySince = 0, lastTick = Date.now()
        const resync = () => {
            if (document.hidden) {
                awaySince = awaySince || Date.now()
                return
            }
            const away = awaySince ? Date.now() - awaySince : 0
            awaySince = 0
            if (away > AWAY_AFTER || Date.now() - lastRoomsLoad > 20000) {
                actions.resync(away > AWAY_AFTER)
            }
            if (state.activeChat && isLooking(state.activeChat)) actions.markRead(state.activeChat)
        }
        window.addEventListener('focus', resync)
        window.addEventListener('pageshow', resync)
        window.addEventListener('online', () => actions.resync(true))
        document.addEventListener('visibilitychange', resync)
        // a suspended page gets no events at all: timers just stop, so a gap between two ticks
        // means the page was frozen
        setInterval(() => {
            const gap = Date.now() - lastTick
            lastTick = Date.now()
            if (gap > AWAY_AFTER + 5000 && !document.hidden) actions.resync(true)
        }, 5000)
        if (!getPush() && navigator.serviceWorker) {
            // click on a notification that was shown through the service worker
            navigator.serviceWorker.addEventListener('message', (e) => {
                const d = e.data
                if (d && d.type === 'lunuc-push-navigate' && typeof d.url === 'string' && d.url[0] === '/' && d.url[1] !== '/') {
                    _app_.history.push(d.url)
                }
            })
        }
        window.addEventListener('storage', (e) => {
            // settings changed in another tab
            if (e.key === SETTINGS_KEY) setState({settings: loadSettings()})
        })
    },
    stop() {
        if (subscription) subscription.unsubscribe()
        subscription = null
        started = false
    },
    /* reconnect: also open a new websocket (the old one may be dead without knowing it) */
    resync(reconnect) {
        if (reconnect && client.reconnectWs) client.reconnectWs()
        // everything that is cached may be outdated (new messages, edits, reactions, read receipts)
        const messages = {}
        Object.keys(state.messages).forEach(chatId => {
            messages[chatId] = {...state.messages[chatId], stale: true}
        })
        setState({messages})
        if (state.activeChat) actions.loadMessages(state.activeChat, {refresh: true})
        return actions.loadRooms(true)
    },
    loadRooms(force) {
        if (!force && state.ready) return Promise.resolve()
        lastRoomsLoad = Date.now()
        return query(Q_ROOMS).then(data => {
            setState({ready: true, error: null, rooms: sortRooms(data.chatRooms || [])})
            // a cached conversation that does not know the last message of its chat missed something
            state.rooms.forEach(room => {
                const cur = state.messages[room._id], last = room.lastMessage
                if (cur && cur.loaded && !cur.loading && last && !cur.items.some(m => m._id === last._id)) {
                    if (room._id === state.activeChat) {
                        actions.loadMessages(room._id, {refresh: true})
                    } else if (!cur.stale) {
                        patchMessages(room._id, () => ({stale: true}))
                    }
                }
            })
        }).catch(e => {
            setState({ready: true, error: errorMessage(e)})
        })
    },
    setActiveChat(chatId) {
        if (state.activeChat !== chatId) {
            setState({activeChat: chatId || null})
        }
        if (chatId) {
            const cur = state.messages[chatId]
            if (!cur) {
                actions.loadMessages(chatId)
            } else if (cur.loaded && (cur.stale || Date.now() - (cur.loadedAt || 0) > STALE_AFTER)) {
                // shown from the cache at once, updated in the background
                actions.loadMessages(chatId, {refresh: true})
            }
            actions.markRead(chatId)
        }
    },
    loadMessages(chatId, {older, refresh} = {}) {
        const cur = state.messages[chatId] || {items: [], hasMore: true, loading: false, loaded: false}
        if (cur.loading || (older && !cur.hasMore)) return Promise.resolve()
        setState({messages: {...state.messages, [chatId]: {...cur, loading: true}}})
        const first = cur.items.find(m => m._id[0] !== '#')
        const before = older && first ? first._id : undefined
        return query(Q_MESSAGES, {chat: chatId, before, limit: PAGE_SIZE}).then(data => {
            const loaded = (data.chatRoomMessages || []).slice().reverse()
            const now = state.messages[chatId] || cur
            let items
            if (older) {
                const ids = new Set(now.items.map(m => m._id))
                items = [...loaded.filter(m => !ids.has(m._id)), ...now.items]
            } else {
                // keep messages that are still being sent and older pages that were loaded before
                const ids = new Set(loaded.map(m => m._id))
                const oldest = loaded.length ? loaded[0]._id : null
                items = [
                    ...(refresh && oldest ? now.items.filter(m => m._id[0] !== '#' && m._id < oldest) : []),
                    ...loaded,
                    ...now.items.filter(m => m._id[0] === '#' && !ids.has(m._id))
                ]
            }
            setState({
                messages: {
                    ...state.messages,
                    [chatId]: {
                        items,
                        loading: false,
                        loaded: true,
                        stale: older ? !!now.stale : false,
                        loadedAt: older ? now.loadedAt : Date.now(),
                        hasMore: older || !refresh || !now.loaded ? loaded.length >= PAGE_SIZE : now.hasMore
                    }
                }
            })
        }).catch(e => {
            const now = state.messages[chatId] || cur
            setState({messages: {...state.messages, [chatId]: {...now, loading: false, loaded: true, error: errorMessage(e)}}})
        })
    },
    send(chatId, text, {replyTo, media} = {}) {
        const nonce = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
        const user = _app_.user
        const tmp = {
            _id: '#' + nonce,
            nonce,
            chat: chatId,
            message: text,
            pending: true,
            readBy: [me()],
            createdAt: Date.now(),
            replyTo: replyTo ? JSON.stringify({
                _id: replyTo._id, user: replyTo.createdBy._id, username: replyTo.createdBy.username,
                message: (replyTo.message || '').substring(0, 300), media: (replyTo.media || []).length
            }) : null,
            media: media || [],
            createdBy: {_id: me(), username: user.username, picture: user.picture ? (user.picture._id || user.picture) : null}
        }
        if (!state.messages[chatId]) {
            setState({messages: {...state.messages, [chatId]: {items: [], hasMore: true, loading: false, loaded: false}}})
        }
        upsertMessage(tmp)
        return actions._deliver(tmp, replyTo)
    },
    _deliver(tmp, replyTo) {
        return mutate(M_SEND, {
            chat: tmp.chat,
            message: tmp.message,
            nonce: tmp.nonce,
            replyTo: replyTo ? replyTo._id : (tmp.replyToId || undefined),
            media: tmp.media.length ? tmp.media.map(m => m._id) : undefined
        }, true).then(data => {
            upsertMessage({...data.chatSend, nonce: tmp.nonce})
        }).catch(e => {
            upsertMessage({...tmp, pending: false, failed: errorMessage(e), replyToId: replyTo ? replyTo._id : tmp.replyToId})
        })
    },
    retry(msg) {
        upsertMessage({...msg, pending: true, failed: null})
        return actions._deliver(msg)
    },
    discard(msg) {
        patchMessages(msg.chat, cur => ({items: cur.items.filter(m => m._id !== msg._id)}))
        const cur = state.messages[msg.chat]
        patchRoom(msg.chat, r => (r.lastMessage && r.lastMessage._id === msg._id ? {lastMessage: cur && cur.items.length ? cur.items[cur.items.length - 1] : null} : {}))
    },
    edit(msg, text) {
        return mutate(M_EDIT, {_id: msg._id, message: text}).then(d => onEvent({type: 'edit', chat: msg.chat, message: d.chatEdit}))
    },
    remove(msg) {
        return mutate(M_DELETE, {_id: msg._id}).then(d => onEvent({type: 'edit', chat: msg.chat, message: d.chatDelete}))
    },
    react(msg, emoji) {
        return mutate(M_REACT, {_id: msg._id, emoji}).then(d => onEvent({type: 'edit', chat: msg.chat, message: d.chatReact}))
    },
    markRead(chatId) {
        const room = state.rooms.find(r => r._id === chatId)
        if (room && room.unread) {
            patchRoom(chatId, () => ({unread: 0}))
        }
        clearTimeout(readTimers[chatId])
        readTimers[chatId] = setTimeout(() => {
            mutate(M_READ, {chat: chatId}, true).catch(() => {})
        }, 400)
    },
    typing(chatId) {
        if (Date.now() - lastTypingSent > 2500) {
            lastTypingSent = Date.now()
            mutate(M_TYPING, {chat: chatId}, true).catch(() => {})
        }
    },
    createRoom({name, users, direct}) {
        return mutate(M_CREATE, {name, users, direct: !!direct}).then(d => {
            upsertRoom(d.chatCreateRoom)
            return d.chatCreateRoom
        })
    },
    renameRoom(chatId, name) {
        return mutate(M_RENAME, {chat: chatId, name}).then(d => upsertRoom(d.chatRenameRoom))
    },
    addUser(chatId, userId) {
        return mutate(M_ADD_USER, {chat: chatId, user: userId}).then(d => upsertRoom(d.chatAddUser))
    },
    removeUser(chatId, userId) {
        return mutate(M_REMOVE_USER, {chat: chatId, user: userId}).then(d => {
            if (userId === me()) {
                removeRoomLocal(chatId)
            } else {
                upsertRoom(d.chatRemoveUser)
            }
        })
    },
    deleteRoom(chatId) {
        return mutate(M_DELETE_ROOM, {chat: chatId}).then(() => removeRoomLocal(chatId))
    },
    /*
     * Where notifications lead to: null = admin (admin/chat/<id>), otherwise the prefix of the
     * page the messenger runs on (e.g. '/system/messenger#chat/'). Push notifications are written
     * by the server, so the device tells it (push settings) - the page used last wins.
     */
    setHome(prefix) {
        home = prefix || null
        const push = getPush()
        let known
        try {
            known = localStorage.getItem(HOME_KEY) || ''
        } catch (e) {
            return
        }
        if (push && push.isSubscribed() && known !== (home || '')) {
            push.setSettings({chatUrl: home}).then(rememberHome).catch(() => {})
        }
    },
    setSettings(patch) {
        const settings = {...state.settings, ...patch}
        const push = getPush()
        if (push && patch.preview !== undefined && patch.preview !== state.settings.preview && push.isSubscribed()) {
            // the server writes the text of push notifications, so it has to know
            push.setSettings({chatPreview: !!patch.preview}).catch(() => {})
        }
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
        } catch (e) {
        }
        setState({settings})
    },
    toggleMute(chatId) {
        const room = state.rooms.find(r => r._id === chatId)
        if (!room) return Promise.resolve()
        const muted = !room.muted
        patchRoom(chatId, () => ({muted}))
        return mutate(M_MUTE, {chat: chatId, muted}).catch(() => patchRoom(chatId, () => ({muted: !muted})))
    },
    /* web push on this device on / off (extension push) */
    setPush(on) {
        const push = getPush()
        if (!push) return Promise.reject(new Error('unsupported'))
        const done = () => setState({}) // re-render: isSubscribed changed
        if (!on) return push.unsubscribe().then(done)
        return push.subscribe({settings: {chatPreview: state.settings.preview, chatUrl: home}}).then(() => {
            rememberHome()
            actions.setSettings({notify: true})
        })
    },
    /* asks the browser for the permission, resolves with the permission state */
    enableNotifications() {
        if (typeof Notification === 'undefined') {
            return Promise.resolve('unsupported')
        }
        const done = (permission) => {
            actions.setSettings({notify: permission === 'granted'})
            const push = getPush()
            if (permission === 'granted' && push && !push.isSubscribed()) {
                // also while the admin is closed, where the browser and the server support it
                actions.setPush(true).catch(() => {})
            }
            return permission
        }
        if (Notification.permission !== 'default') {
            return Promise.resolve(done(Notification.permission))
        }
        try {
            const p = Notification.requestPermission(done)
            return p && p.then ? p.then(done) : Promise.resolve(Notification.permission)
        } catch (e) {
            return Promise.resolve(done(Notification.permission))
        }
    }
}

export const getChatState = () => state

/* react hook: re-renders on every change of the store */
export const useChatStore = () => {
    const [snapshot, setSnapshot] = useState(state)
    useEffect(() => {
        actions.start()
        listeners.add(setSnapshot)
        setSnapshot(state)
        return () => {
            listeners.delete(setSnapshot)
        }
    }, [])
    return snapshot
}
