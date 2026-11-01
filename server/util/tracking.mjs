import {HOSTRULE_HEADER} from '../../api/constants/index.mjs'
import {clientAddress} from '../../util/host.mjs'

/*
 Tracking of pages that are served from the html cache (the api does not see these requests).

 Performance: doTrackingEvent only pushes into an in-memory queue (no await, no network).
 The queue is sent as ONE request to the api every few seconds (POST /tracking/batch,
 see extensions/usertracking/server.mjs). If the api is not reachable the batch is dropped -
 tracking must never slow down or break the delivery of a page.
*/

const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)
const FLUSH_MS = 3000
const MAX_BATCH = 1000
const MAX_QUEUE = 10000
const TIMEOUT_MS = 5000

const QUEUE = []
let timer = null
let sending = false
let dropped = 0
// after a failed batch (api restarting) the next batches wait a moment instead of failing every 3 seconds
const RETRY_AFTER_MS = 30000
let pausedUntil = 0

const flush = async () => {
    timer = null
    if (sending || QUEUE.length === 0 || Date.now() < pausedUntil) {
        if (QUEUE.length) schedule()
        return
    }
    sending = true
    const events = QUEUE.splice(0, MAX_BATCH)
    try {
        const res = await fetch(`http://localhost:${API_PORT}/tracking/batch`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({events}),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        if (!res.ok && res.status !== 204) {
            console.warn(`tracking: batch of ${events.length} rejected (${res.status})`)
        }
    } catch (e) {
        console.warn(`tracking: batch of ${events.length} dropped (${e.message}), next try in ${RETRY_AFTER_MS / 1000}s`)
        pausedUntil = Date.now() + RETRY_AFTER_MS
    } finally {
        sending = false
        if (dropped) {
            console.warn(`tracking: ${dropped} events dropped, queue was full`)
            dropped = 0
        }
        if (QUEUE.length) schedule()
    }
}

const schedule = () => {
    if (!timer) {
        timer = setTimeout(flush, FLUSH_MS)
        timer.unref()
    }
}

/* synchronous, never throws - the returned value is undefined (await is not needed) */
export const doTrackingEvent = (req, {event, host, isBot}) => {
    try {
        if (QUEUE.length >= MAX_QUEUE) {
            dropped++
            return
        }
        QUEUE.push({
            event,
            ip: clientAddress(req),
            agent: req.headers['user-agent'] || '',
            host: req.headers[HOSTRULE_HEADER] || host,
            path: req.url,
            referer: req.headers.referer || '',
            isBot: isBot === true
        })
        if (QUEUE.length >= MAX_BATCH) {
            setImmediate(flush)
        } else {
            schedule()
        }
    } catch (e) {
        // ignore - tracking must never break a request
    }
}
