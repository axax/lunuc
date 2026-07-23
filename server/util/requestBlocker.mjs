// server/util/requestBlocker.mjs
//
// Temporary key blocking: if a key (usually an ip, or a prefixed ip)
// exceeds {requestPerTime} requests within {requestTimeInMs}, it gets
// blocked for {requestBlockForInMs}.
//
// Fixes over the previous version:
//   - each bucket remembers ITS OWN window/block duration. The cleanup
//     sweep previously used the requestTimeInMs of whatever call happened
//     to trigger it - a call with a 1s window would purge 10s-window
//     buckets after 2s, silently resetting their counters and rendering
//     longer limits ineffective on servers with mixed windows.
//   - blocked entries expire via the sweep too. Previously they were only
//     removed when the same key was checked again after expiry - ip
//     rotating bots left entries behind forever (slow memory leak).
//   - hard size caps as a safety net against key-cardinality attacks.
//   - the "blocked" log line fires once per block period per key instead
//     of on every denied request (log spam under flood).
//
// Semantics preserved: fixed window counting, the limit is exclusive
// (blocking starts at requestPerTime + 1), denied requests do not extend
// the block. NOTE: a key has ONE bucket - checking the same key with
// different configs makes them share (and double-count) it. Use distinct
// key prefixes per limit, e.g. 'index1s-' + ip / 'index10s-' + ip.

const DEFAULT_REQUEST_TIME_IN_MS = 10000, /* 10s */
    DEFAULT_REQUEST_MAX_PER_TIME = 1000,
    DEFAULT_REQUEST_BLOCK_FOR_IN_MS = 60000 * 5

const MAX_ENTRIES = 50000
const SWEEP_EVERY_N_CALLS = 100

const counters = new Map()   // key -> {start, count, windowMs}
const blocked = new Map()    // key -> {start, blockForMs, logged}
let callCounter = 0


export const resetCounterForKey = (key) => {
    counters.delete(key)
    blocked.delete(key)
}

const sweep = (now) => {
    for (const [key, entry] of counters) {
        // each bucket expires by its OWN window, not the caller's
        if (now - entry.start > entry.windowMs + 1000) {
            counters.delete(key)
        }
    }
    for (const [key, entry] of blocked) {
        if (now - entry.start > entry.blockForMs) {
            blocked.delete(key)
        }
    }
    // hard caps as a last resort - evict oldest entries first. Reaching
    // this means someone is flooding with high key cardinality; degrading
    // limiter precision is acceptable, unbounded memory growth is not.
    if (counters.size > MAX_ENTRIES) {
        const keys = counters.keys()
        while (counters.size > MAX_ENTRIES) {
            counters.delete(keys.next().value)
        }
    }
    if (blocked.size > MAX_ENTRIES) {
        const keys = blocked.keys()
        while (blocked.size > MAX_ENTRIES) {
            blocked.delete(keys.next().value)
        }
    }
}

export const isTemporarilyBlocked = ({
                                         key,
                                         requestPerTime = DEFAULT_REQUEST_MAX_PER_TIME,
                                         requestTimeInMs = DEFAULT_REQUEST_TIME_IN_MS,
                                         requestBlockForInMs = DEFAULT_REQUEST_BLOCK_FOR_IN_MS
                                     }) => {
    const now = Date.now()

    const blockEntry = blocked.get(key)
    if (blockEntry) {
        if (now - blockEntry.start > blockEntry.blockForMs) {
            blocked.delete(key)
        } else {
            if (!blockEntry.logged) {
                blockEntry.logged = true
                console.log(`${key} is temporarily blocked due to too many requests in a short time`)
            }
            return true
        }
    }

    let counter = counters.get(key)
    if (!counter || now - counter.start > requestTimeInMs) {
        counter = {start: now, count: 0, windowMs: requestTimeInMs}
        counters.set(key, counter)
    }
    counter.count++

    if (counter.count > requestPerTime) {
        blocked.set(key, {start: now, blockForMs: requestBlockForInMs, logged: false})
        counters.delete(key)
        console.log(`${key} exceeded ${requestPerTime} requests in ${requestTimeInMs}ms - blocking for ${requestBlockForInMs}ms`)
        return true
    }

    if (++callCounter > SWEEP_EVERY_N_CALLS) {
        callCounter = 0
        sweep(now)
    }

    return false
}