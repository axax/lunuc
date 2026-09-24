// util/jsonMonitor.mjs
//
// Diagnostic only (opt-in): measures JSON.parse / JSON.stringify and logs every
// call that blocks the event loop longer than a threshold, with the size and
// the calling code:
//
//   [json] parse 38ms 12.4MB <- loadKeyValueGlobals api/util/index.mjs:130 < keyValueGlobalMap api/util/index.mjs:455
//
// Once a minute a summary shows the total time spent in JSON (all calls).
//
//   LUNUC_JSON_MONITOR=true        enable
//   LUNUC_JSON_MONITOR_MS=20       log calls >= this duration
//
// The wrappers pass all arguments through unchanged (same results, same
// exceptions); the only cost is one time measurement per call.

const ENABLED = process.env.LUNUC_JSON_MONITOR === 'true'
const THRESHOLD_MS = parseInt(process.env.LUNUC_JSON_MONITOR_MS) || 20
const MAX_LOGS_PER_MINUTE = 30
const SUMMARY_INTERVAL_MS = 60000
const SUMMARY_MIN_TOTAL_MS = 100 // no summary line for a quiet minute

const APP_ROOT = process.cwd()

const formatSize = (chars) => chars >= 1048576
    ? (chars / 1048576).toFixed(1) + 'MB'
    : chars >= 1024 ? (chars / 1024).toFixed(1) + 'KB' : chars + 'B'

// up to 3 frames of application code (node_modules and this file skipped)
const callerOf = () => {
    const stack = new Error().stack.split('\n').slice(1)
    const frames = []
    for (const line of stack) {
        if (line.includes('jsonMonitor.mjs') || line.includes('/node_modules/') || line.includes('node:')) {
            continue
        }
        const m = line.match(/at (?:(.+?) \()?(.+?):(\d+):\d+\)?$/)
        if (!m) {
            continue
        }
        let file = m[2].replace('file://', '')
        if (file.startsWith(APP_ROOT + '/')) {
            file = file.substring(APP_ROOT.length + 1)
        }
        frames.push(`${m[1] || '(anonymous)'} ${file}:${m[3]}`)
        if (frames.length >= 3) {
            break
        }
    }
    return frames.length ? frames.join(' < ') : '(unknown)'
}

const install = (processName) => {
    if (JSON.__lunucMonitored) {
        return
    }
    const originalParse = JSON.parse
    const originalStringify = JSON.stringify

    const stats = {parse: {count: 0, ms: 0, slow: 0}, stringify: {count: 0, ms: 0, slow: 0}}
    let logsThisMinute = 0, suppressed = 0

    const record = (kind, ms, size) => {
        const s = stats[kind]
        s.count++
        s.ms += ms
        if (ms < THRESHOLD_MS) {
            return
        }
        s.slow++
        if (++logsThisMinute > MAX_LOGS_PER_MINUTE) {
            suppressed++
            return
        }
        try {
            console.warn(`[json] ${processName} ${kind} ${Math.round(ms)}ms ${formatSize(size)} <- ${callerOf()}`)
        } catch (e) {
            // never break anything
        }
    }

    JSON.parse = function parse() {
        const t = performance.now()
        const result = originalParse.apply(JSON, arguments)
        const ms = performance.now() - t
        const text = arguments[0]
        record('parse', ms, typeof text === 'string' ? text.length : 0)
        return result
    }

    JSON.stringify = function stringify() {
        const t = performance.now()
        const result = originalStringify.apply(JSON, arguments)
        const ms = performance.now() - t
        record('stringify', ms, typeof result === 'string' ? result.length : 0)
        return result
    }

    Object.defineProperty(JSON, '__lunucMonitored', {value: true})

    const timer = setInterval(() => {
        const total = stats.parse.ms + stats.stringify.ms
        if (total >= SUMMARY_MIN_TOTAL_MS || suppressed > 0) {
            console.warn(`[json] ${processName} last minute: parse ${stats.parse.count}x ${Math.round(stats.parse.ms)}ms (${stats.parse.slow} slow), ` +
                `stringify ${stats.stringify.count}x ${Math.round(stats.stringify.ms)}ms (${stats.stringify.slow} slow)` +
                (suppressed ? `, ${suppressed} slow calls not logged (rate limit)` : ''))
        }
        for (const k of ['parse', 'stringify']) {
            stats[k] = {count: 0, ms: 0, slow: 0}
        }
        logsThisMinute = 0
        suppressed = 0
    }, SUMMARY_INTERVAL_MS)
    timer.unref()

    console.log(`[json] ${processName}: JSON monitor enabled (log >= ${THRESHOLD_MS}ms)`)
}

export const startJsonMonitor = (processName) => {
    if (ENABLED) {
        install(processName)
    }
}
