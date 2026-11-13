const params = new URLSearchParams(location.search)
const sourceUrl = params.get('url')
const baseName = params.get('name') || 'video'
const kind = params.get('kind') || (/\.mpd(\?|#|$)/i.test(params.get('url')) ? 'dash' : 'hls')
const statusEl = document.getElementById('status')
const progressEl = document.getElementById('progress')
document.getElementById('url').textContent = sourceUrl

const PARALLEL = 6
const NATIVE_HOST = 'com.lunuc.ffmpeg'
let nativeAvailable = false
let ftpSettings = null // aus der Einstellungsseite; null = keine gespeichert → Helfer nutzt ggf. config.json

function status(text, isError) {
    statusEl.textContent = text
    statusEl.className = isError ? 'error' : ''
}

async function fetchText(url) {
    const res = await fetch(url, {credentials: 'include'})
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`)
    return res.text()
}

async function fetchBuffer(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url, {credentials: 'include'})
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.arrayBuffer()
        } catch (e) {
            if (i === tries - 1) throw new Error(`Segment fehlgeschlagen: ${url} (${e.message})`)
            await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        }
    }
}

function parseAttrs(line) {
    const attrs = {}
    line.replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, (_, k, v) => { attrs[k] = v.replace(/^"|"$/g, '') })
    return attrs
}

// Master-Playlist → beste Variante wählen (+ separate Audiospur, falls vorhanden)
async function resolvePlaylists(url) {
    const text = await fetchText(url)
    if (!text.includes('#EXT-X-STREAM-INF')) return {video: {url, text}, audio: null}

    const lines = text.split(/\r?\n/)
    let best = null
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
            const attrs = parseAttrs(lines[i])
            const bw = parseInt(attrs.BANDWIDTH || '0', 10)
            let j = i + 1
            while (j < lines.length && (!lines[j].trim() || lines[j].startsWith('#'))) j++
            if (j < lines.length && (!best || bw > best.bw)) {
                best = {bw, audioGroup: attrs.AUDIO, url: new URL(lines[j].trim(), url).href}
            }
        }
    }
    if (!best) throw new Error('Keine Variante in der Master-Playlist gefunden')

    // separate Audio-Rendition (EXT-X-MEDIA TYPE=AUDIO mit URI)
    let audioUrl = null
    if (best.audioGroup) {
        const renditions = lines.filter(l => l.startsWith('#EXT-X-MEDIA')).map(parseAttrs)
            .filter(a => a.TYPE === 'AUDIO' && a['GROUP-ID'] === best.audioGroup && a.URI)
        const pick = renditions.find(a => a.DEFAULT === 'YES') || renditions[0]
        if (pick) audioUrl = new URL(pick.URI, url).href
    }

    return {
        video: {url: best.url, text: await fetchText(best.url)},
        audio: audioUrl ? {url: audioUrl, text: await fetchText(audioUrl)} : null
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

async function downloadMediaPlaylist({url: playlistUrl, text}, label) {
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
    if (!segments.length) throw new Error('Keine Segmente gefunden')

    const parts = await fetchAll(segments, `${label}: Segment`)
    if (initUrl) parts.unshift(await fetchBuffer(initUrl))
    return {parts, fmp4: !!initUrl}
}

async function runHls() {
    const {video, audio} = await resolvePlaylists(sourceUrl)
    checkPlaylist(video.text)
    if (audio) checkPlaylist(audio.text)

    const name = safeName(baseName)
    const v = await downloadMediaPlaylist(video, 'Video')
    const files = [await saveParts(v.parts, `${name}${audio ? '.video' : ''}.${v.fmp4 ? 'mp4' : 'ts'}`, v.fmp4 ? 'video/mp4' : 'video/mp2t')]
    if (audio) {
        const au = await downloadMediaPlaylist(audio, 'Audio')
        files.push(await saveParts(au.parts, `${name}.audio.${au.fmp4 ? 'm4a' : 'ts'}`, au.fmp4 ? 'audio/mp4' : 'video/mp2t'))
    }
    await finish(files, name)
}

// ---------- gemeinsame Helfer ----------

function safeName(name) {
    return name.replace(/[\\/:*?"<>|]+/g, '_')
}

async function fetchAll(urls, label) {
    const parts = new Array(urls.length)
    let done = 0, next = 0
    progressEl.max = urls.length
    progressEl.value = 0
    async function worker() {
        while (next < urls.length) {
            const idx = next++
            parts[idx] = await fetchBuffer(urls[idx])
            done++
            progressEl.value = done
            status(`${label} ${done} / ${urls.length}`)
        }
    }
    await Promise.all(Array.from({length: PARALLEL}, worker))
    return parts
}

// Speichert die Teile als Datei. Gibt {filename, path} zurück (path = tatsächlicher Pfad auf der Platte)
function saveParts(parts, filename, mime) {
    status(`${filename} wird gespeichert…`)
    const blobUrl = URL.createObjectURL(new Blob(parts, {type: mime}))
    return new Promise((resolve, reject) => {
        // mit ffmpeg-Helfer: Zwischendateien ohne Dialog in den Download-Ordner
        chrome.downloads.download({url: blobUrl, filename, saveAs: !nativeAvailable, conflictAction: 'uniquify'}, id => {
            if (chrome.runtime.lastError || id === undefined) {
                return reject(new Error('Download abgebrochen: ' + (chrome.runtime.lastError?.message || '')))
            }
            const check = () => chrome.downloads.search({id}, ([item]) => {
                if (!item) return reject(new Error('Download nicht gefunden'))
                if (item.state === 'complete') {
                    URL.revokeObjectURL(blobUrl)
                    resolve({filename: item.filename.split(/[\\/]/).pop(), path: item.filename})
                } else if (item.state === 'interrupted') {
                    reject(new Error('Download unterbrochen: ' + item.error))
                } else {
                    setTimeout(check, 300)
                }
            })
            check()
        })
    })
}

// ---------- ffmpeg über Native Messaging ----------

function pingNative() {
    return new Promise(resolve => {
        try {
            chrome.runtime.sendNativeMessage(NATIVE_HOST, {cmd: 'ping', ftp: ftpSettings && ftpSettings.enabled ? ftpSettings : null}, res => {
                resolve(!chrome.runtime.lastError && res)
            })
        } catch (e) {
            resolve(false)
        }
    })
}

// inputs: [{path}] → eine MP4 mit -movflags +faststart, Zwischendateien werden gelöscht
function convertNative(inputs, outputName) {
    return new Promise((resolve, reject) => {
        const port = chrome.runtime.connectNative(NATIVE_HOST)
        progressEl.max = 1
        progressEl.value = 0
        status('Wandle mit ffmpeg um…')
        port.onMessage.addListener(msg => {
            if (msg.progress !== undefined) {
                progressEl.value = msg.progress
                const label = msg.phase === 'upload' ? 'Lade auf FTP hoch…' : 'Wandle mit ffmpeg um…'
                status(`${label} ${Math.round(msg.progress * 100)}%`)
            } else if (msg.done) {
                port.disconnect()
                resolve(msg.uploaded ? `${msg.output} → hochgeladen nach ${msg.uploaded}` : msg.output)
            } else if (msg.error) {
                port.disconnect()
                reject(new Error('ffmpeg: ' + msg.error))
            }
        })
        port.onDisconnect.addListener(() => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        })
        port.postMessage({
            cmd: 'convert', inputs: inputs.map(i => i.path), outputName, deleteInputs: true,
            ftp: ftpSettings && ftpSettings.enabled ? ftpSettings : null,
            upload: ftpSettings ? !!ftpSettings.enabled : undefined
        })
    })
}

function shellQuote(f) {
    return '"' + f.filename + '"'
}

// Abschluss: automatisch umwandeln oder ffmpeg-Befehl anzeigen
async function finish(files, name) {
    if (nativeAvailable) {
        const output = await convertNative(files, name + '.mp4')
        progressEl.value = progressEl.max
        status(`Fertig: ${output}`)
        return
    }
    const maps = files.length > 1 ? ' -map 0:v -map 1:a' : ''
    status(`Fertig: ${files.map(f => f.filename).join(' + ')}. Umwandeln mit: ffmpeg ${files.map(f => '-i ' + shellQuote(f)).join(' ')}${maps} -c copy -movflags +faststart "${name}.mp4"` +
        ' (oder den ffmpeg-Helfer installieren, siehe native-host/README.md)')
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

async function runDash() {
    document.getElementById('title').textContent = 'DASH-Stream herunterladen'
    const xml = await fetchText(sourceUrl)
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
    const base = resolveBase(period, resolveBase(mpd, sourceUrl))
    const periodDuration = parseDuration(period.getAttribute('duration')) || parseDuration(mpd.getAttribute('mediaPresentationDuration'))
    const sets = children(period, 'AdaptationSet')

    const video = pickBest(sets, 'video')
    const audio = pickBest(sets, 'audio')
    if (!video && !audio) throw new Error('Keine Video- oder Audiospur gefunden')

    const tracks = []
    if (video) tracks.push({label: 'Video', suffix: '.video.mp4', mime: 'video/mp4', ...video})
    if (audio) tracks.push({label: 'Audio', suffix: video ? '.audio.m4a' : '.m4a', mime: 'audio/mp4', ...audio})

    const name = safeName(baseName)
    const files = []
    for (const t of tracks) {
        const {init, urls} = representationSegments(t.rep, t.set, period, base, periodDuration)
        const parts = await fetchAll(urls, `${t.label}: Segment`)
        if (init) parts.unshift(await fetchBuffer(init))
        const fname = name + (video && audio ? t.suffix : (t.label === 'Video' ? '.video.mp4' : '.m4a'))
        files.push(await saveParts(parts, fname, t.mime))
    }
    await finish(files, name)
}

chrome.storage.local.get('ftp')
    .then(({ftp}) => { ftpSettings = ftp || null })
    .then(pingNative)
    .then(ok => {
        nativeAvailable = !!(ok && ok.ok)
        document.getElementById('ffmpeg').textContent = nativeAvailable
            ? 'ffmpeg-Helfer gefunden: Die Datei wird danach automatisch in eine MP4 (faststart) umgewandelt' +
              ((ok.upload && (!ftpSettings || ftpSettings.enabled)) ? ` und nach ${ok.upload} hochgeladen.` : '.')
            : 'ffmpeg-Helfer nicht installiert: Die Dateien werden ohne Umwandlung gespeichert.'
        return kind === 'dash' ? runDash() : runHls()
    })
    .catch(e => status(e.message, true))
