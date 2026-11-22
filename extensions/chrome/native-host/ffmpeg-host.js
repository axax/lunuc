#!/usr/bin/env node
// Native-Messaging-Host für die Lunuc-Chrome-Erweiterung: wandelt heruntergeladene Streams mit ffmpeg in eine MP4 (+faststart) um.
const {spawn, execFileSync} = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function send(msg) {
    const json = Buffer.from(JSON.stringify(msg))
    const len = Buffer.alloc(4)
    len.writeUInt32LE(json.length, 0)
    process.stdout.write(Buffer.concat([len, json]))
}

function findFfmpeg() {
    const candidates = [process.env.FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].filter(Boolean)
    for (const c of candidates) if (fs.existsSync(c)) return c
    try {
        return execFileSync('/bin/sh', ['-lc', 'command -v ffmpeg']).toString().trim() || null
    } catch (e) {
        return null
    }
}

// ---------- Konfiguration (config.json neben diesem Skript) ----------
function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))
    } catch (e) {
        return {}
    }
}

function ftpTarget(ftp) {
    if (!ftp || !ftp.url || !/^(ftp|ftps|sftp):\/\//i.test(ftp.url)) return null
    return ftp.url.endsWith('/') ? ftp.url : ftp.url + '/'
}

// ---------- Upload per curl (FTP, FTPS oder SFTP, je nach URL) ----------
// Einstellungen aus der Erweiterung haben Vorrang vor config.json
function resolveFtp(msgFtp) {
    if (msgFtp && msgFtp.url) return msgFtp
    return loadConfig().ftp || null
}

function curlFtp(ftp, extraArgs, onStderr) {
    return new Promise((resolve, reject) => {
        // Zugangsdaten über stdin (-K -), damit das Passwort nicht in der Prozessliste steht
        const args = ['-K', '-', '--fail', ...extraArgs]
        if (ftp.ssl) args.unshift('--ssl-reqd')
        if (ftp.insecure) args.unshift('--insecure')
        const proc = track(spawn(loadConfig().curl || 'curl', args))
        const esc = v => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        proc.stdin.end(ftp.user ? `user = "${esc(ftp.user)}:${esc(ftp.password || '')}"\n` : (ftp.netrc ? 'netrc\n' : ''))
        let out = '', lastErr = ''
        proc.stdout.on('data', c => { out += c })
        proc.stderr.on('data', c => {
            lastErr = (lastErr + c).slice(-1000)
            if (onStderr) onStderr(c.toString())
        })
        proc.on('error', reject)
        proc.on('close', code => {
            if (code === 0) resolve(out)
            else reject(new Error(`curl ${code}: ${lastErr.replace(/[#\s]+/g, ' ').trim().slice(-200)}`))
        })
    })
}

function testFtp(ftp) {
    const target = ftpTarget(ftp)
    if (!target) return Promise.reject(new Error('Ungültige URL (ftp://, ftps:// oder sftp://)'))
    // Verzeichnis anlegen (falls nötig) und auflisten
    return curlFtp(ftp, ['--ftp-create-dirs', '-sS', '--list-only', '--connect-timeout', '15', target])
}

function upload(file, ftp) {
    const target = ftpTarget(ftp) + encodeURIComponent(path.basename(file))
    return curlFtp(ftp, ['--ftp-create-dirs', '--progress-bar', '-T', file, target], text => {
        const m = text.match(/([\d.]+)%/g)
        if (m) send({phase: 'upload', progress: parseFloat(m[m.length - 1]) / 100})
    }).then(() => target)
}

function uniquePath(dir, name) {
    const ext = path.extname(name)
    const base = path.basename(name, ext)
    let candidate = path.join(dir, base + ext)
    for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`)
    return candidate
}

function toSeconds(h, m, s) {
    return (+h) * 3600 + (+m) * 60 + parseFloat(s)
}

// laufende Prozesse (ffmpeg, curl) und halbfertige Ausgabe – für den Abbruch
const children = new Set()
let partialOutput = null

function track(proc) {
    children.add(proc)
    proc.on('close', () => children.delete(proc))
    return proc
}

// Die Erweiterung trennt die Verbindung (Abbrechen, Browser beendet): alles stoppen und aufräumen
process.stdin.on('end', () => {
    children.forEach(proc => proc.kill('SIGTERM'))
    if (partialOutput) { try { fs.unlinkSync(partialOutput) } catch (e) {} }
    process.exit(0)
})

// ISO 639-1 → 639-2 (MP4 erwartet dreistellige Sprachcodes)
const LANG3 = {de: 'deu', en: 'eng', fr: 'fra', it: 'ita', es: 'spa', pt: 'por', nl: 'nld', rm: 'roh', gsw: 'gsw',
    pl: 'pol', ru: 'rus', tr: 'tur', ja: 'jpn', zh: 'zho', ko: 'kor', ar: 'ara', sv: 'swe', da: 'dan', no: 'nor', fi: 'fin', cs: 'ces', hu: 'hun'}

function lang3(lang) {
    const l = String(lang || '').toLowerCase().split(/[-_]/)[0]
    return LANG3[l] || (/^[a-z]{3}$/.test(l) ? l : 'und')
}

function existingFiles(list) {
    for (const p of list) {
        if (!path.isAbsolute(p) || !fs.existsSync(p)) throw new Error('Datei nicht gefunden: ' + p)
    }
    return list
}

function ffmpegArgs(inputs, subtitles, output) {
    const args = ['-hide_banner', '-nostdin', '-y']
    inputs.forEach(i => args.push('-i', i))
    subtitles.forEach(s => args.push('-i', s.path))
    if (inputs.length === 2) args.push('-map', '0:v:0', '-map', '1:a:0')
    else if (subtitles.length) args.push('-map', '0:v?', '-map', '0:a?') // mit -map werden sonst nur die Untertitel übernommen
    subtitles.forEach((s, i) => args.push('-map', `${inputs.length + i}:0`))
    args.push('-c', 'copy')
    if (subtitles.length) {
        args.push('-c:s', 'mov_text')
        subtitles.forEach((s, i) => args.push(`-metadata:s:s:${i}`, `language=${lang3(s.lang)}`))
    }
    args.push('-movflags', '+faststart', output)
    return args
}

// ffmpeg ausführen, Fortschritt melden; liefert die letzten Fehlerzeilen bei Exit-Code != 0
function runFfmpeg(ffmpeg, args, output) {
    return new Promise((resolve, reject) => {
        const proc = track(spawn(ffmpeg, args))
        partialOutput = output
        let duration = 0
        let lastErr = ''
        proc.stderr.on('data', chunk => {
            const text = chunk.toString()
            lastErr = (lastErr + text).slice(-2000)
            const d = text.match(/Duration: (\d+):(\d+):([\d.]+)/)
            if (d && !duration) duration = toSeconds(d[1], d[2], d[3])
            const t = text.match(/time=(\d+):(\d+):([\d.]+)/g)
            if (t && duration) {
                const [, h, m, s] = t[t.length - 1].match(/time=(\d+):(\d+):([\d.]+)/)
                send({progress: Math.min(1, toSeconds(h, m, s) / duration)})
            }
        })
        proc.on('error', reject)
        proc.on('close', code => {
            partialOutput = null
            if (code === 0) return resolve()
            try { fs.unlinkSync(output) } catch (e) {}
            reject(new Error(`Exit-Code ${code}: ${lastErr.split('\n').filter(Boolean).slice(-3).join(' | ')}`))
        })
    })
}

// Einzelne Untertitel-Datei prüfen: lässt sie sich lesen, als mov_text in eine MP4 schreiben
// und enthält sie überhaupt Einträge? (ffmpeg akzeptiert z. B. leere oder HTML-Fehlerseiten als leere Spur)
function checkSubtitle(ffmpeg, sub) {
    return new Promise(resolve => {
        const tmp = path.join(os.tmpdir(), `lunuc-subcheck-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`)
        const proc = track(spawn(ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-i', sub.path,
            '-map', '0:s:0', '-c:s', 'mov_text', '-f', 'mp4', tmp,
            '-map', '0:s:0', '-c:s', 'srt', '-f', 'srt', 'pipe:1']))
        let out = ''
        proc.stdout.on('data', c => { if (out.length < 100000) out += c })
        proc.stderr.on('data', () => {})
        const done = ok => {
            try { fs.unlinkSync(tmp) } catch (e) {}
            resolve(ok)
        }
        proc.on('error', () => done(false))
        proc.on('close', code => done(code === 0 && /-->/.test(out) && fs.existsSync(tmp) && fs.statSync(tmp).size > 0))
    })
}

async function validSubtitles(ffmpeg, subtitles) {
    const ok = []
    for (const s of subtitles) if (await checkSubtitle(ffmpeg, s)) ok.push(s)
    return ok
}

async function convert(msg) {
    const ffmpeg = findFfmpeg()
    if (!ffmpeg) return send({error: 'ffmpeg nicht gefunden (brew install ffmpeg)'})

    let inputs, subtitles
    try {
        inputs = existingFiles((msg.inputs || []).filter(p => typeof p === 'string'))
        if (!inputs.length || inputs.length > 2) throw new Error('Ungültige Eingabedateien')
        subtitles = (msg.subtitles || []).filter(s => s && typeof s.path === 'string').slice(0, 20)
        existingFiles(subtitles.map(s => s.path))
    } catch (e) {
        return send({error: e.message})
    }

    // nur ein Dateiname, kein Pfad – die MP4 landet neben der ersten Eingabedatei
    const outputName = path.basename(String(msg.outputName || 'video.mp4')).replace(/\.[^.]*$/, '') + '.mp4'
    const output = uniquePath(path.dirname(inputs[0]), outputName)

    // fehlerhafte Untertitel vorab aussortieren – nur die funktionierenden werden eingebettet,
    // die anderen bleiben als Datei neben der MP4 liegen
    let embedded = subtitles.length ? await validSubtitles(ffmpeg, subtitles) : []
    try {
        await runFfmpeg(ffmpeg, ffmpegArgs(inputs, embedded, output), output)
    } catch (e) {
        if (!embedded.length) return send({error: e.message})
        // scheitert es trotzdem an den Untertiteln: Video ohne Untertitel
        try {
            await runFfmpeg(ffmpeg, ffmpegArgs(inputs, [], output), output)
            embedded = []
        } catch (e2) {
            return send({error: e2.message})
        }
    }
    const skipped = subtitles.filter(s => !embedded.includes(s))

    if (msg.deleteInputs) {
        inputs.concat(embedded.map(s => s.path)).forEach(p => { try { fs.unlinkSync(p) } catch (e) {} })
    }

    const done = {done: true, output, subtitles: embedded.length, subtitlesSkipped: skipped.length,
        skippedSubtitles: skipped.map(s => path.basename(s.path))}
    const ftp = msg.upload === false ? null : resolveFtp(msg.ftp)
    if (!ftpTarget(ftp)) return send(done)

    send({phase: 'upload', progress: 0})
    upload(output, ftp)
        .then(remote => {
            if (ftp.deleteAfterUpload) { try { fs.unlinkSync(output) } catch (e) {} }
            send({...done, uploaded: remote.replace(/\/\/[^/@]*@/, '//')})
        })
        .catch(e => send({error: e.message + ' – die MP4 liegt weiterhin unter ' + output}))
}

// Nachrichten von Chrome lesen: 4 Byte Länge (little endian) + JSON
let buffer = Buffer.alloc(0)
process.stdin.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    while (buffer.length >= 4) {
        const len = buffer.readUInt32LE(0)
        if (buffer.length < 4 + len) break
        const msg = JSON.parse(buffer.slice(4, 4 + len).toString())
        buffer = buffer.slice(4 + len)
        if (msg.cmd === 'ping') {
            const target = ftpTarget(resolveFtp(msg.ftp))
            send({ok: !!findFfmpeg(), ffmpeg: findFfmpeg(), upload: target ? target.replace(/\/\/[^/@]*@/, '//') : null})
        }
        else if (msg.cmd === 'convert') convert(msg)
        else if (msg.cmd === 'testFtp') {
            testFtp(msg.ftp || {})
                .then(list => send({ok: true, files: list.split(/\r?\n/).filter(Boolean).length}))
                .catch(e => send({error: e.message}))
        }
        else send({error: 'Unbekannter Befehl'})
    }
})
