import React from 'react'
import {_t} from '../../../util/i18n.mjs'

export const EMOJIS = [
    {icon: '😀', list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😋 😛 😜 🤪 😎 🤓 🧐 🤔 🤨 😐 😑 😶 🙄 😏 😬 😴 😷 🤒 🤕 🤢 🥵 🥶 🥳 😕 😟 🙁 😮 😯 😲 😳 🥺 😢 😭 😱 😤 😡 🤬 😈 💀 💩 🤡 👻 🙈 🙉 🙊'},
    {icon: '👍', list: '👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🖐️ 👋 🤝 🙏 👏 🙌 💪 🫶 ✍️ 👀 🧠 🫡 🤷 🤦 🙋 💁 🙅 🙆'},
    {icon: '❤️', list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 ❣️ 💕 💖 💯 💥 💫 ⭐ 🌟 ✨ 🔥 ⚡ 🎉 🎊 🎁 🏆 🥇 ✅ ❌ ❓ ❗ ⚠️ 🚀 💡 📌 📎 🔒 🔑 🔔 ⏰ ⏳'},
    {icon: '☕', list: '☕ 🍵 🍺 🍻 🥂 🍷 🍕 🍔 🍟 🌭 🥗 🍣 🍰 🍪 🍫 🍎 🍌 🍓 🥑 🌶️ 🐶 🐱 🐭 🦊 🐻 🐼 🐸 🐵 🐔 🦄 🐝 🦋 🌱 🌳 🌸 🌞 🌙 ☁️ 🌧️ ❄️ 🌈'},
    {icon: '💻', list: '💻 🖥️ ⌨️ 🖱️ 📱 📞 📧 📅 📊 📈 📉 📝 📁 🗂️ 🗑️ 🔧 🔨 ⚙️ 🧪 🐛 🤖 🧩 🎯 🎮 🎵 🎬 📷 🚗 🚲 ✈️ 🏠 🏢 🏖️ ⚽ 🏀 🎿 💰 💳'}
].map(c => ({icon: c.icon, list: c.list.split(' ')}))

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const COLORS = ['#e17076', '#7bc862', '#e5a64e', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774', '#2a9d8f', '#c97b63']

export const colorFor = (key) => {
    let hash = 0
    const s = String(key || '')
    for (let i = 0; i < s.length; i++) {
        hash = (hash * 31 + s.charCodeAt(i)) | 0
    }
    return COLORS[Math.abs(hash) % COLORS.length]
}

export const initials = (name) => {
    const parts = String(name || '?').trim().split(/[\s._-]+/).filter(Boolean)
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/* date of a message: from the ObjectId, messages that are still being sent have createdAt */
export const messageDate = (msg) => {
    if (msg.createdAt) return new Date(msg.createdAt)
    if (/^[0-9a-f]{24}$/i.test(msg._id)) return new Date(parseInt(msg._id.substring(0, 8), 16) * 1000)
    return new Date()
}

const lang = () => (typeof _app_ !== 'undefined' && _app_.lang) || undefined
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const dayDiff = d => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000)

export const formatTime = d => d.toLocaleTimeString(lang(), {hour: '2-digit', minute: '2-digit'})

/* label of the day separator in a conversation */
export const formatDay = (d) => {
    const diff = dayDiff(d)
    if (diff === 0) return _t('Chat.today')
    if (diff === 1) return _t('Chat.yesterday')
    if (diff < 7) return d.toLocaleDateString(lang(), {weekday: 'long'})
    return d.toLocaleDateString(lang(), {day: '2-digit', month: 'long', year: 'numeric'})
}

/* short time in the chat list */
export const formatListTime = (d) => {
    const diff = dayDiff(d)
    if (diff === 0) return formatTime(d)
    if (diff === 1) return _t('Chat.yesterday')
    if (diff < 7) return d.toLocaleDateString(lang(), {weekday: 'short'})
    return d.toLocaleDateString(lang(), {day: '2-digit', month: '2-digit', year: '2-digit'})
}

export const sameDay = (a, b) => startOfDay(a) === startOfDay(b)

export const isEmojiOnly = (text) => {
    if (!text || text.length > 12) return false
    try {
        return /^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(text)
    } catch (e) {
        return false
    }
}

export const parseJson = (value, fallback) => {
    if (!value) return fallback
    try {
        return JSON.parse(value)
    } catch (e) {
        return fallback
    }
}

/* reactions grouped by emoji: [{emoji, users:[{u,n}], mine}] */
export const groupReactions = (value, myId) => {
    const groups = []
    parseJson(value, []).forEach(r => {
        let g = groups.find(f => f.emoji === r.e)
        if (!g) {
            g = {emoji: r.e, users: [], mine: false}
            groups.push(g)
        }
        g.users.push(r)
        if (r.u === myId) g.mine = true
    })
    return groups
}

const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi
// *bold* _italic_ ~strike~ `code` - only at word boundaries, so file_names stay untouched
const FORMAT_REGEX = /(^|[\s(])(\*[^\s*](?:[^*\n]*[^\s*])?\*|_[^\s_](?:[^_\n]*[^\s_])?_|~[^\s~](?:[^~\n]*[^\s~])?~|`[^`\n]+`)(?=$|[\s.,;:!?)])/g
const FORMAT_TAGS = {'*': 'strong', '_': 'em', '~': 'del', '`': 'code'}

const formatInline = (text, keyPrefix) => {
    const out = []
    let last = 0, m, i = 0
    FORMAT_REGEX.lastIndex = 0
    while ((m = FORMAT_REGEX.exec(text))) {
        const start = m.index + m[1].length
        if (start > last) out.push(text.substring(last, start))
        const Tag = FORMAT_TAGS[m[2][0]]
        out.push(<Tag key={keyPrefix + '-' + (i++)}>{m[2].substring(1, m[2].length - 1)}</Tag>)
        last = start + m[2].length
    }
    if (last < text.length) out.push(text.substring(last))
    return out
}

/* message text -> react nodes (links, simple formatting, optional search highlight) */
export const renderText = (text, highlight) => {
    if (!text) return null
    const nodes = []
    String(text).split(URL_REGEX).forEach((part, i) => {
        if (!part) return
        if (i % 2 === 1) {
            const href = part.indexOf('www.') === 0 ? 'https://' + part : part
            nodes.push(<a key={'l' + i} href={href} target="_blank" rel="noopener noreferrer">{part}</a>)
        } else {
            nodes.push(...formatInline(part, 'f' + i))
        }
    })
    if (!highlight) return nodes
    const needle = highlight.toLowerCase()
    return nodes.map((node, i) => {
        if (typeof node !== 'string') return node
        const lower = node.toLowerCase(), parts = []
        let pos = 0, idx
        while ((idx = lower.indexOf(needle, pos)) >= 0) {
            if (idx > pos) parts.push(node.substring(pos, idx))
            parts.push(<mark key={'h' + i + '-' + idx}>{node.substring(idx, idx + needle.length)}</mark>)
            pos = idx + needle.length
        }
        if (pos < node.length) parts.push(node.substring(pos))
        return <React.Fragment key={'s' + i}>{parts}</React.Fragment>
    })
}

export const pictureSrc = (picture, size = 96) => (picture ? `/uploads/${picture._id || picture}?format=webp&width=${size}&height=${size}` : null)

export const isImage = m => !!(m && m.mimeType && m.mimeType.indexOf('image') === 0)

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i
// mimeType can be empty (e.g. files without a known type) -> fall back to the file extension
export const isVideo = m => !!m && (m.mimeType ? m.mimeType.indexOf('video') === 0 : VIDEO_EXT.test(m.name || ''))

export const mediaSrc = m => `/uploads/${m._id}`

/* ---------- native share (Web Share API, also works in the iOS home-screen app) ---------- */

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

// small cache: Safari only allows navigator.share() right after a tap, so the files are fetched ahead of time
const shareCache = new Map(), SHARE_CACHE_MAX = 4
export const prefetchShareFile = (m) => {
    let p = shareCache.get(m._id)
    if (!p) {
        p = fetch(mediaSrc(m), {credentials: 'same-origin'})
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status)
                return r.blob()
            })
            .then(b => new File([b], m.name || 'file', {type: m.mimeType || b.type}))
        p.catch(() => shareCache.delete(m._id))
        shareCache.set(m._id, p)
        if (shareCache.size > SHARE_CACHE_MAX) shareCache.delete(shareCache.keys().next().value)
    }
    return p
}

// builds the share payload; files are shared natively when the browser supports it, otherwise the link
export const buildShareData = async (text, media) => {
    const data = {}
    if (text) data.text = text
    if (media && media.length) {
        try {
            const files = await Promise.all(media.map(prefetchShareFile))
            if (!navigator.canShare || navigator.canShare({files})) data.files = files
        } catch (e) {
            // ignore -> share link instead
        }
        if (!data.files) data.url = location.origin + mediaSrc(media[0])
    }
    return data
}

export const shareData = data => navigator.share(data).catch(e => {
    if (e.name !== 'AbortError') console.warn('share failed', e)
})
