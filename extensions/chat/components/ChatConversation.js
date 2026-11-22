import React, {useEffect, useLayoutEffect, useRef, useState} from 'react'
import UploadUtil from '../../../client/util/upload'
import {_t} from '../../../util/i18n.mjs'
import {actions, getRoomPicture, getRoomTitle} from '../util/chatStore'
import {
    EMOJIS, QUICK_REACTIONS, buildShareData, canShare, colorFor, formatDay, formatTime, groupReactions, isEmojiOnly, isImage,
    isVideo, mediaSrc, messageDate, parseJson, renderText, sameDay, shareData, videoSrc
} from '../util/chatUtil'
import {Avatar, Icon, IconButton, useDismiss} from './common'
import {Ticks} from './ChatSidebar'

const msgKey = m => m.nonce || m._id
const drafts = {} // chatId -> text that was not sent yet

const uploadFile = async (file, onProgress) => {
    let blob = file
    if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
        // photos are scaled down before the upload
        blob = await UploadUtil.resizeImageToBlob({file, conversion: [{maxWidth: 1920, maxHeight: 1920, quality: 0.85}]})
    }
    return new Promise((resolve, reject) => UploadUtil.uploadData({
        blob,
        fileName: file.name || 'file',
        uploadTo: '/graphql/upload',
        onProgress: e => e.total && onProgress(Math.round(e.loaded * 100 / e.total)),
        onLoad: e => {
            const r = e.target.response
            if (r && r.status === 'success' && r.files && r.files.length) {
                resolve({_id: r.files[0]._id, name: file.name || 'file', mimeType: file.type})
            } else {
                reject(new Error((r && r.message) || 'Upload failed'))
            }
        },
        onError: () => reject(new Error('Upload failed'))
    }))
}

const EmojiPicker = ({onPick, onClose}) => {
    const [tab, setTab] = useState(0)
    const ref = useDismiss(onClose)
    return <div className="lchat-emoji" ref={ref}>
        <div className="lchat-emoji-tabs">
            {EMOJIS.map((c, i) => <button type="button" key={i} className={tab === i ? 'is-active' : ''} onClick={() => setTab(i)}>{c.icon}</button>)}
        </div>
        <div className="lchat-emoji-grid">
            {EMOJIS[tab].list.map(e => <button type="button" key={e} onClick={() => onPick(e)}>{e}</button>)}
        </div>
    </div>
}

