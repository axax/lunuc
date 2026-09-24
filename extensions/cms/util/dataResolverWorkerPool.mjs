// extensions/cms/util/dataResolverWorkerPool.mjs
//
// Runs dataResolvers in worker threads (api side). A dataResolver opts in by
// setting "worker" on its FIRST segment, e.g.
//
//   [{"key": "base", "keyValueGlobals": ["ProflightShopData"], "public": true, "worker": "proflight"}, ...]
//
// All workers of a pool share nothing with the api thread except messages:
// the worker loads the KeyValueGlobals itself (own db connection, own cache)
// and runs the leading data/_data/eval/reduce/keyValueGlobals segments. The
// first segment of another type (tr, t, request, user, ...) and everything
// after it runs in the api thread as before.
//
// Safety:
//   - identical code for both threads (dataResolverCore.mjs)
//   - cache invalidations of the api thread are forwarded to all workers
//   - any problem with the worker (start, crash, timeout, data that can not
//     be transferred) -> WorkerUnavailableError -> the caller runs the
//     dataResolver in the api thread exactly as without the worker option
//
// Env:
//   LUNUC_DATARESOLVER_WORKER=false        ignore the worker option
//   LUNUC_DATARESOLVER_WORKERS=1           workers per pool
//   LUNUC_DATARESOLVER_WORKER_TIMEOUT_MS   per run (default 120000)

import {Worker} from 'node:worker_threads'
import Cache from '../../../util/cache.mjs'
import {registerWatchdogActivity} from '../../../util/eventLoopWatchdog.mjs'
import {reviveTransfer} from './dataResolverTransfer.mjs'

const ENABLED = process.env.LUNUC_DATARESOLVER_WORKER !== 'false'
const WORKERS_PER_POOL = Math.max(1, parseInt(process.env.LUNUC_DATARESOLVER_WORKERS) || 1)
const TIMEOUT_MS = parseInt(process.env.LUNUC_DATARESOLVER_WORKER_TIMEOUT_MS) || 120000
const MAX_FAILURES = 3
const FAILURE_WINDOW_MS = 5 * 60 * 1000
const DISABLE_MS = 5 * 60 * 1000

// not named "require"/"url" on purpose (babel rewrites import.meta.url)
const WORKER_FILE = new URL('./dataResolverWorker.mjs', import.meta.url)

export class WorkerUnavailableError extends Error {
    constructor(message, quiet = false) {
        super(message)
        // quiet: already logged once (e.g. pool disabled) - callers don't log again
        this.quiet = quiet
    }
}

export const isDataResolverWorkerEnabled = () => ENABLED

const pools = new Map()   // name -> {slots: [], next, failures: [], disabledUntil}
let nextId = 1
const getPool = (name) => {
    let pool = pools.get(name)
    if (!pool) {
        pool = {name, slots: new Array(WORKERS_PER_POOL).fill(null), next: 0, failures: [], disabledUntil: 0}
        pools.set(name, pool)
    }
    return pool
}

const noteFailure = (pool, reason) => {
    const now = Date.now()
    pool.failures = pool.failures.filter(t => now - t < FAILURE_WINDOW_MS)
    pool.failures.push(now)
    console.warn(`[dataResolverWorker:${pool.name}] ${reason}`)
    if (pool.failures.length >= MAX_FAILURES) {
        pool.disabledUntil = now + DISABLE_MS
        pool.failures = []
        console.warn(`[dataResolverWorker:${pool.name}] too many failures - running in the api thread for ${DISABLE_MS / 60000} min`)
    }
}

const failSlot = (pool, index, slot, reason) => {
    if (pool.slots[index] === slot) {
        pool.slots[index] = null
    }
    for (const [, p] of slot.pending) {
        clearTimeout(p.timer)
        p.reject(new WorkerUnavailableError(reason))
    }
    slot.pending.clear()
}

