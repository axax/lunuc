// util/serverTiming.mjs
//
// Helpers for the Server-Timing response header (visible in the browser
// devtools: Network -> request -> Timing). Purely diagnostic - it never
// changes a response body or status. Disable with LUNUC_SERVER_TIMING=false.

export const SERVER_TIMING_ENABLED = process.env.LUNUC_SERVER_TIMING !== 'false'

const round = (ms) => Math.round(ms * 10) / 10

// desc is a quoted-string: strip everything that could break the header
const sanitizeDesc = (desc) => String(desc).replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '').substring(0, 60)

export const timingEntry = (name, dur, desc) =>
    `${name};dur=${round(dur)}` + (desc !== undefined && desc !== null && desc !== '' ? `;desc="${sanitizeDesc(desc)}"` : '')

/**
 * Appends entries to the Server-Timing header of a not yet sent response.
 * Never throws - timing must not be able to break a request.
 */
export const appendServerTiming = (res, entries) => {
    if (!SERVER_TIMING_ENABLED || !res || !entries || entries.length === 0) {
        return
    }
    try {
        if (res.headersSent || typeof res.getHeader !== 'function') {
            return
        }
        const current = res.getHeader('Server-Timing')
        const value = entries.join(', ')
        res.setHeader('Server-Timing', current ? current + ', ' + value : value)
    } catch (e) {
        // ignore
    }
}
