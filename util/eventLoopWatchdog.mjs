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
//   LUNUC_STALL_PROFILE=true      cpu + allocation profiles (restarted at most every
//                                 LUNUC_STALL_ROTATE_S, default 120s), a window
//                                 containing a stall >= LUNUC_STALL_PROFILE_MS
//                                 (default 300) is written to LUNUC_DIAG_DIR
//                                 and every stall >= LUNUC_STALL_SUMMARY_MS
//                                 (default 150) gets a log line with the
//                                 functions that ran during exactly that stall
//   LUNUC_HEAPSNAPSHOT_SIGNAL=true  `kill -USR2 <pid>` writes a heap snapshot
//   LUNUC_DIAG_DIR                output dir (default <tmp>/lunuc-diag)
const STALL_PROFILE = process.env.LUNUC_STALL_PROFILE === 'true'
const STALL_PROFILE_MS = parseInt(process.env.LUNUC_STALL_PROFILE_MS) || 300
const STALL_PROFILE_MAX_FILES = parseInt(process.env.LUNUC_STALL_PROFILE_MAX_FILES) || 10
const STALL_SUMMARY_MS = parseInt(process.env.LUNUC_STALL_SUMMARY_MS) || 150
const MAX_SUMMARIES_PER_MINUTE = 20
const SUMMARY_TOP = 4
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

/* ------------------------------------------------------------------ */
/* Stall summary: which code ran during a stall                         */
/* ------------------------------------------------------------------ */

const APP_ROOT = process.cwd()

const shortUrl = (url) => {
    if (!url) return ''
    let u = url.startsWith('file://') ? url.substring(7) : url
    if (u.startsWith(APP_ROOT + '/')) u = u.substring(APP_ROOT.length + 1)
    return u
}

// application code = files of this project outside node_modules
const isAppFrame = (cf) => {
    const u = cf.url || ''
    return !!u && !u.includes('/node_modules/') && !u.startsWith('node:') && (u.includes(APP_ROOT) || !u.startsWith('/'))
}

const frameName = (cf) => {
    const fn = cf.functionName || '(anonymous)'
    const u = shortUrl(cf.url)
    return u ? `${fn} ${u}:${cf.lineNumber + 1}` : fn
}

const SPECIAL_NODES = new Set(['(idle)', '(program)', '(garbage collector)', '(root)'])

/**
 * Summarizes the cpu samples of a profile between fromUs and toUs (profile
 * clock). Every sample is attributed to its innermost application frame
 * (with up to 2 application callers) plus the leaf function it was actually
 * executing (e.g. JSON.parse, a regex, a library call).
 */
export const summarizeProfileWindow = (profile, fromUs, toUs, top = SUMMARY_TOP) => {
    const nodes = new Map()
    const parent = new Map()
    for (const n of profile.nodes) {
        nodes.set(n.id, n)
    }
    for (const n of profile.nodes) {
        if (n.children) {
            for (const c of n.children) parent.set(c, n.id)
        }
    }
    const buckets = new Map()
    let total = 0, gc = 0, program = 0, idle = 0
    let t = profile.startTime
    const samples = profile.samples || [], deltas = profile.timeDeltas || []
    for (let i = 0; i < samples.length; i++) {
        t += deltas[i] || 0
        if (t < fromUs) continue
        if (t > toUs) break
        const leaf = nodes.get(samples[i])
        if (!leaf) continue
        total++
        const leafName = leaf.callFrame.functionName
        if (leafName === '(garbage collector)') { gc++; continue }
        if (leafName === '(idle)') { idle++; continue }
        if (leafName === '(program)') { program++; continue }

        // walk up: collect up to 3 application frames
        const app = []
        let id = leaf.id
        while (id !== undefined && app.length < 3) {
            const n = nodes.get(id)
            if (!n) break
            if (!SPECIAL_NODES.has(n.callFrame.functionName) && isAppFrame(n.callFrame)) {
                app.push(frameName(n.callFrame))
            }
            id = parent.get(id)
        }
        const chain = app.length ? app.join(' < ') : '(no app code)'
        let bucket = buckets.get(chain)
        if (!bucket) {
            bucket = {count: 0, leaves: new Map()}
            buckets.set(chain, bucket)
        }
        bucket.count++
        if (!isAppFrame(leaf.callFrame)) {
            // the library / builtin that was actually executing
            const leafName = frameName(leaf.callFrame)
            bucket.leaves.set(leafName, (bucket.leaves.get(leafName) || 0) + 1)
        }
    }
    if (total === 0) {
        return null
    }
    const pct = (n) => Math.round(n * 100 / total)
    const topList = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, top)
        .map(([chain, bucket]) => {
            const leaves = [...bucket.leaves.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([name, n]) => `${name} ${pct(n)}%`)
            return `${pct(bucket.count)}% ${chain}` + (leaves.length ? ` (in: ${leaves.join(', ')})` : '')
        })
    const extra = []
    if (gc) extra.push(`gc ${pct(gc)}%`)
    if (program) extra.push(`native/v8 ${pct(program)}%`)
    if (idle) extra.push(`idle ${pct(idle)}%`)
    return {samples: total, top: topList, extra}
}

