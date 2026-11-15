import React, {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {registerTrs, _t} from '../../../util/i18n.mjs'
import {translations} from '../translations/admin'
import config from 'gen/config-client'
import {CHAT_BASE_URL} from '../constants'
import {actions, notificationPermission, useChatStore} from '../util/chatStore'
import ChatSidebar from '../components/ChatSidebar'
import ChatConversation from '../components/ChatConversation'
import {NewChatDialog, RoomInfo, SettingsDialog} from '../components/ChatPanels'
import {Icon} from '../components/common'
import '../chat.css'

registerTrs(translations, 'ChatContainer')

const {ADMIN_BASE_URL} = config

const HASH_PREFIX = '#chat/'
const chatFromHash = () => (typeof location !== 'undefined' && location.hash.indexOf(HASH_PREFIX) === 0 ? location.hash.substring(HASH_PREFIX.length) : null)

/*
 * Messenger. In the admin as route admin/chat/:id. In a CmsPage as JsonDom component
 * {"t": "ChatContainer"} (optional "p": {"height": "600px"}): there is no route then, the
 * selected chat is kept in the hash of the url (#chat/<id>), so links, reload, the back button
 * and notifications work on the page as well.
 */
/* an error while rendering shows what went wrong instead of leaving a white page */
class ErrorBoundary extends React.Component {
    state = {error: null}

    static getDerivedStateFromError(error) {
        return {error}
    }

    componentDidCatch(error, info) {
        console.error('Messenger', error, info)
    }

    render() {
        const {error} = this.state
        if (!error) return this.props.children
        return <div className="lchat lchat--login">
            <div className="lchat-main lchat-welcome">
                <Icon name="error" size={64}/>
                <strong>{_t('Chat.error')}</strong>
                <code className="lchat-error">{String(error && error.message ? error.message : error)}</code>
                <code className="lchat-error">{String((error && error.stack) || '').split('\n').slice(0, 4).join('\n')}</code>
                <button type="button" className="lchat-btn" onClick={() => location.reload()}>{_t('Chat.reload')}</button>
            </div>
        </div>
    }
}

const ChatContainer = (props) => (_app_.user && _app_.user._id ? <ErrorBoundary><Messenger {...props}/></ErrorBoundary> :
    <div className="lchat lchat--login">
        <div className="lchat-main lchat-welcome">
            <Icon name="chat" size={96}/>
            <strong>{_t('Chat.title')}</strong>
            <span>{_t('Chat.loginRequired')}</span>
            <a className="lchat-btn" href={ADMIN_BASE_URL + '/login?forward=' + encodeURIComponent(location.pathname + location.hash)}>{_t('Chat.login')}</a>
        </div>
    </div>)

const Messenger = ({match, height: fixedHeight}) => {
    const state = useChatStore()
    const hasRoute = !!(match && match.params)
    const [localId, setLocalId] = useState(chatFromHash)
    const [dialog, setDialog] = useState(null) // 'new' | 'settings'
    const [infoOpen, setInfoOpen] = useState(false)
    const [height, setHeight] = useState(null)
    const rootRef = useRef(null)

    const selectedId = (hasRoute ? match.params.id : localId) || null
    const room = selectedId ? state.rooms.find(r => r._id === selectedId) : null

    const select = (id) => {
        if (hasRoute) {
            _app_.history.push(CHAT_BASE_URL + (id ? '/' + id : ''))
        } else {
            setLocalId(id || null)
            if (chatFromHash() !== (id || null)) {
                _app_.history.push(location.pathname + location.search + (id ? HASH_PREFIX + id : ''))
            }
        }
    }

    // on a CmsPage: follow the hash (back button, click on a notification) and tell the store
    // where chats live, so notifications lead to this page instead of the admin
    useEffect(() => {
        if (hasRoute) {
            actions.setHome(null)
            return
        }
        actions.setHome(location.pathname + HASH_PREFIX)
        const sync = () => setLocalId(chatFromHash())
        const unlisten = _app_.history.listen ? _app_.history.listen(sync) : null
        window.addEventListener('hashchange', sync)
        window.addEventListener('popstate', sync)
        return () => {
            if (typeof unlisten === 'function') unlisten()
            window.removeEventListener('hashchange', sync)
            window.removeEventListener('popstate', sync)
        }
    }, [hasRoute])

    // fill the rest of the window below the admin header
    useLayoutEffect(() => {
        if (fixedHeight) return
        const update = () => {
            if (rootRef.current) {
                setHeight(Math.max(320, window.innerHeight - rootRef.current.getBoundingClientRect().top))
            }
        }
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    useEffect(() => {
        actions.setActiveChat(room ? room._id : null)
        if (state.ready && selectedId && !room) {
            // chat was deleted or the user is not a member anymore
            select(null)
        }
    }, [selectedId, !!room, state.ready])

    useEffect(() => () => actions.setActiveChat(null), [])

    useEffect(() => {
        if (!room) setInfoOpen(false)
    }, [selectedId])

    const logout = () => {
        // eslint-disable-next-line no-alert
        if (!window.confirm(_t('Chat.logoutConfirm', {user: _app_.user.username}))) return
        actions.stop()
        // on a CmsPage come back to it (shows the login hint), in the admin as the admin logout does
        _app_.history.push(ADMIN_BASE_URL + '/logout' + (hasRoute ? '' : '?forward=' + encodeURIComponent(location.pathname)))
    }

    const {settings} = state
    const showBanner = !settings.notify && !settings.hintDismissed && notificationPermission() === 'default'

    return <div ref={rootRef} style={fixedHeight ? {height: fixedHeight} : height ? {height} : undefined}
                className={'lchat' + (settings.accent === 'theme' ? ' lchat--theme' : '') + (room ? ' has-chat' : '') + (room && infoOpen ? ' has-info' : '')}>
        <ChatSidebar state={state} selectedId={selectedId} onSelect={select}
                     onNewChat={() => setDialog('new')} onSettings={() => setDialog('settings')} onLogout={logout}
                     banner={showBanner && <div className="lchat-banner">
                         <Icon name="bell" size={28}/>
                         <div>
                             <strong>{_t('Chat.banner.title')}</strong>
                             <span>{_t('Chat.banner.text')}</span>
                             <div>
                                 <button type="button" onClick={() => actions.enableNotifications()}>{_t('Chat.banner.enable')}</button>
                                 <button type="button" onClick={() => actions.setSettings({hintDismissed: true})}>{_t('Chat.banner.later')}</button>
                             </div>
                         </div>
                     </div>}/>
        {room ? <ChatConversation key={room._id} room={room} entry={state.messages[room._id]} typing={state.typing[room._id]}
                                  settings={settings} infoOpen={infoOpen} onBack={() => select(null)}
                                  onToggleInfo={() => setInfoOpen(!infoOpen)}/> :
            <div className="lchat-main lchat-welcome">
                <Icon name="chat" size={96}/>
                <strong>{_t('Chat.title')}</strong>
                <span>{_t('Chat.welcome')}</span>
                <button type="button" className="lchat-btn" onClick={() => setDialog('new')}>{_t('Chat.newChat')}</button>
            </div>}
        {room && infoOpen && <RoomInfo room={room} onClose={() => setInfoOpen(false)} onLeft={() => select(null)}/>}
        {dialog === 'new' && <NewChatDialog onClose={() => setDialog(null)} onCreated={id => {
            setDialog(null)
            select(id)
        }}/>}
        {dialog === 'settings' && <SettingsDialog settings={settings} onClose={() => setDialog(null)}/>}
    </div>
}

export default ChatContainer