const createSlot = (pool, index) => {
    const slot = {worker: null, pending: new Map()}
    let worker
    try {
        worker = new Worker(WORKER_FILE, {
            workerData: {
                poolName: pool.name,
                appLang: globalThis._app_ && _app_.lang,
                appTr: globalThis._app_ && _app_.tr
            }
        })
    } catch (e) {
        noteFailure(pool, `could not start worker: ${e.message}`)
        return null
    }
    slot.worker = worker
    worker.unref()

    worker.on('message', (msg) => {
        if (!msg || msg.ready) {
            if (msg && msg.ready) console.log(`[dataResolverWorker:${pool.name}] worker ${index} ready`)
            return
        }
        const p = slot.pending.get(msg.id)
        if (!p) return
        slot.pending.delete(msg.id)
        clearTimeout(p.timer)
        if (slot.pending.size === 0) worker.unref()
        if (msg.unsupported) {
            p.reject(new WorkerUnavailableError(`worker could not resolve: ${msg.unsupported}`))
            return
        }
        p.resolve(msg)
    })
    worker.on('error', (err) => {
        noteFailure(pool, `worker ${index} error: ${err && err.message}`)
        failSlot(pool, index, slot, 'worker error')
    })
    worker.on('exit', (code) => {
        // a worker terminated by us (timeout) was already counted as failure
        if (code !== 0 && !slot.terminating) {
            noteFailure(pool, `worker ${index} exited with code ${code}`)
        }
        failSlot(pool, index, slot, 'worker exited')
    })
    return slot
}

/**
 * Runs the leading pure segments of a dataResolver in a worker of the pool.
 * Resolves with {resolvedData, subscriptions, timings, nextIndex, nextSegment, error}
 * or rejects with WorkerUnavailableError (-> run it in the api thread).
 */
export const runDataResolverInWorker = (poolName, payload) => {
    const pool = getPool(poolName)
    if (Date.now() < pool.disabledUntil) {
        return Promise.reject(new WorkerUnavailableError('pool temporarily disabled', true))
    }
    const index = pool.next
    pool.next = (pool.next + 1) % WORKERS_PER_POOL
    let slot = pool.slots[index]
    if (!slot) {
        slot = pool.slots[index] = createSlot(pool, index)
        if (!slot) {
            return Promise.reject(new WorkerUnavailableError('worker could not be started'))
        }
    }

    return new Promise((resolve, reject) => {
        const id = nextId++
        const timer = setTimeout(() => {
            if (!slot.pending.has(id)) return
            slot.pending.delete(id)
            noteFailure(pool, `run timed out after ${TIMEOUT_MS}ms - restarting worker ${index}`)
            reject(new WorkerUnavailableError('timeout'))
            // a stuck worker would block every following run
            slot.terminating = true
            try { slot.worker.terminate() } catch (e) {}
        }, TIMEOUT_MS)
        timer.unref()
        slot.pending.set(id, {resolve, reject, timer, start: Date.now()})
        slot.worker.ref() // keep the process alive while runs are pending
        try {
            slot.worker.postMessage({type: 'run', id, ...payload})
        } catch (e) {
            // payload not transferable (e.g. a function in the context)
            slot.pending.delete(id)
            clearTimeout(timer)
            if (slot.pending.size === 0) slot.worker.unref()
            reject(new WorkerUnavailableError(`payload can not be transferred: ${e.message}`))
        }
    }).then((msg) => {
        const result = msg.hasObjectIds ? reviveTransfer(msg.result) : msg.result
        return {
            resolvedData: result.resolvedData,
            subscriptions: result.subscriptions,
            nextSegment: result.nextSegment,
            nextIndex: msg.nextIndex,
            timings: msg.timings,
            error: msg.error
        }
    })
}

// forward every cache invalidation of the api thread to the running workers
Cache.onClear((prefixes) => {
    for (const pool of pools.values()) {
        for (const slot of pool.slots) {
            if (slot && slot.worker) {
                try {
                    slot.worker.postMessage({type: 'clear', prefixes})
                } catch (e) {
                    // ignore - a broken worker is replaced with the next run
                }
            }
        }
    }
})

// diagnostic: pending runs per pool show up in event loop stall logs
registerWatchdogActivity('dataResolverWorker', () => {
    const out = []
    const now = Date.now()
    for (const pool of pools.values()) {
        let pending = 0, oldest = 0
        for (const slot of pool.slots) {
            if (!slot) continue
            for (const [, p] of slot.pending) {
                pending++
                oldest = Math.max(oldest, now - p.start)
            }
        }
        if (pending) out.push(`${pool.name}: ${pending} pending (${Math.round(oldest / 1000)}s)`)
    }
    return out
})
