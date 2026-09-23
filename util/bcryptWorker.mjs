// util/bcryptWorker.mjs
//
// Runs bcryptjs.compareSync in worker threads, so a password check (~80-150ms
// of pure JS at cost 10) no longer blocks the event loop of the main thread.
// Uses the SAME library and the SAME function as before, so results are
// identical. bcryptjs' own async API is not used on purpose: it only yields
// every 100ms, which is about the duration of a whole check.
//
// Fails soft: if a worker can not be started or dies, the check falls back to
// the synchronous call on the main thread (previous behavior).
//
// LUNUC_BCRYPT_WORKERS  number of worker threads (default 2, 0 = disabled)

import {Worker} from 'node:worker_threads'
import {createRequire} from 'node:module'
import bcrypt from 'bcryptjs'

// not named "require": babel (api env) transpiles to CommonJS and rewrites
// import.meta.url to a require() call, a local "require" would shadow it
const localRequire = createRequire(import.meta.url)

const envWorkers = parseInt(process.env.LUNUC_BCRYPT_WORKERS)
const WORKER_COUNT = isNaN(envWorkers) ? 2 : Math.max(0, envWorkers)

const WORKER_CODE = `
const {parentPort, workerData} = require('node:worker_threads')
const bcrypt = require(workerData.bcryptPath)
parentPort.on('message', ({id, pw, hash}) => {
    try {
        parentPort.postMessage({id, result: bcrypt.compareSync(pw, hash)})
    } catch (e) {
        parentPort.postMessage({id, error: e && e.message ? e.message : String(e)})
    }
})
`

let bcryptPath = null
try {
    bcryptPath = localRequire.resolve('bcryptjs')
} catch (e) {
    bcryptPath = null
}

const workers = []      // {worker, pending: Map<id, {resolve, reject, pw, hash}>}
let nextId = 1
let nextWorker = 0
let disabled = WORKER_COUNT === 0 || !bcryptPath

const failPendingToSync = (slot) => {
    // the worker died - finish its open checks on the main thread
    for (const [, p] of slot.pending) {
        try {
            p.resolve(bcrypt.compareSync(p.pw, p.hash))
        } catch (e) {
            p.reject(e)
        }
    }
    slot.pending.clear()
}

const createWorker = (index) => {
    const slot = {worker: null, pending: new Map()}
    try {
        const worker = new Worker(WORKER_CODE, {eval: true, workerData: {bcryptPath}})
        worker.on('message', ({id, result, error}) => {
            const p = slot.pending.get(id)
            if (!p) {
                return
            }
            slot.pending.delete(id)
            if (slot.pending.size === 0) {
                worker.unref() // idle again
            }
            if (error !== undefined) {
                p.reject(new Error(error))
            } else {
                p.resolve(result)
            }
        })
        const onDead = (err) => {
            if (err) {
                console.warn('bcryptWorker: worker failed - falling back to sync for open checks', err.message || err)
            }
            if (workers[index] === slot) {
                workers[index] = null
            }
            failPendingToSync(slot)
        }
        worker.on('error', onDead)
        worker.on('exit', (code) => onDead(code !== 0 ? new Error('exit code ' + code) : null))
        // unref AFTER adding the listeners (a 'message' listener refs the
        // port again) - an idle worker must never keep the process alive,
        // it is ref'ed only while checks are pending
        worker.unref()
        slot.worker = worker
    } catch (e) {
        console.warn('bcryptWorker: could not start worker - using sync bcrypt', e.message)
        return null
    }
    return slot
}

const getWorkerSlot = () => {
    if (disabled) {
        return null
    }
    const index = nextWorker
    nextWorker = (nextWorker + 1) % WORKER_COUNT
    if (!workers[index]) {
        workers[index] = createWorker(index)
        if (!workers[index]) {
            disabled = true
            return null
        }
    }
    return workers[index]
}

/**
 * Same result as bcrypt.compareSync(pw, hash), computed off the main thread.
 * Invalid arguments are handled by compareSync itself on the main thread, so
 * the thrown error stays exactly the same as before.
 */
export const bcryptCompare = (pw, hash) => {
    if (typeof pw !== 'string' || typeof hash !== 'string') {
        // throws the original "Illegal arguments" error (or returns) - cheap
        return Promise.resolve().then(() => bcrypt.compareSync(pw, hash))
    }
    const slot = getWorkerSlot()
    if (!slot) {
        return Promise.resolve().then(() => bcrypt.compareSync(pw, hash))
    }
    return new Promise((resolve, reject) => {
        const id = nextId++
        if (slot.pending.size === 0) {
            slot.worker.ref() // keep the process alive until the answer arrives
        }
        slot.pending.set(id, {resolve, reject, pw, hash})
        try {
            slot.worker.postMessage({id, pw, hash})
        } catch (e) {
            slot.pending.delete(id)
            if (slot.pending.size === 0) {
                slot.worker.unref()
            }
            try {
                resolve(bcrypt.compareSync(pw, hash))
            } catch (e2) {
                reject(e2)
            }
        }
    })
}
