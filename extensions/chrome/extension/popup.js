// ---- YouTube mp3 (bestehend) ----
document.getElementById('downloadMp3').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        chrome.runtime.sendMessage({command: 'ytCookies'}, function (response) {
            chrome.tabs.create({url: `https://www.lunuc.com/system/youtube_downloader?preview=true&format=mp3&url=${encodeURIComponent(tabs[0].url)}&cookies=${encodeURIComponent(JSON.stringify(response))}`})
        })
    })
    return false
})

// ---- Medien auf der Seite ----
const listEl = document.getElementById('mediaList')
const jobListEl = document.getElementById('jobList')
let currentTab

function formatSize(bytes) {
    if (!bytes) return ''
    const u = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++ }
    return bytes.toFixed(i ? 1 : 0) + ' ' + u[i]
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

async function renderMedia() {
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
    // Streams zuerst, Master-Playlists vor Varianten, dann nach Grösse
    const score = m => (m.kind !== 'file' ? 2 : 0) + (/master|manifest/i.test(m.url) ? 1 : 0)
    media.sort((a, b) => score(b) - score(a) || (b.size || 0) - (a.size || 0))

    media.forEach(m => {
        const li = document.createElement('li')
        const tag = m.kind === 'hls' ? 'HLS-Stream' : m.kind === 'dash' ? 'DASH-Stream' : (m.type || 'Datei')
        li.innerHTML = '<div class="meta"><span class="tag"></span><span class="size"></span></div><div class="url"></div>'
        li.querySelector('.tag').textContent = tag
        li.querySelector('.size').textContent = formatSize(m.size)
        li.querySelector('.url').textContent = m.url

        const btn = document.createElement('button')
        btn.className = 'btn small'
        btn.textContent = 'Herunterladen'
        btn.onclick = async () => {
            btn.disabled = true
            btn.textContent = 'Gestartet'
            await chrome.runtime.sendMessage({command: 'startDownload', url: m.url, kind: m.kind, name: safeTitle()})
        }
        li.appendChild(btn)
        listEl.appendChild(li)
    })
}

// ---- laufende Downloads ----
const STATE_LABEL = {queued: 'Wartet', running: 'Lädt', converting: 'Wandelt um', uploading: 'Lädt hoch', done: 'Fertig', error: 'Fehler'}

async function renderJobs() {
    const jobs = (await chrome.storage.session.get('jobs')).jobs || []
    jobListEl.innerHTML = ''
    if (!jobs.length) {
        jobListEl.innerHTML = '<li class="empty">Keine Downloads.</li>'
        return
    }
    jobs.slice().reverse().forEach(j => {
        const li = document.createElement('li')
        li.className = j.state
        li.innerHTML = '<div class="name"></div><div class="meta"><span class="tag"></span><span class="label"></span></div>'
        li.querySelector('.name').textContent = j.name
        li.querySelector('.tag').textContent = STATE_LABEL[j.state] || j.state
        li.querySelector('.label').textContent = j.state === 'done' || j.state === 'error' ? '' : j.label
        if (!['done', 'error', 'queued'].includes(j.state)) {
            const p = document.createElement('progress')
            p.max = 1
            p.value = j.progress || 0
            li.appendChild(p)
        }
        if (j.message) {
            const msg = document.createElement('div')
            msg.className = 'msg'
            msg.textContent = j.message
            li.appendChild(msg)
        }
        jobListEl.appendChild(li)
    })
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.jobs) renderJobs()
})

document.getElementById('rescan').onclick = renderMedia
document.getElementById('options').onclick = () => chrome.runtime.openOptionsPage()
document.getElementById('clear').onclick = async () => {
    await chrome.runtime.sendMessage({command: 'clearMedia', tabId: currentTab.id})
    renderMedia()
}
document.getElementById('clearJobs').onclick = () => chrome.runtime.sendMessage({command: 'clearJobs'})

chrome.tabs.query({active: true, currentWindow: true}, tabs => {
    currentTab = tabs[0]
    renderMedia()
    renderJobs()
})
