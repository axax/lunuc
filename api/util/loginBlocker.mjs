const LOGIN_ATTEMPTS_MAP = {},
    MAX_LOGIN_ATTEMPTS = 5,
    LOGIN_DELAY_IN_SEC = 180

// Callers can override the threshold/window per call (e.g. a per-username
// lockout that is deliberately more lenient than the default per-IP one -
// see the ftp login handler). Falls back to the defaults above when no
// override is given, so all existing call sites keep their current
// behavior unchanged.

// Without cleanup, LOGIN_ATTEMPTS_MAP grows without bound: an entry is only
// removed when either (a) the IP eventually logs in successfully
// (clearInvalidLoginAttempt), or (b) it exceeds MAX_LOGIN_ATTEMPTS, the
// block window elapses, AND hasTooManyInvalidLoginAttempts happens to be
// called again for that exact key. An IP/key that tries a few times and
// never returns leaves a permanent entry - trivially abusable as a
// memory-exhaustion DoS by cycling through many source IPs (or many
// "ip:ftp" style keys). A periodic sweep removes stale entries regardless
// of how many attempts they made, and a hard cap bounds worst-case memory
// even between sweeps.
const ENTRY_MAX_AGE_MS = LOGIN_DELAY_IN_SEC * 1000 * 2
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
const MAX_TRACKED_KEYS = 50000

const sweepStaleEntries = () => {
    const now = Date.now()
    for (const key of Object.keys(LOGIN_ATTEMPTS_MAP)) {
        if (now - LOGIN_ATTEMPTS_MAP[key].lasttry > ENTRY_MAX_AGE_MS) {
            delete LOGIN_ATTEMPTS_MAP[key]
        }
    }
}

// unref() so this timer never keeps the process alive on its own (e.g.
// during the SIGINT shutdown path in api/index.mjs)
const sweepTimer = setInterval(sweepStaleEntries, SWEEP_INTERVAL_MS)
if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref()
}

// Hard cap as a safety net between sweeps: if a burst of distinct keys
// arrives faster than the sweep interval, drop the oldest tracked key
// rather than growing unbounded. This intentionally trades a small amount
// of rate-limiting precision (an old entry might be evicted slightly
// early) for a hard ceiling on memory usage.
const enforceMaxTrackedKeys = () => {
    const keys = Object.keys(LOGIN_ATTEMPTS_MAP)
    if (keys.length <= MAX_TRACKED_KEYS) {
        return
    }
    let oldestKey = keys[0]
    let oldestTime = LOGIN_ATTEMPTS_MAP[oldestKey].lasttry
    for (const key of keys) {
        if (LOGIN_ATTEMPTS_MAP[key].lasttry < oldestTime) {
            oldestKey = key
            oldestTime = LOGIN_ATTEMPTS_MAP[key].lasttry
        }
    }
    delete LOGIN_ATTEMPTS_MAP[oldestKey]
}


export const hasTooManyInvalidLoginAttempts = (ip, {maxAttempts = MAX_LOGIN_ATTEMPTS, delayInSec = LOGIN_DELAY_IN_SEC} = {}) => {

    if (LOGIN_ATTEMPTS_MAP[ip] && LOGIN_ATTEMPTS_MAP[ip].count >= maxAttempts) {
        const time = new Date().getTime()

        if (time - LOGIN_ATTEMPTS_MAP[ip].lasttry < delayInSec * 1000) {
            return true
        } else {
            delete LOGIN_ATTEMPTS_MAP[ip]
        }
    }
    return false
}

export const addInvalidLoginAttempt = (ip) => {

    if (!LOGIN_ATTEMPTS_MAP[ip]) {
        LOGIN_ATTEMPTS_MAP[ip] = {count: 0}
    }
    LOGIN_ATTEMPTS_MAP[ip].lasttry = new Date().getTime()
    LOGIN_ATTEMPTS_MAP[ip].count++

    enforceMaxTrackedKeys()
}

export const clearInvalidLoginAttempt = (ip) => {
    if (LOGIN_ATTEMPTS_MAP[ip]) {
        delete LOGIN_ATTEMPTS_MAP[ip]
    }
}