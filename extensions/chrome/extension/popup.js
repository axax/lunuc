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

const nameInput = document.getElementById('fileName')

function safeName(name) {
    return (name || 'video')
        .replace(/^\s*(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\s+[-–—|:]\s+/i, '') // "domain.ch - Titel" → "Titel"
        .replace(/(?:\.(?:mp4|m4v|mkv|webm|mov|avi|ts|m3u8|mpd))+\s*$/i, '')            // Endung kommt beim Speichern dazu
        .replace(/\s*[:|]\s*/g, ' - ')         // "Eps 4 : Titel" → "Eps 4 - Titel"
        .replace(/[\\/*?"<>]+/g, '_')           // in Dateinamen nicht erlaubt
        .replace(/\s+/g, ' ').trim().slice(0, 120) || 'video'
}

// Läuft in jedem Frame der Seite: Medien-URLs und mögliche Titel einsammeln
function collectFromFrame() {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim()
    const short = s => (s = clean(s)) && s.length <= 150 ? s : ''

    const urls = []
    document.querySelectorAll('video, video source, audio, audio source').forEach(el => {
        const src = el.currentSrc || el.src
        if (src && /^https?:/.test(src)) urls.push(src)
    })

    // <track> am Video-Element (Untertitel/Captions)
    const tracks = []
    document.querySelectorAll('video track[src]').forEach(t => {
        if (/^(subtitles|captions|)$/.test(t.kind || '') && /^https?:/.test(t.src)) tracks.push({url: t.src, lang: clean(t.srclang).toLowerCase()})
    })

    const info = {urls, tracks, top: window === window.top, title: clean(document.title)}

    // 1. Media Session: viele Player setzen hier den Titel der laufenden Folge
    const ms = navigator.mediaSession && navigator.mediaSession.metadata
    if (ms && ms.title) info.session = {title: clean(ms.title), artist: clean(ms.artist), album: clean(ms.album)}

    // 2. strukturierte Daten (schema.org Episode / VideoObject / Movie)
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
        if (info.ld) return
        try {
            const data = JSON.parse(script.textContent)
            const items = Array.isArray(data) ? data : (data['@graph'] || [data])
            for (const o of items) {
                const types = [].concat(o['@type'] || [])
                if (o.name && types.some(t => /Episode|VideoObject|Movie|Clip/.test(t))) {
                    const series = o.partOfSeries && o.partOfSeries.name
                    info.ld = clean([series && series !== o.name ? series : '', o.name].filter(Boolean).join(' - '))
                    break
                }
            }
        } catch (e) {}
    })

    // 3. markierter Eintrag in einer Episoden-/Playlist-Liste
    const candidates = document.querySelectorAll('[aria-current="true"], [aria-current="page"], li.active, li.selected, li.current, ' +
        '[class*="episode"][class*="active"], [class*="episode"][class*="current"], [class*="playlist"] .active, [class*="item"][class*="active"]')
    for (const el of candidates) {
        if (el.closest('nav, header, footer, [role="tablist"], [role="menubar"]')) continue
        const siblings = el.parentElement ? el.parentElement.children.length : 0
        const text = short(el.textContent)
        if (siblings >= 2 && text.length >= 3) {
            info.active = text
            break
        }
    }

    const meta = n => clean((document.querySelector(`meta[property="${n}"], meta[name="${n}"]`) || {}).content)
    info.og = meta('og:title')
    info.site = meta('og:site_name')
    info.h1 = short((document.querySelector('h1') || {}).textContent)
    return info
}

// Tab-Titel ohne angehängten Seitennamen ("Folge 1 - Serie | Play SRF" → "Folge 1 - Serie")
function stripSiteName(title, site, host) {
    const parts = title.split(/\s+[|–—-]\s+/)
    if (parts.length < 2) return title
    const last = parts[parts.length - 1].toLowerCase().replace(/\s+/g, '')
    const hostWord = (host || '').replace(/^www\./, '').split('.')[0]
    if ((site && last === site.toLowerCase().replace(/\s+/g, '')) || (hostWord && last.includes(hostWord))) {
        return parts.slice(0, -1).join(' - ')
    }
    return title
}

// bester Name aus allen Frames: Media Session > schema.org > aktiver Listeneintrag > Tab-Titel
function pickName(frames) {
    const top = frames.find(f => f.top) || frames[0] || {}
    let host = ''
    try { host = new URL(currentTab.url).hostname } catch (e) {}
    const base = stripSiteName(currentTab.title || top.title || '', top.site, host)
    const contains = (a, b) => a.toLowerCase().includes(b.toLowerCase())

    const session = frames.map(f => f.session).find(Boolean)
    if (session) {
        const prefix = [session.album, session.artist].find(p => p && !contains(session.title, p))
        return prefix ? `${prefix} - ${session.title}` : session.title
    }
    const ld = frames.map(f => f.ld).find(Boolean)
    if (ld) return ld
    const active = frames.map(f => f.active).find(Boolean)
    if (active) return base && !contains(base, active) ? `${base} - ${active}` : active
    return base || top.og || top.h1 || 'video'
}

async function scanDom() {
    try {
        const results = await chrome.scripting.executeScript({
            target: {tabId: currentTab.id, allFrames: true},
            func: collectFromFrame
        })
        return results.map(r => r.result).filter(Boolean)
    } catch (e) {
        return []
    }
}

const subtitleListEl = document.getElementById('subtitleList')
const streamSubtitlesEl = document.getElementById('streamSubtitles')

function renderSubtitles(subs) {
    subtitleListEl.innerHTML = ''
    if (!subs.length) {
        subtitleListEl.innerHTML = '<li class="empty">Keine separaten Untertitel-Dateien gefunden.</li>'
        return
    }
    subs.forEach(sub => {
        const li = document.createElement('li')
        li.innerHTML = '<input type="checkbox" checked><span class="tag"></span><span class="url"></span>'
        li.querySelector('input').subtitle = sub
        li.querySelector('.tag').textContent = sub.lang || '?'
        li.querySelector('.url').textContent = sub.url.split('?')[0].split('/').pop()
        li.title = sub.url
        subtitleListEl.appendChild(li)
    })
}

function selectedSubtitles() {
    return Array.from(subtitleListEl.querySelectorAll('input:checked')).map(el => ({url: el.subtitle.url, lang: el.subtitle.lang}))
}

chrome.storage.local.get('streamSubtitles', ({streamSubtitles}) => { streamSubtitlesEl.checked = streamSubtitles !== false })
streamSubtitlesEl.onchange = () => chrome.storage.local.set({streamSubtitles: streamSubtitlesEl.checked})

async function renderMedia() {
    let media = await chrome.runtime.sendMessage({command: 'getMedia', tabId: currentTab.id}) || []
    const frames = await scanDom()
    // vom Benutzer geänderter Name bleibt beim erneuten Scannen erhalten
    if (!nameInput.dataset.edited) nameInput.value = safeName(pickName(frames))
    frames.flatMap(f => f.urls).forEach(url => {
        if (!media.some(m => m.url === url)) {
            media.push({url, kind: /\.m3u8(\?|#|$)/i.test(url) ? 'hls' : /\.mpd(\?|#|$)/i.test(url) ? 'dash' : 'file', size: 0})
        }
    })

    frames.flatMap(f => f.tracks || []).forEach(t => {
        if (!media.some(m => m.url === t.url)) media.push({url: t.url, kind: 'subtitle', lang: t.lang})
    })
    // Untertitel-Dateien separat anzeigen (werden beim Download mitgenommen)
    renderSubtitles(media.filter(m => m.kind === 'subtitle'))
    media = media.filter(m => m.kind !== 'subtitle')

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
            await chrome.runtime.sendMessage({
                command: 'startDownload', url: m.url, kind: m.kind, name: safeName(nameInput.value),
                subtitles: selectedSubtitles(), streamSubtitles: streamSubtitlesEl.checked
            })
        }
        li.appendChild(btn)
        listEl.appendChild(li)
    })
}

// ---- laufende Downloads ----
const STATE_LABEL = {queued: 'Wartet', running: 'Lädt', converting: 'Wandelt um', uploading: 'Lädt hoch', done: 'Fertig', error: 'Fehler', cancelled: 'Abgebrochen'}
const FINISHED = ['done', 'error', 'cancelled']

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
        li.querySelector('.label').textContent = FINISHED.includes(j.state) ? '' : j.label
        if (!FINISHED.includes(j.state) && j.state !== 'queued') {
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
        if (!FINISHED.includes(j.state)) {
            const cancel = document.createElement('button')
            cancel.className = 'btn small cancel'
            cancel.textContent = 'Abbrechen'
            cancel.onclick = () => {
                cancel.disabled = true
                chrome.runtime.sendMessage({command: 'cancelJob', id: j.id})
            }
            li.appendChild(cancel)
        }
        jobListEl.appendChild(li)
    })
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.jobs) renderJobs()
})

nameInput.addEventListener('input', () => { nameInput.dataset.edited = '1' })
document.getElementById('rescan').onclick = () => {
    delete nameInput.dataset.edited
    renderMedia()
}
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
