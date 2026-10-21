import {getTypeQueries} from 'util/types.mjs'
import {client} from 'client/middleware/graphql'

// Heavy part of the error reporting. Loaded on demand by ./client.js when the
// first error occurs, so it does not increase the size of the main bundle.

const isHeadlessBrowser = () => {
    try {
        // 1. official standard check (safe against missing navigator object)
        if (window?.navigator?.webdriver) {
            return true
        }

        // 2. chrome-specific check - desktop only, since Chrome on Android
        // legitimately has an empty plugins list (would cause false positives)
        const ua = window?.navigator?.userAgent?.toLowerCase() || ''
        const isMobile = /android|iphone|ipad|mobile/.test(ua)
        const hasChromeObject = !!window?.chrome
        const hasPlugins = !!window?.navigator?.plugins?.length

        if (!isMobile && hasChromeObject && !hasPlugins) {
            return true // real desktop chrome practically always lists plugins
        }

        // 3. language settings check (null-pointer-safe)
        const languages = window?.navigator?.languages
        if (!languages || languages.length === 0) {
            return true // headless browsers often forget to set languages
        }

        // 4. user-agent check
        if (ua.indexOf('headless') !== -1 ||
            ua.indexOf('phantomjs') !== -1 ||
            ua.indexOf('selenium') !== -1) {
            return true
        }

        return false
    } catch (e) {
        return false
    }
}


// central throttling for ALL error reports
const errorLog = {
    seen: new Map(),      // fingerprint -> {occurrences, sent}
    totalSent: 0,
    MAX_TOTAL: 20,        // hard cap per page load
    MAX_PER_ERROR: 3,     // max reports of the same error
    WINDOW_MS: 10000,     // min interval between repeated reports
    lastSent: 0
}

function shouldReport(fingerprint) {
    let entry = errorLog.seen.get(fingerprint)
    if (!entry) {
        entry = {occurrences: 0, sent: 0}
        errorLog.seen.set(fingerprint, entry)
    }
    entry.occurrences++

    if (errorLog.totalSent >= errorLog.MAX_TOTAL) return false
    if (entry.sent >= errorLog.MAX_PER_ERROR) return false

    // rate limit only applies to repeats, first occurrence always goes through
    const now = Date.now()
    if (entry.sent > 0 && now - errorLog.lastSent < errorLog.WINDOW_MS) return false

    entry.sent++
    errorLog.lastSent = now
    errorLog.totalSent++
    return true
}

// --- source context for errors in eval'd JsonDom code -----------------------
// JsonDom compiles CMS scripts with new Function and names them via sourceURL
// (jsondom-<slug>-<loc>.js). The code is kept in window._jsonDomSources, so the
// reported line can be resolved to the actual source.

// new Function() puts a wrapper header in front of the body (V8: 2 lines), so the
// reported line is shifted. Measured once per engine instead of hardcoding it.
let fnLineOffset
const getFnLineOffset = () => {
    if (fnLineOffset === undefined) {
        fnLineOffset = 0
        try {
            new Function('throw new Error("probe")\n//# sourceURL=jsondom-lineprobe.js')()
        } catch (e) {
            const m = String(e && e.stack).match(/jsondom-lineprobe\.js:(\d+)/)
            if (m) fnLineOffset = parseInt(m[1]) - 1
        }
    }
    return fnLineOffset
}

const JSONDOM_LOCATION_RES = [
    /(jsondom-[\w-]+\.js):(\d+):(\d+)/, // stack frame (Chrome/Firefox/Safari)
    /URL: (jsondom-[\w-]+\.js)\nLine: (\d+), Column: (\d+)/ // window error message
]

