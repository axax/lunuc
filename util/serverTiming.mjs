// util/serverTiming.mjs
//
// Helpers for the Server-Timing response header (visible in the browser
// devtools: Network -> request -> Timing). Purely diagnostic - it never
// changes a response body or status. Disable with LUNUC_SERVER_TIMING=false.

import {monitorEventLoopDelay, performance as perf} from 'perf_hooks'

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


/* ------------------------------------------------------------------ */
/* Event loop health                                                    */
/* ------------------------------------------------------------------ */

// Event loop delay (how late timers/callbacks run) and utilization (share of
// time the loop was busy running JS) of THIS process, per 10s window.
//   - high delay + high utilization -> the process itself is busy (blocking code)
//   - high delay + low utilization  -> the machine is starved (cpu/steal/swap)

const EL_WINDOW_MS = 10000
let elHistogram = null
let elLast = null          // stats of the previous completed window
let elLastElu = null
let elWindowElu = null

const nsToMs = (ns) => ns / 1e6

const snapshot = () => {
    const h = elHistogram
    return h && h.count > 0 ? {p99: nsToMs(h.percentile(99)), max: nsToMs(h.max), mean: nsToMs(h.mean)} : null
}

if (SERVER_TIMING_ENABLED) {
    try {
        elHistogram = monitorEventLoopDelay({resolution: 10})
        elHistogram.enable()
        elWindowElu = perf.eventLoopUtilization()
        const timer = setInterval(() => {
            elLast = snapshot()
            const now = perf.eventLoopUtilization()
            elLastElu = perf.eventLoopUtilization(now, elWindowElu).utilization
            elWindowElu = now
            elHistogram.reset()
        }, EL_WINDOW_MS)
        timer.unref()
    } catch (e) {
        elHistogram = null
    }
}

/**
 * Server-Timing entry for the event loop of this process:
 * dur = p99 delay (ms) over the current + previous 10s window,
 * desc = max delay and utilization.
 */
export const eventLoopEntry = (name) => {
    if (!elHistogram) {
        return null
    }
    try {
        const cur = snapshot()
        const p99 = Math.max(cur ? cur.p99 : 0, elLast ? elLast.p99 : 0)
        const max = Math.max(cur ? cur.max : 0, elLast ? elLast.max : 0)
        const eluNow = perf.eventLoopUtilization(perf.eventLoopUtilization(), elWindowElu).utilization
        const elu = Math.max(eluNow || 0, elLastElu || 0)
        return timingEntry(name, p99, `max ${round(max)}ms busy ${Math.round(elu * 100)}%`)
    } catch (e) {
        return null
    }
}
