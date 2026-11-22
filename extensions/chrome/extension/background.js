const NATIVE_HOST = 'com.lunuc.ffmpeg'

// ===================== Nachrichten =====================
chrome.runtime.onMessage.addListener((message, sender, callback) => {
    if (message.target === 'offscreen') return // ist für das Offscreen-Dokument bestimmt

    switch (message.command) {
        // ---- YouTube mp3 (bestehend) ----
        case 'ytCookies':
            chrome.cookies.getAll({domain: 'youtube.com'}, callback)
            return true

        // ---- Medien-Erkennung ----
        case 'getMedia':
            getMedia(message.tabId).then(callback)
            return true
        case 'clearMedia':
            clearMedia(message.tabId)
            callback(true)
            return

        // ---- Download-Aufträge (Popup) ----
        case 'startDownload':
            startJob(message).then(callback)
            return true
        case 'clearJobs':
            mutateJobs(jobs => jobs.filter(j => !FINISHED.includes(j.state))).then(() => callback(true))
            return true
        case 'cancelJob':
            cancelJob(message.id).then(() => callback(true))
            return true

        // ---- vom Offscreen-Dokument ----
        case 'claimJob':
            claimJob().then(callback)
            return true
        case 'jobProgress':
            updateJob(message.id, {progress: message.progress, label: message.label})
            return
        case 'saveFile':
            saveBlob(message.id, message.blobUrl, message.filename).then(callback, e => callback({error: e.message}))
            return true
        case 'downloadUrl':
            startUrlDownload(message.id, message.url, message.filename).then(callback, e => callback({error: e.message}))
            return true
        case 'downloadState':
            chrome.downloads.search({id: message.downloadId}, ([item]) => callback(item || null))
            return true
        case 'nativeAvailable':
            nativeRequest({cmd: 'ping'}).then(res => callback(!!(res && res.ok)))
            return true
        case 'jobFiles':
            // Status sofort setzen, damit das Offscreen-Dokument danach geschlossen werden kann
            updateJob(message.id, {state: 'converting', progress: 0, label: 'Wandle um…'})
                .then(() => finishJob(message.id, message.files, message.name))
            return
        case 'jobError':
            failJob(message.id, message.message)
            return
        case 'offscreenIdle':
            closeOffscreenIfIdle()
            return
    }
})

