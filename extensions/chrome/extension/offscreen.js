// Unsichtbares Hintergrund-Dokument: lädt Streams (HLS/DASH) bzw. Dateien herunter und setzt sie zusammen.
// Speichern, ffmpeg und Upload übernimmt der Service Worker (background.js).

const PARALLEL = 6

// Antwortlose Nachrichten lösen sonst "message port closed" aus
const send = message => chrome.runtime.sendMessage(message).catch(e => {
    console.warn(message.command, e.message)
    return null
})

// AbortController des laufenden Auftrags (es läuft immer nur einer)
let current = null

chrome.runtime.onMessage.addListener(message => {
    if (message.target !== 'offscreen') return
    if (message.cmd === 'wake') pump()
    else if (message.cmd === 'cancel' && current && current.id === message.id) current.controller.abort()
})

const signal = () => current && current.controller.signal

// ---------- Warteschlange ----------
let busy = false

async function pump() {
    if (busy) return
    busy = true
    try {
        let job
        while ((job = await send({command: 'claimJob'}))) {
            await runJob(job)
        }
    } finally {
        busy = false
        send({command: 'offscreenIdle'})
    }
}

async function runJob(job) {
    const ctx = makeContext(job)
    current = {id: job.id, controller: new AbortController()}
    try {
        if (job.kind === 'dash') await runDash(ctx)
        else if (job.kind === 'hls') await runHls(ctx)
        else await runFile(ctx)
    } catch (e) {
        // abgebrochen: der Service Worker hat den Auftrag schon als abgebrochen markiert
        if (!signal().aborted) send({command: 'jobError', id: job.id, message: e.message})
    } finally {
        current = null
    }
}

// Fortschritt gedrosselt an den Service Worker melden
function makeContext(job) {
    let last = 0
    return {
        job,
        name: safeName(job.name),
        report(label, progress, force) {
            const now = Date.now()
            if (!force && now - last < 500) return
            last = now
            send({command: 'jobProgress', id: job.id, label, progress})
        }
    }
}

pump()

// ---------- Helfer ----------
function safeName(name) {
    return String(name).replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 120) || 'video'
}

