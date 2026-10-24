import Hook from 'util/hook.cjs'

// Only the event listeners live in the main bundle. Building and sending the
// report (./reporter.js) is loaded on demand when the first error occurs.
let reporter
const report = (type, data) => {
    if (!reporter) {
        reporter = import(/* webpackChunkName: "logreporter" */ './reporter.js').catch(e => {
            // e.g. chunk could not be loaded (offline) -> try again with the next error
            reporter = null
            throw e
        })
    }
    return reporter.then(m => m.default(type, data)).catch(() => {
        // never let a failed log report surface as a new error
    })
}

const EXTENSION_URL_RE = /^(chrome|moz|safari)-extension/

// Detects errors from scripts injected by the browser/app into the page (e.g. WKUserScript in iOS
// browsers, Brave wallet, password managers). Those report the page url as filename, line 1 and a tiny
// column ("global code@https://example.com/:1:16"), while our own inline scripts sit further down in
// the html and our bundles have their own filename. Scripts embedded by the page itself (also from
// other origins) are still reported.
const isInjectedScript = (e) => {
    const file = e.filename
    if (!file) return false
    try {
        const url = new URL(file, window.location.href)
        const strip = u => u.split('#')[0]
        if (strip(url.href) === strip(window.location.href) && e.lineno <= 1 && e.colno < 100) return true
    } catch (err) {
        // invalid url -> treat as our own
    }
    return false
}

export default () => {

    window.addEventListener('error', (e) => {
        // Script error without details = cross-origin or extension -> ignore
        if (e.message === 'Script error.' && !e.filename && e.lineno === 0) return

        // ignore errors from browser extensions
        if (e.filename && EXTENSION_URL_RE.test(e.filename)) return

        // ignore errors from scripts injected into the page by the browser/app
        if (isInjectedScript(e)) return

        report('error', e)
    })

    // unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason

        // intentional aborts are not errors: graphql requests cancelled on unmount,
        // via clearFetchById or superseded by a newer request (e.g. search-as-you-type)
        if (reason && (reason.aborted === true || reason.name === 'AbortError' ||
            (reason.error && reason.error.name === 'AbortError'))) return

        report('unhandledrejection', reason)
    })

    _app_.sendError = (data) => report('send', data)

    // CSP violation error
    document.addEventListener('securitypolicyviolation', (e) => {
        // ignore violations caused by browser extensions
        if (EXTENSION_URL_RE.test(e.blockedURI) || e.sourceFile && EXTENSION_URL_RE.test(e.sourceFile)) return

        report('securitypolicyviolation', e)
    })

    Hook.on('JsonDomError', (data) => {
        if (!data.editMode && data.error) {
            report('JsonDomError', data)
        }
    })

    Hook.on('JsonDomStyleError', (data) => {
        if (!data.editMode && data.error) {
            report('JsonDomStyleError', data)
        }
    })

    Hook.on('AsyncError', (data) => {
        report('AsyncError', data)
    })

    Hook.on('dispatcherAddError', (payload) => {
        if (payload && payload.msg && payload.meta && payload.meta.query && payload.meta.variables) {
            if (payload.meta.query.startsWith('mutation createLog') ||
                payload.msg.startsWith('503 - Service Unavailable') ||
                payload.msg.startsWith('404 - Not Found')) return

            report('dispatcherAddError', payload)
        }
    })
}