// ===================== Medien-Erkennung =====================
const MEDIA_EXT = /\.(mp4|m4v|webm|mov|mkv|m3u8|mpd)(\?|#|$)/i
const SEGMENT_EXT = /\.(ts|m4s|aac|m4a|dash|cmfv|cmfa)(\?|#|$)/i
const SUBTITLE_EXT = /\.(vtt|webvtt|srt)(\?|#|$)/i
// Teilstücke von Untertiteln aus HLS-Playlists (die werden über die Playlist geladen)
const SUBTITLE_SEGMENT = /(seg|segment|chunk|frag|fragment|part)[-_]?\d+[^/]*\.(vtt|webvtt)(\?|#|$)|[-_]\d{3,}\.(vtt|webvtt)(\?|#|$)/i

// Sprache aus dem Dateinamen bzw. Parameter: "film_en.srt", "subs.de-CH.vtt", "?lang=fr"
function guessLang(url) {
    try {
        const u = new URL(url)
        const param = u.searchParams.get('lang') || u.searchParams.get('language')
        if (param) return param.toLowerCase().slice(0, 5)
        const m = u.pathname.match(/[._-]([a-z]{2,3})(?:[-_][a-z]{2})?\.(?:vtt|webvtt|srt)$/i)
        return m ? m[1].toLowerCase() : ''
    } catch (e) {
        return ''
    }
}

// Schreibzugriffe nacheinander ausführen, sonst gehen bei vielen gleichzeitigen Requests Einträge verloren
let queue = Promise.resolve()

function serial(fn) {
    const p = queue.then(fn)
    queue = p.catch(e => console.warn(e))
    return p
}

async function getMedia(tabId) {
    const key = 'media_' + tabId
    const data = await chrome.storage.session.get(key)
    return data[key] || []
}

function addMedia(tabId, entry) {
    if (tabId < 0) return
    serial(async () => {
        const list = await getMedia(tabId)
        if (list.some(m => m.url === entry.url)) return
        list.push(entry)
        await chrome.storage.session.set({['media_' + tabId]: list.slice(-50)})
    })
}

function clearMedia(tabId) {
    serial(() => chrome.storage.session.remove('media_' + tabId))
}

chrome.webRequest.onHeadersReceived.addListener(details => {
    if (details.tabId < 0 || details.statusCode >= 400) return
    const url = details.url
    if (url.startsWith('blob:') || url.startsWith('data:')) return
    const headers = details.responseHeaders || []
    const h = name => (headers.find(x => x.name.toLowerCase() === name) || {}).value || ''
    const type = h('content-type').toLowerCase()
    const size = parseInt((h('content-range').split('/')[1]) || h('content-length') || '0', 10)

    // Untertitel als eigene Datei
    if (SUBTITLE_EXT.test(url) || /text\/vtt|subrip|x-srt/.test(type)) {
        if (!SUBTITLE_SEGMENT.test(url)) {
            addMedia(details.tabId, {url, kind: 'subtitle', lang: guessLang(url), type, size, time: Date.now()})
        }
        return
    }

    let kind = null
    if (type.includes('mpegurl') || /\.m3u8(\?|#|$)/i.test(url)) {
        kind = 'hls'
    } else if (type.includes('dash+xml') || /\.mpd(\?|#|$)/i.test(url)) {
        kind = 'dash'
    } else if (type.startsWith('video/') || (MEDIA_EXT.test(url) && !SEGMENT_EXT.test(url))) {
        if (type === 'video/mp2t' || type === 'video/iso.segment' || SEGMENT_EXT.test(url)) return // einzelne Segmente ignorieren
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

// ===================== Download-Aufträge =====================
// Job: {id, name, url, kind, state: queued|running|converting|uploading|done|error, progress, label, message}

async function getJobs() {
    return (await chrome.storage.session.get('jobs')).jobs || []
}

function mutateJobs(fn) {
    return serial(async () => {
        const jobs = await getJobs()
        const result = fn(jobs)
        const next = Array.isArray(result) ? result : jobs
        await chrome.storage.session.set({jobs: next})
        updateBadge(next)
        return result
    })
}

const FINISHED = ['done', 'error', 'cancelled']

// abgebrochene Aufträge werden nicht mehr verändert (verspätete Meldungen werden ignoriert)
function updateJob(id, patch) {
    return mutateJobs(jobs => {
        const job = jobs.find(j => j.id === id)
        if (job && job.state !== 'cancelled') Object.assign(job, patch)
    })
}

async function getJob(id) {
    return (await getJobs()).find(j => j.id === id)
}

// Download-IDs eines Auftrags merken (zum Abbrechen und Aufräumen)
function addDownloadId(id, downloadId) {
    return mutateJobs(jobs => {
        const job = jobs.find(j => j.id === id)
        if (job) job.downloadIds = [...(job.downloadIds || []), downloadId]
    })
}

// laufende Verbindungen zum ffmpeg-Helfer pro Auftrag
const nativePorts = new Map()

async function cancelJob(id) {
    const job = await mutateJobs(jobs => {
        const j = jobs.find(j => j.id === id)
        if (!j || FINISHED.includes(j.state)) return {job: null}
        j.state = 'cancelled'
        j.label = 'Abgebrochen'
        j.message = ''
        return {job: {...j}}
    }).then(r => r.job)
    if (!job) return

    // laufenden Download im Offscreen-Dokument stoppen
    chrome.runtime.sendMessage({target: 'offscreen', cmd: 'cancel', id}).catch(() => {})
    // ffmpeg bzw. Upload stoppen: der Helfer beendet sich, sobald die Verbindung getrennt wird
    const port = nativePorts.get(id)
    if (port) {
        nativePorts.delete(id)
        port.disconnect()
    }
    removeJobDownloads(job.downloadIds)
}

// Teildateien eines abgebrochenen Auftrags löschen und aus der Download-Liste entfernen
function removeJobDownloads(downloadIds = []) {
    for (const downloadId of downloadIds) {
        chrome.downloads.cancel(downloadId).catch(() => {})
            .then(() => chrome.downloads.removeFile(downloadId)).catch(() => {})
            .then(() => chrome.downloads.erase({id: downloadId})).catch(() => {})
    }
}

function updateBadge(jobs) {
    const active = jobs.filter(j => ['queued', 'running', 'converting', 'uploading'].includes(j.state))
    if (!active.length) {
        chrome.action.setBadgeText({text: ''})
        return
    }
    const current = active.find(j => j.state !== 'queued') || active[0]
    const pct = Math.round((current.progress || 0) * 100)
    chrome.action.setBadgeBackgroundColor({color: current.state === 'uploading' ? '#1a5fb4' : '#2b7a3d'})
    chrome.action.setBadgeText({text: current.state === 'queued' ? '…' : pct + '%'})
}

async function startJob({url, kind, name, subtitles, streamSubtitles}) {
    const job = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        url, kind, name: name || 'video',
        // separate Untertitel-Dateien [{url, lang}] und ob Untertitel aus dem Stream mitkommen
        subtitles: subtitles || [], streamSubtitles: streamSubtitles !== false,
        state: 'queued', progress: 0, label: 'Wartet…', message: '', time: Date.now()
    }
    await mutateJobs(jobs => { jobs.push(job) })
    await ensureOffscreen()
    chrome.runtime.sendMessage({target: 'offscreen', cmd: 'wake'}).catch(() => {})
    return job
}

// Das Offscreen-Dokument holt sich den nächsten wartenden Auftrag
function claimJob() {
    return mutateJobs(jobs => {
        const job = jobs.find(j => j.state === 'queued')
        if (job) {
            job.state = 'running'
            job.label = 'Lade…'
        }
        // Rückgabe als Objekt, damit mutateJobs die Liste nicht ersetzt
        return {job: job ? {...job} : null}
    }).then(r => r.job)
}

async function failJob(id, message) {
    const job = await getJob(id)
    if (!job || job.state === 'cancelled') return
    await updateJob(id, {state: 'error', label: 'Fehler', message})
    notify('Download fehlgeschlagen', `${job.name}: ${message}`)
}

// ===================== Offscreen-Dokument =====================
let creatingOffscreen = null

async function ensureOffscreen() {
    if (await chrome.offscreen.hasDocument()) return
    if (!creatingOffscreen) {
        creatingOffscreen = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['BLOBS', 'DOM_PARSER'],
            justification: 'Video-Streams im Hintergrund herunterladen und zusammensetzen'
        }).finally(() => { creatingOffscreen = null })
    }
    await creatingOffscreen
}

function closeOffscreenIfIdle() {
    return serial(async () => {
        const jobs = await getJobs()
        if (jobs.some(j => j.state === 'queued' || j.state === 'running')) return
        if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument().catch(() => {})
    })
}

// ===================== Dateien speichern =====================
function waitForDownload(id) {
    return new Promise((resolve, reject) => {
        const check = () => chrome.downloads.search({id}, ([item]) => {
            if (!item) return done(reject, new Error('Download nicht gefunden'))
            if (item.state === 'complete') return done(resolve, {filename: item.filename.split(/[\\/]/).pop(), path: item.filename})
            if (item.state === 'interrupted') return done(reject, new Error('Download unterbrochen: ' + item.error))
        })
        const listener = delta => { if (delta.id === id && delta.state) check() }
        const done = (fn, value) => {
            chrome.downloads.onChanged.removeListener(listener)
            fn(value)
        }
        chrome.downloads.onChanged.addListener(listener)
        check()
    })
}

function downloadNoDialog(url, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({url, filename, saveAs: false, conflictAction: 'uniquify'}, id => {
            if (chrome.runtime.lastError || id === undefined) {
                reject(new Error('Download fehlgeschlagen: ' + (chrome.runtime.lastError?.message || '')))
            } else {
                resolve(id)
            }
        })
    })
}

async function saveBlob(id, blobUrl, filename) {
    const downloadId = await downloadNoDialog(blobUrl, filename)
    await addDownloadId(id, downloadId)
    return waitForDownload(downloadId)
}

async function startUrlDownload(id, url, filename) {
    const downloadId = await downloadNoDialog(url, filename)
    await addDownloadId(id, downloadId)
    return {downloadId}
}

// ===================== ffmpeg-Helfer + Upload =====================
function nativeRequest(message) {
    return new Promise(resolve => {
        try {
            chrome.runtime.sendNativeMessage(NATIVE_HOST, message, res => resolve(chrome.runtime.lastError ? null : res))
        } catch (e) {
            resolve(null)
        }
    })
}

async function ftpSettings() {
    return (await chrome.storage.local.get('ftp')).ftp || null
}

function convertNative(id, files, name, ftp) {
    return new Promise((resolve, reject) => {
        const port = chrome.runtime.connectNative(NATIVE_HOST)
        nativePorts.set(id, port)
        let finished = false
        updateJob(id, {state: 'converting', progress: 0, label: 'Wandle um…'})
        port.onMessage.addListener(msg => {
            if (msg.progress !== undefined) {
                const uploading = msg.phase === 'upload'
                updateJob(id, {
                    state: uploading ? 'uploading' : 'converting',
                    progress: msg.progress,
                    label: uploading ? 'Lade hoch…' : 'Wandle um…'
                })
            } else if (msg.done) {
                finished = true
                port.disconnect()
                resolve(msg)
            } else if (msg.error) {
                finished = true
                port.disconnect()
                reject(new Error(msg.error))
            }
        })
        port.onDisconnect.addListener(() => {
            nativePorts.delete(id)
            if (!finished) reject(new Error(chrome.runtime.lastError?.message || 'ffmpeg-Helfer beendet'))
        })
        port.postMessage({
            cmd: 'convert', outputName: name + '.mp4', deleteInputs: true,
            inputs: files.filter(f => !f.subtitle).map(f => f.path),
            subtitles: files.filter(f => f.subtitle).map(f => ({path: f.path, lang: f.lang})),
            ftp: ftp && ftp.enabled ? ftp : null,
            upload: ftp ? !!ftp.enabled : undefined
        })
    })
}

async function finishJob(id, files, name) {
    const job = await getJob(id)
    if (!job || job.state === 'cancelled') {
        // während des Speicherns abgebrochen
        removeJobDownloads(job && job.downloadIds)
        return
    }
    const ping = await nativeRequest({cmd: 'ping'})
    if (!ping || !ping.ok) {
        const list = files.map(f => f.filename).join(' + ')
        updateJob(id, {state: 'done', progress: 1, label: 'Gespeichert', message: `${list} (ohne Umwandlung, ffmpeg-Helfer nicht installiert)`})
        notify('Download fertig', list)
        return
    }
    try {
        const ftp = await ftpSettings()
        const res = await convertNative(id, files, name, ftp)
        // Teildateien hat der Helfer gelöscht → nur noch aus der Download-Liste entfernen
        for (const downloadId of (await getJob(id)).downloadIds || []) chrome.downloads.erase({id: downloadId}).catch(() => {})
        const file = res.output.split(/[\\/]/).pop()
        const skipped = res.subtitlesSkipped === true ? 1 : +res.subtitlesSkipped || 0 // ältere Helfer liefern true/false
        const subs = [res.subtitles ? `${res.subtitles} Untertitel eingebettet` : '',
            skipped ? `${skipped} fehlerhafte Untertitel übersprungen, liegen als Datei daneben` : ''].filter(Boolean).join(', ')
        const subsText = subs ? ` (${subs})` : ''
        const message = (res.uploaded ? `${file} → ${res.uploaded}` : res.output) + subsText
        updateJob(id, {state: 'done', progress: 1, label: res.uploaded ? 'Hochgeladen' : 'Fertig', message})
        notify(res.uploaded ? 'Hochgeladen' : 'Download fertig', message)
    } catch (e) {
        failJob(id, e.message)
    }
}

function notify(title, message) {
    chrome.notifications.create({type: 'basic', iconUrl: 'icon.png', title, message: String(message).slice(0, 300)})
}
