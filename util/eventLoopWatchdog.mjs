// util/eventLoopWatchdog.mjs
//
// Diagnostic only: logs whenever the event loop of this process was blocked
// longer than LUNUC_EVENTLOOP_WARN_MS (default 100ms), together with what was
// going on at that moment:
//   - requests in flight (method, url, graphql operation / slug, age)
//   - activities registered by other modules (e.g. running cronjobs)
//   - garbage collection pauses in the blocked window
//   - heap usage
// The request that is in flight during a stall is not necessarily the cause
// (it may just be waiting), but over several log lines the pattern shows up.
// Disable with LUNUC_EVENTLOOP_WATCHDOG=false.

import {PerformanceObserver, performance} from 'perf_hooks'

const ENABLED = process.env.LUNUC_EVENTLOOP_WATCHDOG !== 'false'
const WARN_MS = parseInt(process.env.LUNUC_EVENTLOOP_WARN_MS) || 100
const INTERVAL_MS = 50
const MAX_LOGS_PER_MINUTE = 30
const MAX_LISTED = 5

const inFlight = new Set()
const recentDone = []               // {desc, end} - requests finished in the last seconds
const MAX_RECENT_DONE = 50
const activityProviders = new Map() // name -> () => string[]
const recentGc = []                 // {start, duration, kind}
let started = false

/**
 * Registers a request as "in flight" until its response is closed.
 * Never throws, never touches the request/response otherwise.
 */
export const trackRequestForWatchdog = (req, res) => {
    if (!ENABLED || !started) {
        return
    }
    try {
        const entry = {req, start: performance.now()}
        inFlight.add(entry)
        res.once('close', () => {
            inFlight.delete(entry)
            // a request that blocked the loop has usually finished by the
            // time the stall is detected - keep it around for the log
            try {
                const end = performance.now()
                recentDone.push({desc: describeRequest(entry, end), end})
                if (recentDone.length > MAX_RECENT_DONE) {
                    recentDone.shift()
                }
            } catch (e) {
                // ignore
            }
        })
    } catch (e) {
        // ignore
    }
}

/**
 * Lets other modules report what they are currently doing, e.g. running
 * cronjobs. The provider returns a list of short strings.
 */
export const registerWatchdogActivity = (name, provider) => {
    activityProviders.set(name, provider)
}

const describeRequest = (entry, now) => {
    const r = entry.req
    let d = `${r.method} ${r.url}`
    const b = r.body
    if (b && typeof b === 'object') {
        if (b.operationName) {
            d += ` op=${b.operationName}`
        } else if (typeof b.query === 'string') {
            d += ` q="${b.query.replace(/\s+/g, ' ').substring(0, 60)}"`
        }
        if (b.variables && typeof b.variables === 'object' && b.variables.slug !== undefined) {
            d += ` slug=${b.variables.slug}`
        }
    }
    return `${d} (${Math.round(now - entry.start)}ms)`
}

const describeActivities = () => {
    const out = []
    for (const [name, provider] of activityProviders) {
        try {
            const items = provider()
            if (items && items.length) {
                out.push(`${name}: ${items.slice(0, MAX_LISTED).join(', ')}`)
            }
        } catch (e) {
            // ignore
        }
    }
    return out
}

export const startEventLoopWatchdog = (processName) => {
    if (!ENABLED || started) {
        return
    }
    started = true

    try {
        const gcObserver = new PerformanceObserver(list => {
            for (const e of list.getEntries()) {
                if (e.duration >= 10) {
                    recentGc.push({start: e.startTime, duration: e.duration, kind: e.detail?.kind ?? e.kind})
                }
            }
            // keep only the last few seconds
            const cutoff = performance.now() - 10000
            while (recentGc.length && recentGc[0].start < cutoff) {
                recentGc.shift()
            }
        })
        gcObserver.observe({entryTypes: ['gc']})
    } catch (e) {
        // gc observation not available - watchdog works without it
    }

    let expected = performance.now() + INTERVAL_MS
    let logsThisMinute = 0, minuteStart = Date.now(), suppressed = 0

    const timer = setInterval(() => {
        const now = performance.now()
        const lag = now - expected
        expected = now + INTERVAL_MS
        if (lag < WARN_MS) {
            return
        }

        if (Date.now() - minuteStart > 60000) {
            if (suppressed > 0) {
                console.warn(`[eventloop] ${processName}: ${suppressed} further stalls not logged (rate limit)`)
            }
            minuteStart = Date.now()
            logsThisMinute = 0
            suppressed = 0
        }
        if (++logsThisMinute > MAX_LOGS_PER_MINUTE) {
            suppressed++
            return
        }

        try {
            const windowStart = now - lag - INTERVAL_MS
            const gc = recentGc.filter(g => g.start + g.duration >= windowStart)
            const gcTotal = gc.reduce((s, g) => s + g.duration, 0)
            const heapMb = Math.round(process.memoryUsage().heapUsed / 1048576)
            const requests = [...inFlight].slice(0, MAX_LISTED).map(e => describeRequest(e, now))
            const finished = recentDone.filter(d => d.end >= windowStart).slice(-MAX_LISTED).map(d => d.desc)
            const parts = [
                `[eventloop] ${processName} blocked ${Math.round(lag)}ms`,
                `heap ${heapMb}MB`,
                gc.length ? `gc ${gc.length}x ${Math.round(gcTotal)}ms` : 'gc -',
                `finished during stall ${finished.length}` + (finished.length ? ': ' + finished.join(' | ') : ''),
                `in-flight ${inFlight.size}` + (requests.length ? ': ' + requests.join(' | ') : ''),
                ...describeActivities()
            ]
            console.warn(parts.join(' / '))
        } catch (e) {
            // never break anything
        }
    }, INTERVAL_MS)
    timer.unref()
}
