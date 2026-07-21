import React from 'react'
import Hook from 'util/hook.cjs'
import {getTypeQueries} from 'util/types.mjs'
import {client} from 'client/middleware/graphql'


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

const sendError = ({location, message, meta, fingerprint}) => {

    // dedupe/throttle: default fingerprint is location + first line of message
    const fp = fingerprint || location + '|' + String(message).split('\n')[0]
    if (!shouldReport(fp)) return Promise.resolve()

    const entry = errorLog.seen.get(fp)

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
                ...meta
            })
        }
    }).catch(() => {
        // never let a failed log mutation surface as a new error
    })
}


export default () => {

    window.addEventListener('error', (e) => {
        // Script error without details = cross-origin or extension -> ignore
        if (e.message === 'Script error.' && !e.filename && e.lineno === 0) return

        // ignore errors from browser extensions
        if (e.filename && /^(chrome|moz|safari)-extension:/.test(e.filename)) return

        sendError({
            location: 'window',
            fingerprint: 'window|' + e.message + '|' + e.filename + '|' + e.lineno + ':' + e.colno,
            message: [
                e.message,
                'URL: ' + e.filename,
                'Line: ' + e.lineno + ', Column: ' + e.colno,
                'Stack: ' + (e.error && e.error.stack || '(no stack trace)')
            ].join('\n')
        })
    })

    // unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason
        const message = reason instanceof Error
            ? reason.message + '\n\n' + (reason.stack || '(no stack trace)')
            : String(reason)

        sendError({
            location: 'unhandledrejection',
            message
        })
    })

    _app_.sendError = sendError

    // CSP violation error
    document.addEventListener('securitypolicyviolation', (e) => {
        // ignore violations caused by browser extensions
        if (/^(chrome|moz|safari)-extension/.test(e.blockedURI) || e.sourceFile && /^(chrome|moz|safari)-extension/.test(e.sourceFile)) return

        sendError({
            location: 'securitypolicyviolation',
            fingerprint: 'csp|' + e.blockedURI + '|' + e.violatedDirective,
            message: [
                'blockedURI: ' + e.blockedURI,
                'violatedDirective: ' + e.violatedDirective,
                'originalPolicy: ' + e.originalPolicy
            ].join('\n')
        })
    })

    // add routes for this extension
    Hook.on('JsonDomError', ({error, editMode, slug}) => {
        if (!editMode && error) {
            sendError({
                location: 'JsonDom',
                message: error.type + ': ' + (error.e ? error.e.message + '\n\n' + error.e.stack : error.msg),
                meta: {
                    slug: slug,
                    ...error.meta
                }
            })
        }
    })


    Hook.on('JsonDomStyleError', ({error, style, editMode, slug}) => {
        if (!editMode && error) {
            sendError({
                location: 'JsonDomStyle',
                message: error.message + '\n\n' + error.stack,
                meta: {
                    slug,
                    style
                }
            })
        }
    })

    // add routes for this extension
    Hook.on('AsyncError', ({error}) => {
        sendError({
            location: 'Async',
            message: error.message + '\n\n' + error.stack
        })
    })

    // add routes for this extension
    Hook.on('dispatcherAddError', (payload) => {
        if (payload && payload.msg && payload.meta && payload.meta.query && payload.meta.variables) {
            if (payload.meta.query.startsWith('mutation createLog') ||
                payload.msg.startsWith('503 - Service Unavailable') ||
                payload.msg.startsWith('404 - Not Found')) return

            sendError({
                location: 'dispatcherAddError',
                message: payload.msg,
                meta: {
                    ...payload.meta,
                    errorKey: payload.key
                }
            })
        }
    })
}