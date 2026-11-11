import {_t} from '../../../util/i18n.mjs'
import config from 'gen/config-client'

/*
 Hint for the editor after a media file was replaced.

 Uploads are cached by the browser (Cache-Control of uploads, see resolveUploadedFile in
 server/util/file.mjs): for max-age seconds it shows its copy of the old file without asking the
 server, afterwards the copy is still shown once while it is refreshed in the background.

 The replace dialog reloads the page, so the hint is kept in the sessionStorage and shown after the reload.
 */
const STORAGE_KEY = 'mediaReplaceHint'
// only shown right after the replace, not on a later visit of the admin
const HINT_VALID_MS = 60 * 1000
// default of the server (LUNUC_UPLOAD_MAX_AGE), used if the header can't be read
const DEFAULT_MAX_AGE = 300
const MAX_AGE_TIMEOUT_MS = 1500

// max-age the server sends for this upload, so the hint is also right if the default was changed.
// HEAD + no-store: nothing is downloaded and the http cache is not touched
const fetchUploadMaxAge = (id) => {
    const request = fetch(`${config.UPLOAD_URL}/${id}`, {method: 'HEAD', cache: 'no-store'}).then(response => {
        const match = /max-age=(\d+)/.exec((response.ok && response.headers.get('Cache-Control')) || '')
        return match ? parseInt(match[1]) : DEFAULT_MAX_AGE
    }).catch(() => DEFAULT_MAX_AGE)
    // never keeps the dialog waiting
    const timeout = new Promise(resolve => setTimeout(() => resolve(DEFAULT_MAX_AGE), MAX_AGE_TIMEOUT_MS))
    return Promise.race([request, timeout])
}

const hardReloadShortcut = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? 'Cmd+Shift+R' : 'Ctrl+Shift+R'

const showHint = (maxAge) => {
    // max-age=0: the browser always asks the server, the new file is shown right away
    if (!(maxAge > 0) || !_app_.dispatcher) {
        return
    }
    _app_.dispatcher.addNotification({
        key: 'mediaReplaced',
        autoHideDuration: 20000,
        message: _t('Media.replacedHint', {minutes: Math.ceil(maxAge / 60), shortcut: hardReloadShortcut()})
    })
}

/* call after a file was replaced (before the page is reloaded), resolves when the hint is stored */
export const rememberMediaReplaceHint = (id) => fetchUploadMaxAge(id).then(maxAge => {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({time: Date.now(), maxAge}))
    } catch (e) {
        // no storage (e.g. private mode): no hint after the reload
    }
})

/* shows the stored hint once (called when the admin starts and by dialogs that don't reload the page) */
export const showPendingMediaReplaceHint = () => {
    let hint
    try {
        hint = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
        sessionStorage.removeItem(STORAGE_KEY)
    } catch (e) {
        return
    }
    if (hint && Date.now() - hint.time < HINT_VALID_MS) {
        showHint(hint.maxAge)
    }
}
