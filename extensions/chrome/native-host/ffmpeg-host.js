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

// ISO 639-1 → 639-2/T (MP4 erwartet dreistellige Sprachcodes) – vollständige Liste
const LANG3 = Object.fromEntries(('aa:aar ab:abk af:afr ak:aka am:amh an:arg ar:ara as:asm av:ava ay:aym az:aze ba:bak be:bel bg:bul ' +
    'bh:bih bi:bis bm:bam bn:ben bo:bod br:bre bs:bos ca:cat ce:che ch:cha co:cos cr:cre cs:ces cu:chu cv:chv cy:cym da:dan ' +
    'de:deu dv:div dz:dzo ee:ewe el:ell en:eng eo:epo es:spa et:est eu:eus fa:fas ff:ful fi:fin fj:fij fo:fao fr:fra fy:fry ' +
    'ga:gle gd:gla gl:glg gn:grn gu:guj gv:glv ha:hau he:heb hi:hin ho:hmo hr:hrv ht:hat hu:hun hy:hye hz:her ia:ina id:ind ' +
    'ie:ile ig:ibo ii:iii ik:ipk io:ido is:isl it:ita iu:iku ja:jpn jv:jav ka:kat kg:kon ki:kik kj:kua kk:kaz kl:kal km:khm ' +
    'kn:kan ko:kor kr:kau ks:kas ku:kur kv:kom kw:cor ky:kir la:lat lb:ltz lg:lug li:lim ln:lin lo:lao lt:lit lu:lub lv:lav ' +
    'mg:mlg mh:mah mi:mri mk:mkd ml:mal mn:mon mr:mar ms:msa mt:mlt my:mya na:nau nb:nob nd:nde ne:nep ng:ndo nl:nld nn:nno ' +
    'no:nor nr:nbl nv:nav ny:nya oc:oci oj:oji om:orm or:ori os:oss pa:pan pi:pli pl:pol ps:pus pt:por qu:que rm:roh rn:run ' +
    'ro:ron ru:rus rw:kin sa:san sc:srd sd:snd se:sme sg:sag si:sin sk:slk sl:slv sm:smo sn:sna so:som sq:sqi sr:srp ss:ssw ' +
    'st:sot su:sun sv:swe sw:swa ta:tam te:tel tg:tgk th:tha ti:tir tk:tuk tl:tgl tn:tsn to:ton tr:tur ts:tso tt:tat tw:twi ' +
    'ty:tah ug:uig uk:ukr ur:urd uz:uzb ve:ven vi:vie vo:vol wa:wln wo:wol xh:xho yi:yid yo:yor za:zha zh:zho zu:zul')
    .split(' ').map(p => p.split(':')))
// 639-2/B-Varianten und verbreitete Abweichungen → 639-2/T
const LANG3_ALIAS = {ger: 'deu', fre: 'fra', dut: 'nld', cze: 'ces', chi: 'zho', gre: 'ell', rum: 'ron', slo: 'slk',
    per: 'fas', arm: 'hye', baq: 'eus', geo: 'kat', ice: 'isl', mac: 'mkd', mao: 'mri', may: 'msa', bur: 'mya', tib: 'bod',
    wel: 'cym', alb: 'sqi', iw: 'heb', in: 'ind', ji: 'yid', fil: 'fil', yue: 'yue', cmn: 'zho', gsw: 'gsw'}
const LANG3_VALUES = new Set(Object.values(LANG3))

function lang3(lang) {
    const l = String(lang || '').toLowerCase().split(/[-_]/)[0]
    if (LANG3[l]) return LANG3[l]
    if (LANG3_ALIAS[l]) return LANG3_ALIAS[l]
    return LANG3_VALUES.has(l) ? l : 'und'
}

// Sprachname für die Spur-Beschriftung ("Griechisch", "Portugiesisch (Brasilien)")
function langTitle(lang) {
    try { return new Intl.DisplayNames(['de'], {type: 'language'}).of(String(lang).replace('_', '-')) || '' } catch (e) { return '' }
}

function existingFiles(list) {
    for (const p of list) {
        if (!path.isAbsolute(p) || !fs.existsSync(p)) throw new Error('Datei nicht gefunden: ' + p)
    }
    return list
}