const Composer = ({room, settings, reply, editing, onCancel, apiRef}) => {
    const [text, setText] = useState(drafts[room._id] || '')
    const [files, setFiles] = useState([])
    const [emojiOpen, setEmojiOpen] = useState(false)
    const inputRef = useRef(null)
    const fileRef = useRef(null)

    useEffect(() => {
        if (editing) setText(editing.message || '')
    }, [editing])

    useEffect(() => {
        if (inputRef.current && (reply || editing)) inputRef.current.focus()
    }, [reply, editing])

    useEffect(() => {
        if (!editing) drafts[room._id] = text
    }, [text])

    useLayoutEffect(() => {
        const el = inputRef.current
        if (el) {
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 140) + 'px'
        }
    }, [text])

    const patchFile = (id, patch) => setFiles(list => list.map(f => (f.id === id ? {...f, ...patch} : f)))

    const addFiles = (fileList) => {
        if (editing) return
        Array.from(fileList || []).slice(0, 10).forEach(file => {
            const id = Date.now() + '-' + Math.random()
            setFiles(list => [...list, {id, name: file.name || 'file', image: file.type.indexOf('image') === 0, progress: 0}])
            uploadFile(file, progress => patchFile(id, {progress}))
                .then(media => patchFile(id, {media, progress: 100}))
                .catch(e => patchFile(id, {error: e.message}))
        })
    }
    // text shared from another app (share target) is added to the draft
    const insertText = t => setText(cur => (cur ? cur + '\n' + t : t))
    apiRef.current = {addFiles, insertText}

    const uploading = files.some(f => !f.media && !f.error)
    const media = files.filter(f => f.media).map(f => f.media)
    const canSend = !uploading && (text.trim() !== '' || (!editing && media.length > 0))

    const cancel = () => {
        if (editing) setText(drafts[room._id] || '')
        onCancel()
    }

    const send = () => {
        if (!canSend) return
        const value = text.trim()
        if (editing) {
            if (value !== editing.message) actions.edit(editing, value)
            setText(drafts[room._id] || '')
        } else {
            actions.send(room._id, value, {replyTo: reply, media})
            setText('')
            setFiles([])
            drafts[room._id] = ''
        }
        onCancel()
        setEmojiOpen(false)
        if (inputRef.current) inputRef.current.focus()
    }

    const insert = (emoji) => {
        const el = inputRef.current
        const start = el ? el.selectionStart : text.length, end = el ? el.selectionEnd : text.length
        setText(text.substring(0, start) + emoji + text.substring(end))
        if (el) {
            requestAnimationFrame(() => {
                el.focus()
                el.selectionStart = el.selectionEnd = start + emoji.length
            })
        }
    }

    const context = editing || reply
    return <div className="lchat-composer">
        {context && <div className="lchat-composer-context">
            <Icon name={editing ? 'edit' : 'reply'} size={20}/>
            <div className="lchat-quote" style={{borderColor: editing ? undefined : colorFor(context.createdBy._id)}}>
                <strong style={{color: editing ? undefined : colorFor(context.createdBy._id)}}>
                    {editing ? _t('Chat.editMessage') : context.createdBy._id === _app_.user._id ? _t('Chat.you') : context.createdBy.username}
                </strong>
                <span>{context.message || (context.media && context.media.length ? '📎 ' + context.media[0].name : '')}</span>
            </div>
            <IconButton icon="close" title={_t('Chat.cancel')} onClick={cancel}/>
        </div>}
        {files.length > 0 && <div className="lchat-composer-files">
            {files.map(f => <span key={f.id} className={'lchat-file-chip' + (f.error ? ' is-error' : '')} title={f.error || f.name}>
                <Icon name={f.error ? 'error' : 'file'} size={16}/>
                <span>{f.name}</span>
                {!f.media && !f.error && <small>{f.progress}%</small>}
                <button type="button" aria-label={_t('Chat.remove')} onClick={() => setFiles(list => list.filter(x => x.id !== f.id))}><Icon name="close" size={14}/></button>
            </span>)}
        </div>}
        <div className="lchat-composer-row">
            <IconButton icon="emoji" title="Emoji" active={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}/>
            {!editing && <IconButton icon="attach" title={_t('Chat.attach')} onClick={() => fileRef.current && fileRef.current.click()}/>}
            <input ref={fileRef} type="file" multiple hidden onChange={e => {
                addFiles(e.target.files)
                e.target.value = ''
            }}/>
            <textarea ref={inputRef} rows={1} value={text} placeholder={_t('Chat.typeMessage')} maxLength={10000}
                      onChange={e => {
                          setText(e.target.value)
                          if (e.target.value && !editing) actions.typing(room._id)
                      }}
                      onPaste={e => {
                          const pasted = e.clipboardData && e.clipboardData.files
                          if (pasted && pasted.length) {
                              e.preventDefault()
                              addFiles(pasted)
                          }
                      }}
                      onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey && settings.enterSend && !(e.nativeEvent && e.nativeEvent.isComposing)) {
                              e.preventDefault()
                              send()
                          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault()
                              send()
                          } else if (e.key === 'Escape' && context) {
                              e.stopPropagation()
                              cancel()
                          }
                      }}/>
            <button type="button" className="lchat-send" disabled={!canSend} title={_t('Chat.send')} aria-label={_t('Chat.send')} onClick={send}>
                <Icon name={editing ? 'check' : 'send'} size={22}/>
            </button>
        </div>
        {emojiOpen && <EmojiPicker onPick={insert} onClose={() => setEmojiOpen(false)}/>}
    </div>
}

// prepares the share payload as soon as a menu / the lightbox opens,
// so the tap can call navigator.share() directly (Safari requires a fresh user gesture)
const useShare = (text, media, active = true) => {
    const [data, setData] = useState(null)
    const mediaKey = (media || []).map(m => m._id).join(',')
    const mediaRef = useRef(media)
    mediaRef.current = media
    useEffect(() => {
        setData(null)
        if (!active || !canShare() || (!text && !mediaKey)) return
        let alive = true
        buildShareData(text, mediaRef.current).then(d => alive && setData(d))
        return () => {
            alive = false
        }
    }, [active, text, mediaKey])
    return data
}

const ShareButton = ({data, onDone, children}) =>
    <button type="button" disabled={!data} onClick={() => {
        shareData(data)
        onDone && onDone()
    }}>{children(!!data)}</button>

