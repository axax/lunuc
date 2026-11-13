// ---- YouTube mp3 (bestehend) ----
chrome.runtime.onMessage.addListener(function (message, sender, callback) {
    if (message.command === 'ytCookies') {
        chrome.cookies.getAll({domain: "youtube.com"}, function (cookies) {
            callback(cookies)
        })
        return true
    }
    if (message.command === 'getMedia') {
        getMedia(message.tabId).then(callback)
        return true
    }
    if (message.command === 'clearMedia') {
        chrome.storage.session.remove('media_' + message.tabId).then(() => callback(true))
        return true
    }
})

// ---- Medien-Erkennung ----
const MEDIA_EXT = /\.(mp4|m4v|webm|mov|mkv|m3u8|mpd)(\?|#|$)/i
const SEGMENT_EXT = /\.(ts|m4s|aac|m4a|dash|cmfv|cmfa)(\?|#|$)/i

async function getMedia(tabId) {
    const key = 'media_' + tabId
    const data = await chrome.storage.session.get(key)
    return data[key] || []
}

// Schreibzugriffe nacheinander ausführen, sonst gehen bei vielen gleichzeitigen Requests Einträge verloren
let queue = Promise.resolve()

function addMedia(tabId, entry) {
    if (tabId < 0) return
    queue = queue.then(async () => {
        const key = 'media_' + tabId
        const list = await getMedia(tabId)
        if (list.some(m => m.url === entry.url)) return
        list.push(entry)
        await chrome.storage.session.set({[key]: list.slice(-50)})
        chrome.action.setBadgeText({tabId, text: String(list.length)})
        chrome.action.setBadgeBackgroundColor({tabId, color: '#2b7a3d'})
    }).catch(e => console.warn(e))
}

function clearMedia(tabId) {
    queue = queue.then(() => chrome.storage.session.remove('media_' + tabId)).catch(() => {})
    chrome.action.setBadgeText({tabId, text: ''}).catch(() => {})
}

chrome.webRequest.onHeadersReceived.addListener(details => {
    if (details.tabId < 0 || details.statusCode >= 400) return
    const url = details.url
    if (url.startsWith('blob:') || url.startsWith('data:')) return
    const headers = details.responseHeaders || []
    const h = name => (headers.find(x => x.name.toLowerCase() === name) || {}).value || ''
    const type = h('content-type').toLowerCase()
    const size = parseInt((h('content-range').split('/')[1]) || h('content-length') || '0', 10)

    let kind = null
    if (type.includes('mpegurl') || /\.m3u8(\?|#|$)/i.test(url)) {
        kind = 'hls'
    } else if (type.includes('dash+xml') || /\.mpd(\?|#|$)/i.test(url)) {
        kind = 'dash'
    } else if (type.startsWith('video/') || (MEDIA_EXT.test(url) && !SEGMENT_EXT.test(url))) {
        if (type === 'video/mp2t' || type === 'video/iso.segment' || SEGMENT_EXT.test(url)) return // einzelne HLS-Segmente ignorieren
        kind = 'file'
    }
    if (!kind) return

    addMedia(details.tabId, {url, kind, type, size, time: Date.now()})
}, {urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other', 'main_frame', 'sub_frame']}, ['responseHeaders'])

// Liste nur bei echter Navigation zurücksetzen (nicht bei URL-Änderungen von Single-Page-Apps)
chrome.webRequest.onBeforeRequest.addListener(details => {
    if (details.tabId >= 0) clearMedia(details.tabId)
}, {urls: ['<all_urls>'], types: ['main_frame']})

chrome.tabs.onRemoved.addListener(tabId => clearMedia(tabId))
