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
        if (/^(subtitles|captions|)$/.test(t.kind || '') && /^https?:/.test(t.src)) tracks.push({url: t.src, lang: clean(t.srclang).toLowerCase(), label: clean(t.label)})
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
                    const series = (o.partOfSeries && o.partOfSeries.name) || (o.partOfTVSeries && o.partOfTVSeries.name)
                    const season = o.partOfSeason && (o.partOfSeason.seasonNumber || o.partOfSeason.name)
                    info.ld = clean([series && series !== o.name ? series : '', o.name].filter(Boolean).join(' - '))
                    info.ldEp = {
                        series: clean(series), title: clean(o.name),
                        season: parseInt(season, 10) || 0, episode: parseInt(o.episodeNumber, 10) || 0,
                        year: types.some(t => /Movie/.test(t)) ? (String(o.datePublished || o.dateCreated || o.releasedEvent && o.releasedEvent.startDate || '').match(/\b(19|20)\d{2}\b/) || [''])[0] : ''
                    }
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
    info.ogType = meta('og:type')
    info.ogEp = {series: meta('video:series'), season: meta('video:season'), episode: meta('video:episode')}
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

// ---- Staffel/Folge erkennen ----
// "S01E02", "S01-E02", "s1 e2", "1x02", "Staffel 1 Folge 2", "Season 1, Episode 2", "Saison 1 Épisode 2", "Folge 7", "Eps 4"
const EP_WORD = '(?:folge|episode|episodio|ep|eps|teil|capitulo|aflevering|odcinek|bolum|avsnitt)'
const SEASON_WORD = '(?:staffel|season|saison|stagione|temporada|seizoen|sezon|sesong)'
const EP_PATTERNS = [
    [new RegExp('(?:^|[^a-z0-9])s(\\d{1,2})[\\s._-]*e(\\d{1,3})(?![0-9])', 'i'), m => ({season: +m[1], episode: +m[2]})],
    [new RegExp('(?:^|[^a-z0-9])(\\d{1,2})x(\\d{2,3})(?![0-9])', 'i'), m => ({season: +m[1], episode: +m[2]})],
    [new RegExp(SEASON_WORD + '\\.?\\s*(\\d{1,2})[^0-9a-z]{0,6}(?:[a-z]+\\s+)?' + EP_WORD + '\\.?\\s*(\\d{1,3})(?![0-9])', 'i'), m => ({season: +m[1], episode: +m[2]})],
    [new RegExp('(?:^|[^a-z0-9])' + EP_WORD + '\\.?\\s*(\\d{1,3})(?![0-9])', 'i'), m => ({season: 0, episode: +m[1]})],
    [new RegExp('(?:^|[^a-z0-9])(\\d{1,3})\\.\\s*' + EP_WORD + '(?![a-z])', 'i'), m => ({season: 0, episode: +m[1]})], // "2. Folge"
]

