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
import inspector from 'node:inspector'
import v8 from 'node:v8'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ENABLED = process.env.LUNUC_EVENTLOOP_WATCHDOG !== 'false'
const WARN_MS = parseInt(process.env.LUNUC_EVENTLOOP_WARN_MS) || 100
const INTERVAL_MS = 50
const MAX_LOGS_PER_MINUTE = 30
const MAX_LISTED = 5

// Optional diagnostics (all opt-in via env):
//   LUNUC_STALL_PROFILE=true      rolling 10s cpu + allocation profiles, a window
//                                 containing a stall >= LUNUC_STALL_PROFILE_MS
//                                 (default 300) is written to LUNUC_DIAG_DIR
//   LUNUC_HEAPSNAPSHOT_SIGNAL=true  `kill -USR2 <pid>` writes a heap snapshot
//   LUNUC_DIAG_DIR                output dir (default <tmp>/lunuc-diag)
const STALL_PROFILE = process.env.LUNUC_STALL_PROFILE === 'true'
const STALL_PROFILE_MS = parseInt(process.env.LUNUC_STALL_PROFILE_MS) || 300
const STALL_PROFILE_MAX_FILES = parseInt(process.env.LUNUC_STALL_PROFILE_MAX_FILES) || 10
const PROFILE_WINDOW_MS = 10000
// start profiling only after this delay - the first minutes after a restart
// are dominated by startup work (loading caches etc.) and would use up all
// MAX_FILES before normal operation is ever recorded
const STALL_PROFILE_DELAY_MS = (parseInt(process.env.LUNUC_STALL_PROFILE_DELAY_S) || 300) * 1000
const HEAPSNAPSHOT_SIGNAL = process.env.LUNUC_HEAPSNAPSHOT_SIGNAL === 'true'
const DIAG_DIR = process.env.LUNUC_DIAG_DIR || path.join(os.tmpdir(), 'lunuc-diag')

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

const ensureDiagDir = () => {
    try {
        fs.mkdirSync(DIAG_DIR, {recursive: true})
        return true
    } catch (e) {
        console.warn(`[eventloop] cannot create ${DIAG_DIR}: ${e.message}`)
        return false
    }
}

const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, '-')

/*
 * Rolling cpu + allocation sampling profiler (in-process inspector session).
 * Every PROFILE_WINDOW_MS the current profiles are stopped; if the window
 * contained a stall >= STALL_PROFILE_MS they are written to disk, then new
 * profiles start. Open the files in Chrome DevTools:
 *   .cpuprofile  -> Performance tab -> "Load profile"
 *   .heapprofile -> Memory tab -> "Load" (allocation sampling, incl. objects
 *                   already collected -> shows WHO allocates)
 */
const createStallProfiler = (processName) => {
    let session
    try {
        session = new inspector.Session()
        session.connect()
    } catch (e) {
        console.warn(`[eventloop] stall profiler not available: ${e.message}`)
        return null
    }
    let filesWritten = 0
    let windowStart = performance.now()
    let windowMaxStall = 0
    let active = false

    const post = (method, params) => new Promise((resolve) => {
        session.post(method, params || {}, (err, result) => resolve(err ? null : result))
    })

    const start = async () => {
        await post('Profiler.enable')
        await post('Profiler.setSamplingInterval', {interval: 2000}) // µs - low overhead
        await post('Profiler.start')
        await post('HeapProfiler.enable')
        await post('HeapProfiler.startSampling', {
            samplingInterval: 128 * 1024,
            includeObjectsCollectedByMajorGC: true,
            includeObjectsCollectedByMinorGC: true
        })
        windowStart = performance.now()
        windowMaxStall = 0
        active = true
    }

    const write = (name, data) => {
        fs.writeFile(path.join(DIAG_DIR, name), JSON.stringify(data), (err) => {
            if (err) {
                console.warn(`[eventloop] could not write ${name}: ${err.message}`)
            }
        })
    }

    const rotate = async () => {
        active = false
        const stall = windowMaxStall
        const cpu = await post('Profiler.stop')
        const heap = await post('HeapProfiler.stopSampling')
        if (stall >= STALL_PROFILE_MS && filesWritten < STALL_PROFILE_MAX_FILES && ensureDiagDir()) {
            filesWritten++
            const base = `${processName}-stall-${timestampForFile()}-${Math.round(stall)}ms`
            if (cpu && cpu.profile) write(base + '.cpuprofile', cpu.profile)
            if (heap && heap.profile) write(base + '.heapprofile', heap.profile)
            console.warn(`[eventloop] ${processName}: stall profile written to ${path.join(DIAG_DIR, base)}.* (${filesWritten}/${STALL_PROFILE_MAX_FILES})`)
        }
        if (filesWritten >= STALL_PROFILE_MAX_FILES) {
            console.warn(`[eventloop] ${processName}: stall profiler stopped (max files reached)`)
            session.disconnect()
            return
        }
        await start()
    }

    start()
    return {
        noteStall: (lag) => {
            if (lag > windowMaxStall) windowMaxStall = lag
        },
        tick: (now) => {
            if (active && now - windowStart >= PROFILE_WINDOW_MS) {
                rotate()
            }
        }
    }
}

const installHeapSnapshotSignal = (processName) => {
    try {
        process.on('SIGUSR2', () => {
            if (!ensureDiagDir()) return
            const file = path.join(DIAG_DIR, `${processName}-${timestampForFile()}.heapsnapshot`)
            console.warn(`[eventloop] ${processName}: writing heap snapshot to ${file} (process blocks for a few seconds)`)
            try {
                v8.writeHeapSnapshot(file)
                console.warn(`[eventloop] ${processName}: heap snapshot written`)
            } catch (e) {
                console.warn(`[eventloop] ${processName}: heap snapshot failed: ${e.message}`)
            }
        })
        console.log(`[eventloop] ${processName}: heap snapshot on SIGUSR2 enabled (pid ${process.pid}) -> ${DIAG_DIR}`)
    } catch (e) {
        // ignore
    }
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

    if (HEAPSNAPSHOT_SIGNAL) {
        installHeapSnapshotSignal(processName)
    }
    let profiler = null
    if (STALL_PROFILE) {
        console.log(`[eventloop] ${processName}: stall profiler starts in ${STALL_PROFILE_DELAY_MS / 1000}s (>= ${STALL_PROFILE_MS}ms) -> ${DIAG_DIR}`)
        const delayTimer = setTimeout(() => {
            profiler = createStallProfiler(processName)
            if (profiler) {
                console.log(`[eventloop] ${processName}: stall profiler running`)
            }
        }, STALL_PROFILE_DELAY_MS)
        delayTimer.unref()
    }

    let expected = performance.now() + INTERVAL_MS
    let logsThisMinute = 0, minuteStart = Date.now(), suppressed = 0

    const timer = setInterval(() => {
        const now = performance.now()
        const lag = now - expected
        expected = now + INTERVAL_MS
        if (profiler) {
            // note the stall BEFORE rotating, so it lands in the window it happened in
            profiler.noteStall(lag)
            profiler.tick(now)
        }
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