const BubbleMenu = ({msg, own, up, onClose, onReply, onEdit}) => {
    const ref = useDismiss(onClose)
    const share = useShare(msg.message, msg.media)
    const item = (icon, label, fn, danger) =>
        <button type="button" className={danger ? 'is-danger' : ''} onClick={() => {
            onClose()
            fn()
        }}><Icon name={icon} size={18}/>{label}</button>
    return <div className={'lchat-menu' + (up ? ' is-up' : '') + (own ? ' is-own' : '')} ref={ref}>
        <div className="lchat-menu-reactions">
            {QUICK_REACTIONS.map(e => <button type="button" key={e} onClick={() => {
                onClose()
                actions.react(msg, e)
            }}>{e}</button>)}
        </div>
        {item('reply', _t('Chat.reply'), onReply)}
        {msg.message && item('copy', _t('Chat.copy'), () => navigator.clipboard && navigator.clipboard.writeText(msg.message))}
        {canShare() && (msg.message || msg.media?.length > 0) && <ShareButton data={share} onDone={onClose}>
            {ready => <><Icon name="share" size={18}/>{ready ? _t('Chat.share') : _t('Chat.sharePreparing')}</>}
        </ShareButton>}
        {own && msg.message && item('edit', _t('Chat.edit'), onEdit)}
        {own && item('trash', _t('Chat.delete'), () => {
            // eslint-disable-next-line no-alert
            if (window.confirm(_t('Chat.deleteMessageConfirm'))) actions.remove(msg)
        }, true)}
    </div>
}

const Bubble = ({msg, room, first, own, highlight, flash, menu, setMenu, onReply, onEdit, onJump, onImage, onMediaLoad}) => {
    const myId = _app_.user._id
    const quote = parseJson(msg.replyTo, null)
    const reactions = groupReactions(msg.reactions, myId)
    const images = [], videos = [], others = []
    ;(msg.media || []).forEach(m => (isImage(m) ? images : isVideo(m) ? videos : others).push(m))
    const showName = !own && !room.direct && first
    const emojiOnly = !quote && !msg.media?.length && isEmojiOnly(msg.message)
    const canAct = !msg.deleted && !msg.pending && !msg.failed

    return <div id={'lchat-msg-' + msg._id}
                className={'lchat-row' + (own ? ' is-own' : '') + (first ? ' is-first' : '') + (flash ? ' is-flash' : '')}>
        {!own && !room.direct && (first ? <Avatar name={msg.createdBy.username} picture={msg.createdBy.picture} size={28}/> :
            <span className="lchat-row-spacer"/>)}
        <div className={'lchat-bubble' + (emojiOnly ? ' is-emoji' : '') + (msg.deleted ? ' is-deleted' : '') + (msg.failed ? ' is-failed' : '')}>
            {showName && <div className="lchat-bubble-name" style={{color: colorFor(msg.createdBy._id)}}>{msg.createdBy.username}</div>}
            {quote && <button type="button" className="lchat-quote" style={{borderColor: colorFor(quote.user)}} onClick={() => onJump(quote._id)}>
                <strong style={{color: colorFor(quote.user)}}>{quote.user === myId ? _t('Chat.you') : quote.username}</strong>
                <span>{quote.message || (quote.media ? '📎 ' + _t('Chat.attachment') : '')}</span>
            </button>}
            {images.length > 0 && <div className={'lchat-images' + (images.length > 1 ? ' is-grid' : '')}>
                {images.map(m => <button type="button" key={m._id} onClick={() => onImage(m)}>
                    <img src={`/uploads/${m._id}?format=webp&width=640`} alt={m.name || ''} loading="lazy" onLoad={onMediaLoad}/>
                </button>)}
            </div>}
            {videos.map(m => <video key={m._id} className="lchat-video" src={videoSrc(m) + '#t=0.001'} controls playsInline
                                    preload="metadata" onLoadedMetadata={onMediaLoad}/>)}
            {others.map(m => <a key={m._id} className="lchat-file" href={mediaSrc(m)} target="_blank" rel="noopener noreferrer" download={m.name}>
                <Icon name="file" size={28}/><span>{m.name || _t('Chat.attachment')}</span>
            </a>)}
            <span className="lchat-bubble-text">
                {msg.deleted ? <em><Icon name="trash" size={14}/> {_t('Chat.deletedMessage')}</em> : renderText(msg.message, highlight)}
            </span>
            <span className="lchat-bubble-meta">
                {msg.edited && !msg.deleted && <span>{_t('Chat.edited')}</span>}
                <span>{formatTime(messageDate(msg))}</span>
                {own && !msg.deleted && <Ticks msg={msg} room={room}/>}
            </span>
            {reactions.length > 0 && <div className="lchat-reactions">
                {reactions.map(r => <button type="button" key={r.emoji} className={r.mine ? 'is-mine' : ''}
                                            title={r.users.map(u => u.n).join(', ')}
                                            onClick={() => actions.react(msg, r.emoji)}>
                    {r.emoji}{r.users.length > 1 && <span>{r.users.length}</span>}
                </button>)}
            </div>}
            {canAct && <button type="button" className="lchat-bubble-more" aria-label={_t('Chat.actions')}
                               onClick={e => setMenu({id: msg._id, up: e.currentTarget.getBoundingClientRect().top > window.innerHeight * 0.55})}>
                <Icon name="down" size={20}/>
            </button>}
            {menu && menu.id === msg._id &&
                <BubbleMenu msg={msg} own={own} up={menu.up} onClose={() => setMenu(null)} onReply={() => onReply(msg)} onEdit={() => onEdit(msg)}/>}
        </div>
        {msg.failed && <div className="lchat-failed">
            <span>{_t('Chat.sendFailed')}</span>
            <button type="button" onClick={() => actions.retry(msg)}>{_t('Chat.retry')}</button>
            <button type="button" onClick={() => actions.discard(msg)}>{_t('Chat.discard')}</button>
        </div>}
    </div>
}

