#!/usr/bin/env node
// Native-Messaging-Host für die Lunuc-Chrome-Erweiterung: wandelt heruntergeladene Streams mit ffmpeg in eine MP4 (+faststart) um.
const {spawn, execFileSync} = require('child_process')
const fs = require('fs')
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
        const proc = spawn(loadConfig().curl || 'curl', args)
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

function convert(msg) {
    const ffmpeg = findFfmpeg()
    if (!ffmpeg) return send({error: 'ffmpeg nicht gefunden (brew install ffmpeg)'})

    const inputs = (msg.inputs || []).filter(p => typeof p === 'string')
    if (!inputs.length || inputs.length > 2) return send({error: 'Ungültige Eingabedateien'})
    for (const p of inputs) {
        if (!path.isAbsolute(p) || !fs.existsSync(p)) return send({error: 'Datei nicht gefunden: ' + p})
    }

    // nur ein Dateiname, kein Pfad – die MP4 landet neben der ersten Eingabedatei
    const outputName = path.basename(String(msg.outputName || 'video.mp4')).replace(/\.[^.]*$/, '') + '.mp4'
    const output = uniquePath(path.dirname(inputs[0]), outputName)

    const args = ['-hide_banner', '-nostdin', '-y']
    inputs.forEach(i => args.push('-i', i))
    if (inputs.length === 2) args.push('-map', '0:v:0', '-map', '1:a:0')
    args.push('-c', 'copy', '-movflags', '+faststart', output)

    const proc = spawn(ffmpeg, args)
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
    proc.on('error', e => send({error: e.message}))
    proc.on('close', code => {
        if (code !== 0) {
            try { fs.unlinkSync(output) } catch (e) {}
            return send({error: `Exit-Code ${code}: ${lastErr.split('\n').filter(Boolean).slice(-3).join(' | ')}`})
        }
        if (msg.deleteInputs) inputs.forEach(p => { try { fs.unlinkSync(p) } catch (e) {} })

        const ftp = msg.upload === false ? null : resolveFtp(msg.ftp)
        if (!ftpTarget(ftp)) return send({done: true, output})

        send({phase: 'upload', progress: 0})
        upload(output, ftp)
            .then(remote => {
                if (ftp.deleteAfterUpload) { try { fs.unlinkSync(output) } catch (e) {} }
                send({done: true, output, uploaded: remote.replace(/\/\/[^/@]*@/, '//')})
            })
            .catch(e => send({error: e.message + ' – die MP4 liegt weiterhin unter ' + output}))
    })
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