// Qualitätsstufen für die Neukodierung (ohne Angabe: Original, nur umverpacken)
// CRF: kleiner = besser/grösser. H.265 braucht bei gleicher Qualität etwa 40 % weniger Platz.
const QUALITY = {
    '1080p': {height: 1080, crf: 22, codec: 'h264'},
    '720p': {height: 720, crf: 23, codec: 'h264'},
    '480p': {height: 480, crf: 24, codec: 'h264'},
    '1080p-hevc': {height: 1080, crf: 25, codec: 'hevc'},
    '720p-hevc': {height: 720, crf: 26, codec: 'hevc'}
}

let encoderList = null
function hasEncoder(ffmpeg, name) {
    if (encoderList === null) {
        try { encoderList = execFileSync(ffmpeg, ['-hide_banner', '-encoders'], {stdio: ['ignore', 'pipe', 'ignore']}).toString() } catch (e) { encoderList = '' }
    }
    return new RegExp('\\s' + name + '\\s').test(encoderList)
}

// Video-/Audio-Parameter je nach Qualität
function codecArgs(ffmpeg, quality) {
    const q = QUALITY[quality]
    if (!q) return ['-c:v', 'copy', '-c:a', 'copy']
    // -2: Breite bleibt gerade (sonst bricht libx264 bei ungeraden Breiten ab); min(): nie hochskalieren
    const vf = `scale=-2:'min(${q.height},ih)':flags=lanczos,format=yuv420p`
    const video = q.codec === 'hevc' && hasEncoder(ffmpeg, 'libx265')
        // hvc1-Tag, damit QuickTime/iOS/Apple TV das Video abspielen
        ? ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(q.crf), '-tag:v', 'hvc1', '-x265-params', 'log-level=error']
        : ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(q.crf + (q.codec === 'hevc' ? -3 : 0)), '-profile:v', 'high']
    return [...video, '-vf', vf, '-c:a', 'aac', '-b:a', '128k', '-ac', '2']
}

function ffmpegArgs(inputs, subtitles, output, ffmpeg, quality) {
    const args = ['-hide_banner', '-nostdin', '-y']
    inputs.forEach(i => args.push('-i', i))
    subtitles.forEach(s => args.push('-i', s.path))
    if (inputs.length === 2) args.push('-map', '0:v:0', '-map', '1:a:0')
    else if (subtitles.length) args.push('-map', '0:v?', '-map', '0:a?') // mit -map werden sonst nur die Untertitel übernommen
    subtitles.forEach((s, i) => args.push('-map', `${inputs.length + i}:0`))
    args.push(...codecArgs(ffmpeg, quality))
    if (subtitles.length) {
        args.push('-c:s', 'mov_text')
        subtitles.forEach((s, i) => {
            args.push(`-metadata:s:s:${i}`, `language=${lang3(s.lang)}`)
            const title = langTitle(s.lang)
            if (title) args.push(`-metadata:s:s:${i}`, `title=${title}`, `-metadata:s:s:${i}`, `handler_name=${title}`)
        })
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
    // Untertitel ohne erkennbare Sprache gar nicht erst einbetten
    const known = subtitles.filter(s => lang3(s.lang) !== 'und')
    let embedded = known.length ? await validSubtitles(ffmpeg, known) : []
    try {
        await runFfmpeg(ffmpeg, ffmpegArgs(inputs, embedded, output, ffmpeg, msg.quality), output)
    } catch (e) {
        if (!embedded.length) return send({error: e.message})
        // scheitert es trotzdem an den Untertiteln: Video ohne Untertitel
        try {
            await runFfmpeg(ffmpeg, ffmpegArgs(inputs, [], output, ffmpeg, msg.quality), output)
            embedded = []
        } catch (e2) {
            return send({error: e2.message})
        }
    }
    const skipped = known.filter(s => !embedded.includes(s))
    const unknown = subtitles.filter(s => !known.includes(s))

    if (msg.deleteInputs) {
        inputs.concat(embedded.map(s => s.path), unknown.map(s => s.path)).forEach(p => { try { fs.unlinkSync(p) } catch (e) {} })
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