const ChatConversation = ({room, entry, typing, settings, infoOpen, onBack, onToggleInfo, shared, onSharedUsed}) => {
    const myId = _app_.user._id
    const [reply, setReply] = useState(null)
    const [editing, setEditing] = useState(null)
    const [menu, setMenu] = useState(null)
    const [search, setSearch] = useState(null) // null = closed
    const [lightbox, setLightbox] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [newCount, setNewCount] = useState(0)
    const [flash, setFlash] = useState(null)
    const [atBottom, setAtBottom] = useState(true)
    const bodyRef = useRef(null)
    const atBottomRef = useRef(true)
    const prevRef = useRef({count: 0})
    const composerApi = useRef({})

    // content shared from another app: put it into the composer, the user sends it
    useEffect(() => {
        if (!shared) return
        if (shared.files.length) composerApi.current.addFiles(shared.files)
        if (shared.text) composerApi.current.insertText(shared.text)
        onSharedUsed()
    }, [shared])
    const dragDepth = useRef(0)

    const items = entry ? entry.items : []
    const firstKey = items.length ? msgKey(items[0]) : null
    const last = items.length ? items[items.length - 1] : null
    const lastKey = last ? msgKey(last) : null

    const scrollToBottom = () => {
        const el = bodyRef.current
        if (el) el.scrollTop = el.scrollHeight
    }

    // keep the scroll position stable: stay at the bottom for new messages, keep the
    // visible messages in place when older ones are loaded above
    useLayoutEffect(() => {
        const el = bodyRef.current
        if (!el) return
        const prev = prevRef.current
        if (!prev.count && items.length) {
            scrollToBottom()
        } else if (prev.firstKey !== firstKey && prev.lastKey === lastKey) {
            el.scrollTop += el.scrollHeight - prev.scrollHeight
        } else if (prev.lastKey !== lastKey && last) {
            if (atBottomRef.current || last.createdBy._id === myId) {
                scrollToBottom()
            } else if (items.length > prev.count) {
                setNewCount(c => c + 1)
            }
        } else if (atBottomRef.current) {
            scrollToBottom()
        }
        prevRef.current = {firstKey, lastKey, count: items.length, scrollHeight: el.scrollHeight}
    })

    const onScroll = () => {
        const el = bodyRef.current
        if (!el) return
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        atBottomRef.current = bottom
        if (bottom !== atBottom) setAtBottom(bottom)
        if (bottom && newCount) setNewCount(0)
        if (el.scrollTop < 150 && entry && entry.hasMore && !entry.loading && search === null) {
            actions.loadMessages(room._id, {older: true})
        }
    }

    const jumpTo = (id) => {
        const el = document.getElementById('lchat-msg-' + id)
        if (el) {
            el.scrollIntoView({block: 'center', behavior: 'smooth'})
            setFlash(id)
            setTimeout(() => setFlash(null), 1500)
        }
    }

    const needle = search ? search.trim().toLowerCase() : ''
    const shown = needle ? items.filter(m => !m.deleted && (m.message || '').toLowerCase().indexOf(needle) >= 0) : items
    const title = getRoomTitle(room)
    const typers = Object.values(typing || {})
    const subtitle = typers.length ? (room.direct ? _t('Chat.typing') : _t('Chat.typingUser', {user: typers.join(', ')})) :
        room.direct ? '' : room.users.map(u => (u._id === myId ? _t('Chat.you') : u.username)).join(', ')

    const rows = []
    shown.forEach((msg, i) => {
        const prev = shown[i - 1]
        const date = messageDate(msg)
        const newDay = !prev || !sameDay(messageDate(prev), date)
        if (newDay) {
            rows.push(<div className="lchat-day" key={'day' + msgKey(msg)}><span>{formatDay(date)}</span></div>)
        }
        const own = msg.createdBy._id === myId
        rows.push(<Bubble key={msgKey(msg)} msg={msg} room={room} own={own}
                          first={newDay || prev.createdBy._id !== msg.createdBy._id}
                          highlight={needle} flash={flash === msg._id} menu={menu} setMenu={setMenu}
                          onReply={m => {
                              setEditing(null)
                              setReply(m)
                          }}
                          onEdit={m => {
                              setReply(null)
                              setEditing(m)
                          }}
                          onJump={jumpTo} onImage={setLightbox}
                          onMediaLoad={() => atBottomRef.current && scrollToBottom()}/>)
    })

    return <div className={'lchat-main' + (dragging ? ' is-dragging' : '')}
                onDragEnter={e => {
                    if (e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) {
                        dragDepth.current++
                        setDragging(true)
                    }
                }}
                onDragOver={e => dragging && e.preventDefault()}
                onDragLeave={() => {
                    dragDepth.current = Math.max(0, dragDepth.current - 1)
                    if (!dragDepth.current) setDragging(false)
                }}
                onDrop={e => {
                    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                        e.preventDefault()
                        composerApi.current.addFiles(e.dataTransfer.files)
                    }
                    dragDepth.current = 0
                    setDragging(false)
                }}>
        <div className="lchat-bar">
            <IconButton icon="back" className="lchat-back" title={_t('Chat.back')} onClick={onBack}/>
            <button type="button" className="lchat-bar-room" onClick={onToggleInfo}>
                <Avatar name={title} picture={getRoomPicture(room)} group={!room.direct} size={40}/>
                <span className="lchat-bar-text">
                    <span className="lchat-bar-title">{title}</span>
                    {subtitle && <span className={'lchat-bar-sub' + (typers.length ? ' is-typing' : '')}>{subtitle}</span>}
                </span>
            </button>
            <IconButton icon="search" title={_t('Chat.searchMessages')} active={search !== null} onClick={() => setSearch(search === null ? '' : null)}/>
            <IconButton icon="info" title={_t('Chat.info')} active={infoOpen} onClick={onToggleInfo}/>
        </div>
        {search !== null && <div className="lchat-search lchat-search--bar">
            <Icon name="search" size={18}/>
            <input type="search" autoFocus value={search} placeholder={_t('Chat.searchMessages')}
                   onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Escape' && setSearch(null)}/>
            {needle && <small>{_t('Chat.hits', {count: shown.length})}</small>}
        </div>}
        <div className="lchat-body-wrap">
            <div className={'lchat-body' + (settings.wallpaper ? ' has-wallpaper' : '')} ref={bodyRef} onScroll={onScroll}>
                {entry && entry.loading && <div className="lchat-day"><span>{_t('Chat.loading')}</span></div>}
                {entry && entry.error && <div className="lchat-day is-error"><span>{entry.error}</span></div>}
                {entry && entry.loaded && !entry.hasMore && !needle && items.length > 0 &&
                    <div className="lchat-day"><span>{_t('Chat.beginning')}</span></div>}
                {entry && entry.loaded && shown.length === 0 &&
                    <div className="lchat-day"><span>{needle ? _t('Chat.noResults') : _t('Chat.noMessagesYet')}</span></div>}
                {rows}
            </div>
            {!atBottom && <button type="button" className="lchat-to-bottom" aria-label={_t('Chat.toBottom')} onClick={() => {
                scrollToBottom()
                setNewCount(0)
            }}>
                {newCount > 0 && <span className="lchat-badge">{newCount}</span>}
                <Icon name="down"/>
            </button>}
            {dragging && <div className="lchat-drop"><Icon name="attach" size={40}/>{_t('Chat.dropFiles')}</div>}
        </div>
        <Composer room={room} settings={settings} reply={reply} editing={editing} apiRef={composerApi}
                  onCancel={() => {
                      setReply(null)
                      setEditing(null)
                  }}/>
        {lightbox && <Lightbox media={lightbox} onClose={() => setLightbox(null)}/>}
    </div>
}

const Lightbox = ({media, onClose}) => {
    const share = useShare(null, [media])
    return <div className="lchat-lightbox" onClick={onClose}>
        <div className="lchat-lightbox-actions" onClick={e => e.stopPropagation()}>
            {canShare() && <ShareButton data={share}>
                {() => <Icon name="share" size={24}/>}
            </ShareButton>}
            <IconButton icon="close" title={_t('Chat.close')} onClick={onClose}/>
        </div>
        <img src={mediaSrc(media)} alt={media.name || ''}/>
    </div>
}

export default ChatConversation
