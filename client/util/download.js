import Util from './index.mjs'

/** Starts the download of an url (also blob: urls) with the given file name. */
export const startDownload = (url, filename) => {
    const elem = window.document.createElement('a')
    elem.href = url
    elem.download = filename
    document.body.appendChild(elem)
    elem.click()
    document.body.removeChild(elem)
}

export const downloadAs = (data, filename) => {
    const url = window.URL.createObjectURL(data instanceof Blob ? data : new Blob([data]))
    startDownload(url, filename)
    // the browser has taken over the download
    setTimeout(() => window.URL.revokeObjectURL(url), 60000)
}

/**
 * Downloads a file of an admin route of the web server with the auth token of the user.
 * The whole file is loaded into the memory of the browser first.
 */
export const downloadWithAuth = (url, filename) => {
    const token = Util.getAuthToken()
    return fetch(url, token ? {headers: {Authorization: token}} : undefined).then(response => {
        if (!response.ok) throw new Error(`Invalid status ${response.status}`)
        return response.blob()
    }).then(blob => downloadAs(blob, filename))
}
