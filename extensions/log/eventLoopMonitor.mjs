import {monitorEventLoopDelay} from 'node:perf_hooks'

/**
 * Event loop delay of the Node process, for the slow query log.
 *
 * queryTime in GenericResolver is wall time measured in Node: when the event
 * loop is blocked (SSR, image processing, large JSON work ...), MongoDB's
 * answer is ready but only picked up seconds later - and every query in that
 * moment looks slow, even a 3 ms findOne. Recording the loop delay next to
 * the slow query tells the two cases apart.
 *
 * Two rolling windows of WINDOW_MS: the reported value covers at least the
 * last WINDOW_MS and at most 2 x WINDOW_MS.
 */

const WINDOW_MS = 5000
const toMs = ns => Math.round(ns / 1e6)

let histogram = null
let previous = {maxMs: 0, p99Ms: 0}

const snapshot = () => histogram && histogram.count > 0
    ? {maxMs: toMs(histogram.max), p99Ms: toMs(histogram.percentile(99))}
    : {maxMs: 0, p99Ms: 0}

const start = () => {
    if (histogram) return
    try {
        histogram = monitorEventLoopDelay({resolution: 20})
        histogram.enable()
        const timer = setInterval(() => {
            previous = snapshot()
            histogram.reset()
        }, WINDOW_MS)
        timer.unref?.()
    } catch (e) {
        console.warn('eventLoopMonitor: not available', e.message)
        histogram = null
    }
}

start()

/** Max and p99 event loop delay in ms over the last 5-10 seconds. */
export const getEventLoopDelay = () => {
    const current = snapshot()
    return {
        maxMs: Math.max(current.maxMs, previous.maxMs),
        p99Ms: Math.max(current.p99Ms, previous.p99Ms),
        windowMs: 2 * WINDOW_MS
    }
}

/**
 * Hint for the slow query log: the blocked event loop explains at least half
 * of the measured query time.
 */
export const eventLoopFinding = (eventLoop, queryTime) => {
    if (!eventLoop || !queryTime || eventLoop.maxMs < 0.5 * queryTime) return null
    return {
        code: 'eventLoopBlocked',
        message: `The Node event loop was blocked for up to ${eventLoop.maxMs} ms around this query ` +
            `(query time ${queryTime} ms) - the delay is most likely in Node, not in MongoDB`
    }
}