async function fetchText(url) {
    const res = await fetch(url, {credentials: 'include', signal: signal()})
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`)
    return res.text()
}

async function fetchBuffer(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, {credentials: 'include', signal: signal()})
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.arrayBuffer()
        } catch (e) {
            if (signal().aborted) throw e
            if (i === tries - 1) throw new Error(`Segment fehlgeschlagen: ${url} (${e.message})`)
            await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        }
    }
}

async function fetchAll(ctx, urls, label) {
    const parts = new Array(urls.length)
    let done = 0, next = 0
    async function worker() {
        while (next < urls.length) {
            const idx = next++
            parts[idx] = await fetchBuffer(urls[idx])
            done++
            ctx.report(`${label} ${done}/${urls.length}`, done / urls.length, done === urls.length)
        }
    }
    await Promise.all(Array.from({length: PARALLEL}, worker))
    return parts
}

// Blob → Datei im Download-Ordner (ohne Dialog). Gibt {filename, path} zurück.
async function saveParts(ctx, parts, filename, mime) {
    ctx.report(`Speichere ${filename}…`, 1, true)
    const blobUrl = URL.createObjectURL(new Blob(parts, {type: mime}))
    try {
        if (signal().aborted) throw new Error('abgebrochen')
        const res = await send({command: 'saveFile', id: ctx.job.id, blobUrl, filename})
        if (!res || res.error) throw new Error(res ? res.error : 'Speichern fehlgeschlagen')
        return res
    } finally {
        URL.revokeObjectURL(blobUrl)
    }
}

// ---------- Untertitel ----------
// WebVTT-Teilstücke zu einer Datei zusammenführen (Kopfzeilen weg, doppelte Cues an Segmentgrenzen weg)
function mergeVtt(texts) {
    const seen = new Set()
    const cues = []
    for (const text of texts) {
        for (const block of text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/)) {
            const lines = block.trim().split('\n')
            const timing = lines.findIndex(l => l.includes('-->'))
            if (timing < 0) continue // WEBVTT-Kopf, NOTE, STYLE, REGION
            const cue = lines.slice(timing).join('\n')
            if (!seen.has(cue)) {
                seen.add(cue)
                cues.push(cue)
            }
        }
    }
    return 'WEBVTT\n\n' + cues.join('\n\n') + '\n'
}

const decode = buffers => buffers.map(b => new TextDecoder('utf-8').decode(b))

async function loadSubtitle(ctx, src) {
    if (src.kind === 'hls') {
        const {segments} = playlistSegments(await fetchText(src.url), src.url)
        return {format: 'vtt', text: mergeVtt(decode(await fetchAll(ctx, segments, 'Untertitel')))}
    }
    if (src.kind === 'segments') {
        return {format: 'vtt', text: mergeVtt(decode(await fetchAll(ctx, src.urls, 'Untertitel')))}
    }
    const text = await fetchText(src.url)
    if (/^\uFEFF?\s*WEBVTT/.test(text)) return {format: 'vtt', text}
    if (/\d+:\d+:\d+[,.]\d+\s*-->/.test(text)) return {format: 'srt', text}
    throw new Error('Unbekanntes Untertitel-Format')
}

// Untertitel speichern; ein Fehler bei einem Untertitel bricht den Download nicht ab
async function saveSubtitles(ctx, sources) {
    const files = []
    const used = {}
    for (const src of sources) {
        try {
            const {format, text} = await loadSubtitle(ctx, src)
            const lang = (src.lang || 'und').replace(/[^a-z0-9-]/gi, '')
            used[lang] = (used[lang] || 0) + 1
            const filename = `${ctx.name}.${lang}${used[lang] > 1 ? '.' + used[lang] : ''}.${format}`
            files.push({...await saveParts(ctx, [text], filename, 'text/' + format), subtitle: true, lang: src.lang || ''})
        } catch (e) {
            if (signal().aborted) throw e
            console.warn('Untertitel übersprungen', src.url, e.message)
        }
    }
    return files
}

async function finish(ctx, files, streamSubtitles = []) {
    if (signal().aborted) return
    // separat gefundene Dateien + (falls gewünscht) Untertitel aus dem Stream, ohne Doppelte
    const sources = [...(ctx.job.subtitles || []).map(s => ({...s, kind: 'file'})),
        ...(ctx.job.streamSubtitles !== false ? streamSubtitles : [])]
        .filter((s, i, all) => all.findIndex(o => o.url === s.url) === i)
    if (sources.length) files = files.concat(await saveSubtitles(ctx, sources))
    if (signal().aborted) return
    send({command: 'jobFiles', id: ctx.job.id, files, name: ctx.name})
}

// ---------- direkte Datei ----------
async function runFile(ctx) {
    let ext = 'mp4'
    try {
        const m = new URL(ctx.job.url).pathname.match(/\.(\w{2,4})$/)
        if (m) ext = m[1].toLowerCase()
    } catch (e) {}
    // mit ffmpeg-Helfer wird die Datei danach in NAME.mp4 umgewandelt und gelöscht
    const native = await send({command: 'nativeAvailable'})
    const filename = native ? `${ctx.name}.download.${ext}` : `${ctx.name}.${ext}`
    const res = await send({command: 'downloadUrl', id: ctx.job.id, url: ctx.job.url, filename})
    if (!res || res.error) throw new Error(res ? res.error : 'Download fehlgeschlagen')

    for (;;) {
        await new Promise(r => setTimeout(r, 1000))
        // der Service Worker bricht den Browser-Download selbst ab
        if (signal().aborted) return
        const item = await send({command: 'downloadState', downloadId: res.downloadId})
        if (!item) throw new Error('Download nicht gefunden')
        if (item.state === 'interrupted') throw new Error('Download unterbrochen: ' + item.error)
        if (item.state === 'complete') {
            await finish(ctx, [{filename: item.filename.split(/[\\/]/).pop(), path: item.filename}])
            return
        }
        const p = item.totalBytes > 0 ? item.bytesReceived / item.totalBytes : 0
        ctx.report(`Lade ${Math.round(item.bytesReceived / 1048576)} MB`, p, true)
    }
}

// ---------- HLS ----------
function parseAttrs(line) {
    const attrs = {}
    line.replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, (_, k, v) => { attrs[k] = v.replace(/^"|"$/g, '') })
    return attrs
}

// Master-Playlist → beste Variante wählen (+ separate Audiospur, falls vorhanden)
async function resolvePlaylists(url) {
    const text = await fetchText(url)
    if (!text.includes('#EXT-X-STREAM-INF')) return {video: {url, text}, audio: null, subtitles: []}

    const lines = text.split(/\r?\n/)
    let best = null
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const attrs = parseAttrs(lines[i])
            const bw = parseInt(attrs.BANDWIDTH || '0', 10)
            let j = i + 1
            while (j < lines.length && (!lines[j].trim() || lines[j].startsWith('#'))) j++
            if (j < lines.length && (!best || bw > best.bw)) {
                best = {bw, audioGroup: attrs.AUDIO, subtitleGroup: attrs.SUBTITLES, url: new URL(lines[j].trim(), url).href}
            }
        }
    }
    if (!best) throw new Error('Keine Variante in der Master-Playlist gefunden')

    const media = lines.filter(l => l.startsWith('#EXT-X-MEDIA')).map(parseAttrs)
    let audioUrl = null
    if (best.audioGroup) {
        const renditions = media.filter(a => a.TYPE === 'AUDIO' && a['GROUP-ID'] === best.audioGroup && a.URI)
        const pick = renditions.find(a => a.DEFAULT === 'YES') || renditions[0]
        if (pick) audioUrl = new URL(pick.URI, url).href
    }

    // Untertitel-Spuren (alle Sprachen der zur Variante gehörenden Gruppe)
    const subtitles = media
        .filter(a => a.TYPE === 'SUBTITLES' && a.URI && (!best.subtitleGroup || a['GROUP-ID'] === best.subtitleGroup))
        .map(a => ({kind: 'hls', url: new URL(a.URI, url).href, lang: (a.LANGUAGE || '').toLowerCase()}))

    return {
        video: {url: best.url, text: await fetchText(best.url)},
        audio: audioUrl ? {url: audioUrl, text: await fetchText(audioUrl)} : null,
        subtitles
    }
}

function checkPlaylist(text) {
    if (/#EXT-X-KEY:.*METHOD=(?!NONE)/.test(text) || text.includes('#EXT-X-SESSION-KEY')) {
        throw new Error('Dieser Stream ist verschlüsselt bzw. DRM-geschützt und wird nicht unterstützt.')
    }
    if (!text.includes('#EXT-X-ENDLIST')) {
        throw new Error('Das ist ein Live-Stream ohne Ende. Es werden nur abgeschlossene Videos unterstützt.')
    }
}

function playlistSegments(text, playlistUrl) {
    let initUrl = null
    const segments = []
    for (const line of text.split(/\r?\n/)) {
        const l = line.trim()
        if (l.startsWith('#EXT-X-MAP')) {
            initUrl = new URL(parseAttrs(l).URI, playlistUrl).href
        } else if (l && !l.startsWith('#')) {
            segments.push(new URL(l, playlistUrl).href)
        }
    }
    return {initUrl, segments}
}

async function downloadMediaPlaylist(ctx, {url: playlistUrl, text}, label) {
    const {initUrl, segments} = playlistSegments(text, playlistUrl)
    if (!segments.length) throw new Error('Keine Segmente gefunden')

    const parts = await fetchAll(ctx, segments, label)
    if (initUrl) parts.unshift(await fetchBuffer(initUrl))
    return {parts, fmp4: !!initUrl}
}

async function runHls(ctx) {
    const {video, audio, subtitles} = await resolvePlaylists(ctx.job.url)
    checkPlaylist(video.text)
    if (audio) checkPlaylist(audio.text)

    const v = await downloadMediaPlaylist(ctx, video, 'Video')
    const files = [await saveParts(ctx, v.parts, `${ctx.name}${audio ? '.video' : ''}.${v.fmp4 ? 'mp4' : 'ts'}`, v.fmp4 ? 'video/mp4' : 'video/mp2t')]
    v.parts.length = 0 // Speicher freigeben
    if (audio) {
        const a = await downloadMediaPlaylist(ctx, audio, 'Audio')
        files.push(await saveParts(ctx, a.parts, `${ctx.name}.audio.${a.fmp4 ? 'm4a' : 'ts'}`, a.fmp4 ? 'audio/mp4' : 'video/mp2t'))
    }
    await finish(ctx, files, subtitles)
}

// ---------- DASH ----------
// ISO-8601-Dauer (PT1H2M3.5S) → Sekunden
function parseDuration(str) {
    if (!str) return 0
    const m = str.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?/)
    if (!m) return 0
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)
}

function children(el, name) {
    return el ? Array.from(el.children).filter(c => c.localName === name) : []
}

function child(el, name) {
    return children(el, name)[0] || null
}

function resolveBase(el, base) {
    const b = child(el, 'BaseURL')
    return b ? new URL(b.textContent.trim(), base).href : base
}

function fillTemplate(tpl, vars) {
    return tpl.replace(/\$(\w*)(?:%0(\d+)d)?\$/g, (all, key, width) => {
        if (key === '') return '$'
        if (!(key in vars)) return all
        let v = String(vars[key])
        if (width) v = v.padStart(+width, '0')
        return v
    })
}

// Attribut aus SegmentTemplate von Representation, sonst AdaptationSet, sonst Period
function mergedTemplate(rep, set, period) {
    const tpls = [child(rep, 'SegmentTemplate'), child(set, 'SegmentTemplate'), child(period, 'SegmentTemplate')].filter(Boolean)
    if (!tpls.length) return null
    const attr = name => {
        for (const t of tpls) if (t.hasAttribute(name)) return t.getAttribute(name)
        return null
    }
    const timeline = tpls.map(t => child(t, 'SegmentTimeline')).find(Boolean)
    return {attr, timeline}
}

function representationSegments(rep, set, period, base, periodDuration) {
    const repBase = resolveBase(rep, resolveBase(set, base))
    const id = rep.getAttribute('id') || ''
    const bandwidth = rep.getAttribute('bandwidth') || ''

    const tpl = mergedTemplate(rep, set, period)
    if (tpl) {
        const media = tpl.attr('media')
        const init = tpl.attr('initialization')
        const timescale = +(tpl.attr('timescale') || 1)
        const startNumber = +(tpl.attr('startNumber') || 1)
        const vars = {RepresentationID: id, Bandwidth: bandwidth}
        const urls = []
        if (tpl.timeline) {
            let time = 0, number = startNumber
            for (const s of children(tpl.timeline, 'S')) {
                if (s.hasAttribute('t')) time = +s.getAttribute('t')
                const d = +s.getAttribute('d')
                let r = +(s.getAttribute('r') || 0)
                if (r < 0) {
                    const end = periodDuration * timescale
                    r = Math.max(0, Math.ceil((end - time) / d) - 1)
                }
                for (let i = 0; i <= r; i++) {
                    urls.push(new URL(fillTemplate(media, {...vars, Number: number, Time: time}), repBase).href)
                    time += d
                    number++
                }
            }
        } else {
            const duration = +tpl.attr('duration')
            if (!duration || !periodDuration) throw new Error('Segmentanzahl lässt sich nicht bestimmen (Live-Stream?)')
            const count = Math.ceil(periodDuration * timescale / duration)
            for (let i = 0; i < count; i++) {
                urls.push(new URL(fillTemplate(media, {...vars, Number: startNumber + i}), repBase).href)
            }
        }
        return {init: init ? new URL(fillTemplate(init, vars), repBase).href : null, urls}
    }

    const list = child(rep, 'SegmentList') || child(set, 'SegmentList')
    if (list) {
        const initEl = child(list, 'Initialization')
        return {
            init: initEl && initEl.getAttribute('sourceURL') ? new URL(initEl.getAttribute('sourceURL'), repBase).href : null,
            urls: children(list, 'SegmentURL').map(s => new URL(s.getAttribute('media'), repBase).href)
        }
    }

    // SegmentBase / nur BaseURL → eine einzelne Datei
    return {init: null, urls: [repBase]}
}

function pickBest(sets, type) {
    let best = null
    for (const set of sets) {
        for (const rep of children(set, 'Representation')) {
            const mime = rep.getAttribute('mimeType') || set.getAttribute('mimeType') || ''
            const ct = set.getAttribute('contentType') || ''
            if (!(mime.startsWith(type) || ct === type)) continue
            const bw = +(rep.getAttribute('bandwidth') || 0)
            if (!best || bw > best.bw) best = {set, rep, bw, mime}
        }
    }
    return best
}

// WebVTT-Textspuren einer MPD (eingebettete fMP4-Untertitel wvtt/stpp werden nicht unterstützt)
function dashSubtitles(sets, period, base, periodDuration) {
    const subs = []
    for (const set of sets) {
        const rep = child(set, 'Representation')
        if (!rep) continue
        const mime = rep.getAttribute('mimeType') || set.getAttribute('mimeType') || ''
        if (mime !== 'text/vtt') continue
        try {
            const {init, urls} = representationSegments(rep, set, period, base, periodDuration)
            if (init || !urls.length) continue
            subs.push({kind: urls.length > 1 ? 'segments' : 'file', url: urls[0], urls, lang: (set.getAttribute('lang') || '').toLowerCase()})
        } catch (e) {
            console.warn('Untertitel', e)
        }
    }
    return subs
}

async function runDash(ctx) {
    const xml = await fetchText(ctx.job.url)
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const mpd = doc.documentElement
    if (!mpd || mpd.localName !== 'MPD') throw new Error('Keine gültige MPD-Datei')
    if (mpd.getAttribute('type') === 'dynamic') throw new Error('Das ist ein Live-Stream. Es werden nur abgeschlossene Videos unterstützt.')
    if (doc.getElementsByTagNameNS('*', 'ContentProtection').length) {
        throw new Error('Dieser Stream ist DRM-geschützt und wird nicht unterstützt.')
    }

    const periods = children(mpd, 'Period')
    if (periods.length !== 1) throw new Error(`MPD mit ${periods.length} Perioden wird nicht unterstützt.`)
    const period = periods[0]
    const base = resolveBase(period, resolveBase(mpd, ctx.job.url))
    const periodDuration = parseDuration(period.getAttribute('duration')) || parseDuration(mpd.getAttribute('mediaPresentationDuration'))
    const sets = children(period, 'AdaptationSet')

    const video = pickBest(sets, 'video')
    const audio = pickBest(sets, 'audio')
    if (!video && !audio) throw new Error('Keine Video- oder Audiospur gefunden')

    const tracks = []
    if (video) tracks.push({label: 'Video', suffix: '.video.mp4', mime: 'video/mp4', ...video})
    if (audio) tracks.push({label: 'Audio', suffix: '.audio.m4a', mime: 'audio/mp4', ...audio})

    const files = []
    for (const t of tracks) {
        const {init, urls} = representationSegments(t.rep, t.set, period, base, periodDuration)
        const parts = await fetchAll(ctx, urls, t.label)
        if (init) parts.unshift(await fetchBuffer(init))
        files.push(await saveParts(ctx, parts, ctx.name + t.suffix, t.mime))
    }
    await finish(ctx, files, dashSubtitles(sets, period, base, periodDuration))
}
