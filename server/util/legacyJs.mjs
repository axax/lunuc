/**
 * POST /__legacyjs: converts a CMS script with async/await to ES5 for very old browsers
 * (static/legacyjs.js calls it, see server/util/legacyJsTransform.mjs).
 *
 * Performance: babel takes up to ~1s for a big script -> it runs in a worker thread (the web server is never
 * blocked), started on first use and stopped when idle. Results are cached in memory and on disk (survives
 * restarts), identical concurrent requests share one conversion. Cache hits are free; conversions are limited per ip.
 */
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import {Worker} from 'worker_threads'

export const LEGACY_JS_URL = '/__legacyjs'

// bump when the babel options change -> old cache entries are not used any more
const CACHE_VERSION = '1'
const CACHE_DIR = path.join(path.resolve(), 'server', 'cache', 'legacy-js')
const MAX_CODE_LENGTH = 2 * 1024 * 1024
const MEMORY_CACHE_MAX = 200
const WORKER_IDLE_MS = 5 * 60 * 1000
const TRANSFORM_TIMEOUT_MS = 30 * 1000
const MAX_TRANSFORMS_PER_IP = 30
const IP_WINDOW_MS = 10 * 60 * 1000
const MAX_TRACKED_IPS = 10000

const memoryCache = new Map()
const pending = new Map()
const transformsByIp = new Map()

let worker = null, idleTimer = null, nextJobId = 0
const jobs = new Map()

const failAllJobs = (error) => {
    jobs.forEach(job => {
        clearTimeout(job.timer)
        job.reject(error)
    })
    jobs.clear()
}

const stopWorker = () => {
    clearTimeout(idleTimer)
    if (worker) {
        const w = worker
        worker = null
        w.terminate()
    }
}

const getWorker = () => {
    clearTimeout(idleTimer)
    if (!worker) {
        const w = new Worker(new URL('./legacyJsTransform.mjs', import.meta.url))
        w.unref()
        w.on('message', ({id, code, error}) => {
            const job = jobs.get(id)
            if (job) {
                jobs.delete(id)
                clearTimeout(job.timer)
                if (error) {
                    const err = new Error(error)
                    err.status = 422
                    job.reject(err)
                } else {
                    job.resolve(code)
                }
            }
            if (jobs.size === 0) {
                idleTimer = setTimeout(stopWorker, WORKER_IDLE_MS)
            }
        })
        w.on('error', err => {
            console.error('legacyjs worker error', err)
            if (worker === w) worker = null
            failAllJobs(err)
        })
        w.on('exit', () => {
            if (worker === w) worker = null
            failAllJobs(new Error('legacyjs worker stopped'))
        })
        worker = w
    }
    return worker
}

const transformInWorker = (code) => new Promise((resolve, reject) => {
    const id = nextJobId++
    const job = {resolve, reject}
    job.timer = setTimeout(() => {
        console.warn('legacyjs transform timeout -> restart worker')
        // kills the endless conversion, rejects all jobs of this worker
        stopWorker()
        failAllJobs(new Error('legacyjs transform timeout'))
    }, TRANSFORM_TIMEOUT_MS)
    jobs.set(id, job)
    getWorker().postMessage({id, code})
})

const isIpLimited = (ip) => {
    const now = Date.now()
    let entry = transformsByIp.get(ip)
    if (!entry || now - entry.start > IP_WINDOW_MS) {
        if (transformsByIp.size >= MAX_TRACKED_IPS) transformsByIp.clear()
        entry = {start: now, count: 0}
        transformsByIp.set(ip, entry)
    }
    return ++entry.count > MAX_TRANSFORMS_PER_IP
}

const rememberInMemory = (key, value) => {
    if (memoryCache.size >= MEMORY_CACHE_MAX) {
        memoryCache.delete(memoryCache.keys().next().value)
    }
    memoryCache.set(key, value)
}

const readDiskCache = async (file) => {
    try {
        return await fs.promises.readFile(file, 'utf8')
    } catch (e) {
        return null
    }
}

const writeDiskCache = (file, value) => {
    fs.promises.mkdir(CACHE_DIR, {recursive: true})
        .then(() => fs.promises.writeFile(file, value))
        .catch(e => console.warn('legacyjs: cache not written', e.message))
}

const getLegacyJs = async (code, ip) => {
    const key = crypto.createHash('sha1').update(CACHE_VERSION + '\n' + code).digest('hex')

    const cached = memoryCache.get(key)
    if (cached !== undefined) {
        return cached
    }
    if (pending.has(key)) {
        return pending.get(key)
    }
    const promise = (async () => {
        const file = path.join(CACHE_DIR, key + '.js')
        let result = await readDiskCache(file)
        if (result === null) {
            if (isIpLimited(ip)) {
                const err = new Error('Too Many Requests')
                err.status = 429
                throw err
            }
            const startTime = Date.now()
            result = await transformInWorker(code)
            console.log(`legacyjs: converted ${code.length} chars in ${Date.now() - startTime}ms for ${ip}`)
            writeDiskCache(file, result)
        }
        rememberInMemory(key, result)
        return result
    })()
    pending.set(key, promise)
    try {
        return await promise
    } finally {
        pending.delete(key)
    }
}

const sendText = (res, status, text, contentType = 'text/plain') => {
    res.writeHead(status, {'Content-Type': contentType + '; charset=utf-8', 'Cache-Control': 'no-store'})
    res.end(text)
}

export const handleLegacyJsRequest = (req, res, remoteAddress) => {
    if (req.method !== 'POST') {
        sendText(res, 405, 'Method Not Allowed')
        return
    }
    const chunks = []
    let length = 0, aborted = false
    req.on('data', chunk => {
        if (aborted) return
        length += chunk.length
        if (length > MAX_CODE_LENGTH) {
            aborted = true
            sendText(res, 413, 'Payload Too Large')
            req.destroy()
            return
        }
        chunks.push(chunk)
    })
    req.on('end', () => {
        if (aborted) return
        const code = Buffer.concat(chunks).toString('utf8')
        if (!code) {
            sendText(res, 400, 'No code')
            return
        }
        getLegacyJs(code, remoteAddress)
            .then(result => sendText(res, 200, result, 'text/javascript'))
            .catch(e => sendText(res, e.status || 500, e.message))
    })
}
