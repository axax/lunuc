const NATIVE_HOST = 'com.lunuc.ffmpeg'
const fields = ['enabled', 'url', 'user', 'password', 'netrc', 'ssl', 'deleteAfterUpload']
const $ = id => document.getElementById(id)

function msg(text, cls) {
    $('msg').textContent = text
    $('msg').className = cls || ''
}

function readForm() {
    const ftp = {}
    fields.forEach(f => { ftp[f] = $(f).type === 'checkbox' ? $(f).checked : $(f).value.trim() })
    return ftp
}

function native(message) {
    return new Promise(resolve => {
        chrome.runtime.sendNativeMessage(NATIVE_HOST, message, res => {
            resolve(chrome.runtime.lastError ? {error: chrome.runtime.lastError.message} : res)
        })
    })
}

chrome.storage.local.get('ftp', ({ftp = {}}) => {
    fields.forEach(f => {
        if ($(f).type === 'checkbox') $(f).checked = !!ftp[f]
        else $(f).value = ftp[f] || ''
    })
})

native({cmd: 'ping'}).then(res => {
    $('helper').textContent = res && res.ok
        ? `ffmpeg-Helfer installiert (${res.ffmpeg}).`
        : 'ffmpeg-Helfer nicht gefunden – Umwandeln und Upload funktionieren erst nach ./native-host/install.sh ' + chrome.runtime.id
})

$('save').onclick = () => {
    const ftp = readForm()
    if (ftp.enabled && !/^(ftp|ftps|sftp):\/\//i.test(ftp.url)) {
        return msg('Die URL muss mit ftp://, ftps:// oder sftp:// beginnen.', 'err')
    }
    chrome.storage.local.set({ftp}, () => msg('Gespeichert.', 'ok'))
}

$('test').onclick = async () => {
    msg('Teste…')
    const res = await native({cmd: 'testFtp', ftp: readForm()})
    if (res && res.ok) msg(`Verbindung OK (${res.files} Einträge im Verzeichnis).`, 'ok')
    else if (res && /native messaging host not found/i.test(res.error || '')) {
        msg('Der ffmpeg-Helfer ist nicht installiert. Im Terminal ausführen: cd …/lunuc/extensions/chrome/native-host && ./install.sh ' + chrome.runtime.id, 'err')
    } else msg('Fehler: ' + (res && res.error || 'unbekannt'), 'err')
}
