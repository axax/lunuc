import net from 'net'

const LOGIN_ATTEMPTS_MAP = {},
    MAX_LOGIN_ATTEMPTS = 5,
    LOGIN_DELAY_IN_SEC = 180

// Per-username lockout (second key next to the per-IP one): catches guessing that rotates
// the source IP but keeps the same username. Deliberately more lenient than the per-IP
// limit - whoever knows a username could otherwise lock its owner out with a few
// failed logins. Used by the web login and the ftp server.
export const USERNAME_LOCKOUT_OPTIONS = {maxAttempts: 20, delayInSec: 900}

// Key for the per-IP counter. An IPv6 connection usually owns a whole /64 network
// (2^64 addresses) - counted per address the limit would be useless there, so
// IPv6 is counted per /64 prefix. IPv4 stays as it is.
export const ipBlockKey = (ip) => {
    if (!ip || !net.isIPv6(ip)) {
        return ip
    }
    const [head, tail] = ip.split('%')[0].toLowerCase().split('::')
    const headGroups = head ? head.split(':') : []
    let groups = headGroups
    if (tail !== undefined) {
        const tailGroups = tail ? tail.split(':') : []
        // an embedded IPv4 (::ffff:1.2.3.4) takes two groups
        const tailLength = tailGroups.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0)
        groups = [...headGroups, ...Array(Math.max(0, 8 - headGroups.length - tailLength)).fill('0'), ...tailGroups]
    }
    return groups.slice(0, 4).map(g => (parseInt(g, 16) || 0).toString(16)).join(':') + '::/64'
}

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
// must cover the longest block window in use (USERNAME_LOCKOUT_OPTIONS), otherwise the
// sweep would lift a username block before it expires
const ENTRY_MAX_AGE_MS = Math.max(LOGIN_DELAY_IN_SEC, USERNAME_LOCKOUT_OPTIONS.delayInSec) * 1000 * 2
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