/*
 * Cpu (+ allocation) sampling profiler (in-process inspector session).
 *
 * IMPORTANT: restarting the V8 cpu profiler is expensive in a big process -
 * Profiler.start has to register every compiled function, which blocks the
 * event loop for up to a second. So the profile is NOT rotated per stall:
 *   - it keeps running and is only stopped/restarted when stalls are pending
 *     and at least LUNUC_STALL_ROTATE_S (default 120s) have passed, or after
 *     PROFILE_MAX_WINDOW_MS to limit memory
 *   - the stall caused by the restart itself is detected and ignored
 * On every restart:
 *   - every stall >= STALL_SUMMARY_MS is summarized into one log line
 *   - a window with a stall >= STALL_PROFILE_MS is written to disk (max
 *     STALL_PROFILE_MAX_FILES), open in Chrome DevTools:
 *       .cpuprofile  -> Performance tab -> "Load profile"
 *       .heapprofile -> Memory tab -> "Load" (allocation sampling)
 */
const ROTATE_MIN_MS = (parseInt(process.env.LUNUC_STALL_ROTATE_S) || 120) * 1000
const PROFILE_MAX_WINDOW_MS = 10 * 60 * 1000

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
    let rotating = false
    let heapSampling = false
    let ownFrom = -1, ownTo = -1          // last restart of the profiler (performance.now ms)
    const pendingStalls = []              // {from, to, lag} in performance.now() ms
    let summariesThisMinute = 0, summaryMinuteStart = Date.now(), summariesSuppressed = 0

    const post = (method, params) => new Promise((resolve) => {
        session.post(method, params || {}, (err, result) => resolve(err ? null : result))
    })

    const start = async () => {
        await post('Profiler.enable')
        await post('Profiler.setSamplingInterval', {interval: 2000}) // µs - low overhead
        await post('Profiler.start')
        heapSampling = filesWritten < STALL_PROFILE_MAX_FILES
        if (heapSampling) {
            await post('HeapProfiler.enable')
            await post('HeapProfiler.startSampling', {
                samplingInterval: 128 * 1024,
                includeObjectsCollectedByMajorGC: true,
                includeObjectsCollectedByMinorGC: true
            })
        }
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

    const logSummaries = (profile, stopPerfMs, stalls) => {
        // map performance.now() (ms) onto the profile clock (µs): endTime is
        // (almost) the moment Profiler.stop returned
        const offsetUs = profile.endTime - stopPerfMs * 1000
        for (const st of stalls) {
            if (Date.now() - summaryMinuteStart > 60000) {
                if (summariesSuppressed > 0) {
                    console.warn(`[eventloop] ${processName}: ${summariesSuppressed} stall summaries not logged (rate limit)`)
                }
                summaryMinuteStart = Date.now()
                summariesThisMinute = 0
                summariesSuppressed = 0
            }
            if (++summariesThisMinute > MAX_SUMMARIES_PER_MINUTE) {
                summariesSuppressed++
                continue
            }
            try {
                const sum = summarizeProfileWindow(profile, st.from * 1000 + offsetUs, st.to * 1000 + offsetUs)
                if (!sum) {
                    continue
                }
                console.warn(`[eventloop] ${processName} stall ${Math.round(st.lag)}ms top (${sum.samples} samples): ` +
                    sum.top.join(' | ') + (sum.extra.length ? ' / ' + sum.extra.join(', ') : ''))
            } catch (e) {
                // never break anything
            }
        }
    }

    const rotate = async () => {
        if (rotating) return
        rotating = true
        active = false
        const rotateStart = performance.now()
        const stall = windowMaxStall
        const stalls = pendingStalls.splice(0, pendingStalls.length)
        const cpu = await post('Profiler.stop')
        const stopPerfMs = performance.now()
        const heap = heapSampling ? await post('HeapProfiler.stopSampling') : null

        if (cpu && cpu.profile && stalls.length) {
            logSummaries(cpu.profile, stopPerfMs, stalls)
        }
        if (stall >= STALL_PROFILE_MS && filesWritten < STALL_PROFILE_MAX_FILES && ensureDiagDir()) {
            filesWritten++
            const base = `${processName}-stall-${timestampForFile()}-${Math.round(stall)}ms`
            if (cpu && cpu.profile) write(base + '.cpuprofile', cpu.profile)
            if (heap && heap.profile) write(base + '.heapprofile', heap.profile)
            console.warn(`[eventloop] ${processName}: stall profile written to ${path.join(DIAG_DIR, base)}.* (${filesWritten}/${STALL_PROFILE_MAX_FILES})`)
            if (filesWritten >= STALL_PROFILE_MAX_FILES) {
                console.warn(`[eventloop] ${processName}: max profile files reached - only stall summaries from now on`)
            }
        }
        await start()
        ownFrom = rotateStart
        ownTo = performance.now()
        console.warn(`[eventloop] ${processName}: profiler restart took ${Math.round(ownTo - ownFrom)}ms (this stall is caused by the profiler itself and ignored)`)
        rotating = false
    }

    const initialStart = async () => {
        const t = performance.now()
        await start()
        ownFrom = t
        ownTo = performance.now()
        console.warn(`[eventloop] ${processName}: profiler start took ${Math.round(ownTo - ownFrom)}ms (ignored)`)
    }
    initialStart()
    return {
        // true if a stall window overlaps the last profiler restart
        isOwnStall: (from, to) => ownFrom >= 0 && from <= ownTo + INTERVAL_MS && to >= ownFrom,
        noteStall: (lag, now) => {
            if (!active) return
            const from = now - lag - INTERVAL_MS
            if (ownFrom >= 0 && from <= ownTo + INTERVAL_MS && now >= ownFrom) {
                return // caused by the profiler restart
            }
            if (lag > windowMaxStall) windowMaxStall = lag
            if (lag >= STALL_SUMMARY_MS) {
                // the loop was blocked from (now - lag) until now
                pendingStalls.push({from, to: now, lag})
            }
        },
        tick: (now) => {
            if (!active) return
            const age = now - windowStart
            if ((pendingStalls.length && age >= ROTATE_MIN_MS) || age >= PROFILE_MAX_WINDOW_MS) {
                // setImmediate: never restart inside the watchdog timer callback
                setImmediate(rotate)
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
            profiler.noteStall(lag, now)
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
            if (profiler && profiler.isOwnStall(now - lag - INTERVAL_MS, now)) {
                // caused by the stall profiler restart - already logged there
                return
            }
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