function plain(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// liefert {season, episode, index, length} (index/length beziehen sich auf den Originaltext)
function parseEpisode(text) {
    const t = plain(text)
    for (const [re, fn] of EP_PATTERNS) {
        const m = t.match(re)
        if (m && +m[m.length - 1] > 0) {
            const lead = m[0].search(/[a-z0-9]/i)
            return {...fn(m), index: m.index + lead, length: m[0].length - lead}
        }
    }
    return null
}

const pad = n => String(n).padStart(2, '0')
const epCode = ep => (ep.season ? `S${pad(ep.season)}` : '') + `E${pad(ep.episode)}`

// Name mit Staffel/Folge im einheitlichen Format: "Serie - S01E02 - Titel"
function withEpisode(name, ep) {
    if (!ep || !ep.episode) return name
    const found = parseEpisode(name)
    if (found) {
        // vorhandene Angabe vereinheitlichen; fehlende Staffel aus anderen Quellen ergänzen
        const merged = {season: found.season || (found.episode === ep.episode ? ep.season : 0), episode: found.episode}
        const before = name.slice(0, found.index).replace(/[\s\-–—|:,]+$/, '')
        const after = name.slice(found.index + found.length).replace(/^[\s\-–—|:,]+/, '')
        return [before, epCode(merged), after].filter(Boolean).join(' - ')
    }
    const parts = name.split(/\s+-\s+/)
    if (parts.length > 1) return [parts[0], epCode(ep), ...parts.slice(1)].join(' - ')
    return `${name} - ${epCode(ep)}`
}

// typische Zusätze von Streaming-Seiten entfernen
function stripNoise(title) {
    return title
        .replace(/^\s*(?:watch|jetzt ansehen|jetzt streamen|ansehen|regarder|guarda|ver)\s*[:\-–]?\s+/i, '')
        .replace(/\s*[\-–|(]?\s*(?:ganze folge|full episode|in voller länge|online (?:anschauen|ansehen|schauen|sehen|streamen)|stream(?:en)? online|watch online|kostenlos|gratis|in hd|hd|4k|uhd)\s*\)?\s*$/i, '')
        .trim()
}

// bester Name aus allen Frames: Media Session > schema.org > aktiver Listeneintrag > Tab-Titel
// danach Staffel/Folge (aus Name, schema.org, Meta-Tags, Seiten- und Medien-URLs) und bei Filmen das Jahr ergänzen
function pickName(frames, media = []) {
    const top = frames.find(f => f.top) || frames[0] || {}
    let host = ''
    try { host = new URL(currentTab.url).hostname } catch (e) {}
    const base = stripNoise(stripSiteName(currentTab.title || top.title || '', top.site, host))
    const contains = (a, b) => a.toLowerCase().includes(b.toLowerCase())

    let name
    const session = frames.map(f => f.session).find(Boolean)
    const ld = frames.map(f => f.ld).find(Boolean)
    const active = frames.map(f => f.active).find(Boolean)
    if (session) {
        const prefix = [session.album, session.artist].find(p => p && !contains(session.title, p))
        name = prefix ? `${prefix} - ${session.title}` : session.title
    } else if (ld) {
        name = ld
    } else if (active) {
        name = base && !contains(base, active) ? `${base} - ${active}` : active
    } else {
        name = base || stripNoise(top.og || '') || top.h1 || 'video'
    }

    // Staffel/Folge: strukturierte Daten zuerst, dann Texte, dann URLs (Seite, Video, Untertitel)
    const ldEp = frames.map(f => f.ldEp).find(e => e && e.episode)
    const ogEp = frames.map(f => f.ogEp).find(e => e && +e.episode)
    let ep = ldEp ? {season: ldEp.season, episode: ldEp.episode} : ogEp ? {season: +ogEp.season || 0, episode: +ogEp.episode} : null
    const urlName = u => { try { return decodeURIComponent(new URL(u).pathname) } catch (e) { return u || '' } }
    const sources = [name, base, top.og, top.h1, active, urlName(currentTab.url), ...media.map(m => urlName(m.url))]
    for (const s of sources) {
        const found = s && parseEpisode(s)
        if (!found) continue
        if (!ep) ep = found
        else if (!ep.season && found.season && found.episode === ep.episode) ep.season = found.season
        if (ep.season) break
    }
    // nur Folge ohne Staffel aus einer URL ist zu unsicher (z. B. "/ep/123")
    if (ep && !ep.season && !ldEp && !ogEp && !sources.slice(0, 5).some(s => s && parseEpisode(s))) ep = null
    name = withEpisode(name, ep)

    // Film: Jahr anhängen ("Titel (2021)")
    const year = frames.map(f => f.ldEp && f.ldEp.year).find(Boolean)
    if (year && !ep && !/\b(19|20)\d{2}\b/.test(name)) name += ` (${year})`
    return name
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

const qualityEl = document.getElementById('quality')
chrome.storage.local.get('quality', ({quality}) => { if (quality) qualityEl.value = quality })
qualityEl.onchange = () => chrome.storage.local.set({quality: qualityEl.value})

chrome.storage.local.get('streamSubtitles', ({streamSubtitles}) => { streamSubtitlesEl.checked = streamSubtitles !== false })
streamSubtitlesEl.onchange = () => chrome.storage.local.set({streamSubtitles: streamSubtitlesEl.checked})

async function renderMedia() {
    let media = await chrome.runtime.sendMessage({command: 'getMedia', tabId: currentTab.id}) || []
    const frames = await scanDom()
    frames.flatMap(f => f.urls).forEach(url => {
        if (!media.some(m => m.url === url)) {
            media.push({url, kind: /\.m3u8(\?|#|$)/i.test(url) ? 'hls' : /\.mpd(\?|#|$)/i.test(url) ? 'dash' : 'file', size: 0})
        }
    })

    // <track>-Untertitel: Sprache aus Attributen/URL, sonst aus dem Inhalt
    for (const t of frames.flatMap(f => f.tracks || [])) {
        if (media.some(m => m.url === t.url)) continue
        if (isNonSubtitleUrl(t.url)) continue
        let lang = guessLang(t.lang, t.label, t.url), text = ''
        try { text = await (await fetch(t.url, {credentials: 'include'})).text() } catch (e) {}
        if (isThumbnailVtt(text)) continue
        if (!lang) lang = langFromText(text)
        if (lang) media.push({url: t.url, kind: 'subtitle', lang})
    }
    // vom Benutzer geänderter Name bleibt beim erneuten Scannen erhalten
    if (!nameInput.dataset.edited) nameInput.value = safeName(pickName(frames, media))

    // Untertitel-Dateien separat anzeigen (werden beim Download mitgenommen)
    renderSubtitles(media.filter(m => m.kind === 'subtitle' && m.lang))
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
                subtitles: selectedSubtitles(), streamSubtitles: streamSubtitlesEl.checked, quality: qualityEl.value
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
