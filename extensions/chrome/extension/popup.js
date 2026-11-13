// ---- YouTube mp3 (bestehend) ----
document.getElementById('downloadMp3').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.runtime.sendMessage({command: 'ytCookies'}, function (response) {
            chrome.tabs.create({url: `https://www.lunuc.com/system/youtube_downloader?preview=true&format=mp3&url=${encodeURIComponent(tabs[0].url)}&cookies=${encodeURIComponent(JSON.stringify(response))}`})
        })
    })
    return false
})

// ---- Medien-Downloader ----
const listEl = document.getElementById('mediaList')
let currentTab

function formatSize(bytes) {
    if (!bytes) return ''
    const u = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++ }
    return bytes.toFixed(i ? 1 : 0) + ' ' + u[i]
}

function fileNameFromUrl(url, fallbackExt) {
    try {
        const path = new URL(url).pathname
        let name = decodeURIComponent(path.split('/').pop() || '')
        if (!name || !/\.\w{2,4}$/.test(name)) name = (name || 'video') + '.' + fallbackExt
        return name.replace(/[\\/:*?"<>|]+/g, '_')
    } catch (e) {
        return 'video.' + fallbackExt
    }
}

function safeTitle() {
    return (currentTab.title || 'video').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 100)
}

// <video>/<source>-Elemente in allen Frames einsammeln (nur echte URLs, keine blob:)
async function scanDom() {
    try {
        const results = await chrome.scripting.executeScript({
            target: {tabId: currentTab.id, allFrames: true},
            func: () => {
                const urls = []
                document.querySelectorAll('video, video source, audio, audio source').forEach(el => {
                    const src = el.currentSrc || el.src
                    if (src && /^https?:/.test(src)) urls.push(src)
                })
                return urls
            }
        })
        return results.flatMap(r => r.result || [])
    } catch (e) {
        return []
    }
}

async function render() {
    const media = await chrome.runtime.sendMessage({command: 'getMedia', tabId: currentTab.id}) || []
    const domUrls = await scanDom()
    domUrls.forEach(url => {
        if (!media.some(m => m.url === url)) {
            media.push({url, kind: /\.m3u8(\?|#|$)/i.test(url) ? 'hls' : /\.mpd(\?|#|$)/i.test(url) ? 'dash' : 'file', size: 0})
        }
    })

    listEl.innerHTML = ''
    if (!media.length) {
        listEl.innerHTML = '<li class="empty">Noch keine Medien gefunden.</li>'
        return
    }
    // grösste Dateien / HLS zuerst
    media.sort((a, b) => (b.kind !== 'file') - (a.kind !== 'file') || (b.size || 0) - (a.size || 0))

    media.forEach(m => {
        const li = document.createElement('li')
        const tag = m.kind === 'hls' ? 'HLS-Stream' : m.kind === 'dash' ? 'DASH-Stream' : (m.type || 'Datei')
        li.innerHTML = `<div class="meta"><span class="tag"></span><span class="size"></span></div><div class="url"></div>`
        li.querySelector('.tag').textContent = tag
        li.querySelector('.size').textContent = formatSize(m.size)
        li.querySelector('.url').textContent = m.url

        const btn = document.createElement('button')
        btn.className = 'btn small'
        btn.textContent = 'Herunterladen'
        btn.onclick = () => download(m)
        li.appendChild(btn)
        listEl.appendChild(li)
    })
}

function download(m) {
    if (m.kind === 'hls' || m.kind === 'dash') {
        // Streams werden in einer eigenen Extension-Seite zusammengesetzt (Popup würde sich schliessen)
        const params = new URLSearchParams({url: m.url, kind: m.kind, name: safeTitle()})
        chrome.tabs.create({url: chrome.runtime.getURL('download.html?' + params)})
    } else {
        chrome.downloads.download({url: m.url, filename: fileNameFromUrl(m.url, 'mp4'), saveAs: true})
    }
}

document.getElementById('rescan').onclick = render
document.getElementById('options').onclick = () => chrome.runtime.openOptionsPage()
document.getElementById('clear').onclick = async () => {
    await chrome.runtime.sendMessage({command: 'clearMedia', tabId: currentTab.id})
    chrome.action.setBadgeText({tabId: currentTab.id, text: ''})
    render()
}

chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    currentTab = tabs[0]
    render()
})