const getSourceContext = (text) => {
    try {
        const sources = window._jsonDomSources
        if (!sources || !text) return null
        let m
        for (const re of JSONDOM_LOCATION_RES) {
            m = String(text).match(re)
            if (m) break
        }
        if (!m) return null
        const file = m[1].replace(/^.*\//, '')
        const code = sources.get(file)
        if (!code) return null

        const lines = code.split('\n')
        const line = parseInt(m[2]) - getFnLineOffset() // 1-based line in the script
        const col = parseInt(m[3])
        if (line < 1 || line > lines.length) return null

        const from = Math.max(1, line - 2), to = Math.min(lines.length, line + 2)
        const out = []
        for (let i = from; i <= to; i++) {
            const marker = i === line ? '>' : ' '
            out.push(marker + ' ' + String(i).padStart(4) + ' | ' + lines[i - 1].slice(0, 300))
            if (i === line && col > 0 && col <= 300) {
                out.push('  ' + ' '.repeat(4) + ' | ' + ' '.repeat(col - 1) + '^')
            }
        }
        return {file, line, column: col, snippet: out.join('\n')}
    } catch (e) {
        return null
    }
}

const sendError = ({location, message, meta, fingerprint}) => {

    // dedupe/throttle: default fingerprint is location + first line of message
    const fp = fingerprint || location + '|' + String(message).split('\n')[0]
    if (!shouldReport(fp)) return Promise.resolve()

    const entry = errorLog.seen.get(fp)

    const source = getSourceContext(message)
    if (source) {
        message += '\n\nSource (' + source.file + ', line ' + source.line + '):\n' + source.snippet
        meta = {...meta, sourceFile: source.file, sourceLine: source.line, sourceColumn: source.column}
    }

    const queries = getTypeQueries('Log')
    return client.mutate({
        mutation: queries.create,
        variables: {
            location,
            type: 'error',
            message: message + (entry.occurrences > 1 ? '\n(occurrence #' + entry.occurrences + ')' : ''),
            meta: JSON.stringify({
                agent: navigator.userAgent,
                href: window.location.href,
                parser: window._lunucWebParser,
                headless: isHeadlessBrowser(),
                lacksOptionalChaining: _app_.lacksOptionalChaining,
                lacksBasicEs6: _app_.lacksBasicEs6,
                ...meta
            })
        }
    }).catch(() => {
        // never let a failed log mutation surface as a new error
    })
}



// messages that only browser extensions produce (their apis or their script urls)
const EXTENSION_ERROR_RE = /runtime\.sendMessage|Extension context invalidated|Receiving end does not exist|(chrome|moz|safari-web|safari)-extension:\/\//

const currentSlug = () => typeof _app_ !== 'undefined' && _app_ ? _app_.currentSlug : undefined

const handlers = {
    send: sendError,
    error: (e) => sendError({
        location: 'window',
        fingerprint: 'window|' + e.message + '|' + e.filename + '|' + e.lineno + ':' + e.colno,
        message: [
            e.message,
            'URL: ' + e.filename,
            'Line: ' + e.lineno + ', Column: ' + e.colno,
            'Stack: ' + (e.error && e.error.stack || '(no stack trace)')
        ].join('\n'),
        meta: {
            // last CMS page/slug that was rendered - errors from eval'd code
            // (new Function) can be attributed to it when the filename is <anonymous>
            currentSlug: currentSlug()
        }
    }),
    unhandledrejection: (reason) => {
        // graphql client rejects with {error, loading, networkStatus} -> unwrap the error
        const err = reason instanceof Error
            ? reason
            : reason && reason.error instanceof Error ? reason.error : null

        let message
        if (err) {
            message = (err.name && err.name !== 'Error' ? err.name + ': ' : '') + err.message +
                '\n\n' + (err.stack || '(no stack trace)')
        } else if (reason && typeof reason === 'object') {
            // plain object -> describe it instead of logging "[object Object]"
            const firstLine = (reason.error && reason.error.message) || reason.message ||
                'Non-Error rejection (' + (reason.constructor && reason.constructor.name || 'Object') + ')'
            let json
            try {
                json = JSON.stringify(reason, (k, v) => v instanceof Error
                    ? {name: v.name, message: v.message, stack: v.stack}
                    : typeof v === 'function' ? undefined : v, 2)
            } catch (jsonError) {
                json = '(not serializable: ' + jsonError.message + ') keys: ' + Object.keys(reason).join(', ')
            }
            message = firstLine + '\n\nReason: ' + (json && json.length > 3000 ? json.slice(0, 3000) + '...' : json)
        } else {
            message = 'Non-Error rejection: ' + String(reason)
        }

        // rejections from browser extensions (no filename here, so recognised by the extension api or url),
        // e.g. Safari "Invalid call to runtime.sendMessage(). Tab not found."
        if (EXTENSION_ERROR_RE.test(message)) return

        return sendError({
            location: 'unhandledrejection',
            message,
            meta: {currentSlug: currentSlug()}
        })
    },
    securitypolicyviolation: (e) => sendError({
        location: 'securitypolicyviolation',
        fingerprint: 'csp|' + e.blockedURI + '|' + e.violatedDirective,
        message: [
            'blockedURI: ' + e.blockedURI,
            'violatedDirective: ' + e.violatedDirective,
            'originalPolicy: ' + e.originalPolicy
        ].join('\n')
    }),
    JsonDomError: ({error, slug}) => sendError({
        location: 'JsonDom',
        message: error.type + ': ' + (error.e ? error.e.message + '\n\n' + error.e.stack : error.msg),
        meta: {
            slug: slug,
            ...error.meta
        }
    }),
    JsonDomStyleError: ({error, style, slug}) => sendError({
        location: 'JsonDomStyle',
        message: error.message + '\n\n' + error.stack,
        meta: {
            slug,
            style
        }
    }),
    AsyncError: ({error}) => sendError({
        location: 'Async',
        message: error.message + '\n\n' + error.stack
    }),
    dispatcherAddError: (payload) => sendError({
        location: 'dispatcherAddError',
        message: payload.msg,
        meta: {
            ...payload.meta,
            errorKey: payload.key
        }
    })
}

export default (type, data) => handlers[type](data)
