// server/util/rateLimiter.mjs
//
// Per-hostrule user agent rate limiting using sliding window counters.
//
// Hostrule config (unchanged format):
//   "rateLimit": [
//     {"userAgent": "GPTBot", "maxRequestsPerTime": 30, "time": 60000},
//     {"userAgent": "AhrefsBot", "maxRequestsPerTime": 10, "time": 60000}
//   ]
//
// Semantics: the limit applies to the PATTERN (all ua variants containing
// it share one bucket) and per HOST (different hosts never share budgets).
// This fixes two bugs of the previous implementation, which keyed buckets
// by the full ua string (googlebot desktop/mobile/image each got their own
// budget) and globally across hosts (one host's traffic consumed another
// host's budget).
//
// Algorithm: sliding window counter - two counters (current + previous
// fixed window) with weighted interpolation instead of a timestamp array.
// O(1) time and memory per request, no array filtering under load. The
// interpolation assumes even distribution within the previous window,
// which slightly over- or under-counts at window edges - irrelevant for
// bot throttling and the standard trade-off (same approach as Cloudflare
// uses for its rate limiting).

const buckets = new Map()

const MAX_BUCKETS = 10000
const SWEEP_INTERVAL_MS = 10 * 60 * 1000

// lowercased pattern cache per hostrule rateLimit array (WeakMap: cleans
// itself up when hostrules are reloaded and the old arrays are dropped)
const preparedConfigs = new WeakMap()

const getPreparedConfigs = (rateLimit) => {
    let prepared = preparedConfigs.get(rateLimit)
    if (!prepared) {
        prepared = rateLimit
            .filter(c => c && c.userAgent && c.maxRequestsPerTime > 0 && c.time > 0)
            .map(c => ({
                pattern: c.userAgent,
                patternLower: c.userAgent.toLowerCase(),
                maxRequestsPerTime: c.maxRequestsPerTime,
                time: c.time
            }))
        preparedConfigs.set(rateLimit, prepared)
    }
    return prepared
}

/**
 * Sliding window counter check + increment for one bucket. O(1).
 * @returns {boolean} true if the request exceeds the limit
 */
const hitBucket = (key, limit, windowMs, now) => {
    const windowStart = Math.floor(now / windowMs) * windowMs

    let bucket = buckets.get(key)

    if (!bucket || bucket.windowMs !== windowMs || windowStart >= bucket.windowStart + 2 * windowMs) {
        // new bucket, changed config, or so old that both windows expired
        bucket = {windowStart, windowMs, count: 0, prevCount: 0, lastSeen: now}
        buckets.set(key, bucket)
    } else if (windowStart > bucket.windowStart) {
        // rolled into the next fixed window - current becomes previous
        bucket.prevCount = bucket.count
        bucket.count = 0
        bucket.windowStart = windowStart
    }

    bucket.lastSeen = now

    // weighted estimate: how much of the previous window still overlaps
    // the sliding window ending now
    const elapsedRatio = (now - windowStart) / windowMs
    const estimated = bucket.prevCount * (1 - elapsedRatio) + bucket.count

    if (estimated >= limit) {
        return true // limited - deliberately not counted, denied requests are cheap
    }

    bucket.count++
    return false
}

/**
 * Checks if a request should be rate limited.
 * Drop-in replacement - same signature and hostrule format as before.
 * @returns {boolean} - true if limited, false if allowed.
 */
export const isRateLimited = (req, hostrule, host = '') => {

    if (!hostrule.rateLimit || !hostrule.rateLimit.length) {
        return false
    }

    const userAgent = req.headers['user-agent']
    if (!userAgent) {
        return false
    }

    const configs = getPreparedConfigs(hostrule.rateLimit)
    if (!configs.length) {
        return false
    }

    const userAgentLower = userAgent.toLowerCase()

    // a ua can match multiple configs - the strictest verdict wins, and
    // every matching bucket is counted so budgets stay consistent
    let limited = false
    const now = Date.now()

    for (const config of configs) {
        if (userAgentLower.includes(config.patternLower)) {
            const key = host + '\n' + config.pattern
            if (hitBucket(key, config.maxRequestsPerTime, config.time, now)) {
                limited = true
            }
        }
    }

    return limited
}

/* ------------------------------------------------------------------ */
/* Housekeeping                                                         */
/* ------------------------------------------------------------------ */

// periodic sweep: drop buckets not seen for two of their own windows.
// Bucket count is naturally bounded (configs x hosts), the sweep and the
// hard cap below just make the module future-proof (e.g. per-ip keys).
const sweep = () => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
        if (now - bucket.lastSeen > 2 * bucket.windowMs) {
            buckets.delete(key)
        }
    }
    // hard cap as a safety net - evict oldest entries first
    if (buckets.size > MAX_BUCKETS) {
        const keys = buckets.keys()
        while (buckets.size > MAX_BUCKETS) {
            buckets.delete(keys.next().value)
        }
    }
}

const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
sweepTimer.unref()