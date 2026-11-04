import {registerWatchdogActivity} from './eventLoopWatchdog.mjs'
import defaultConfig from '../gensrc/config.mjs'
/*
 A very basic cache implementation
 */

const SWEEP_EVERY_N_SETS = 100
// a sweep walks all entries: at most once per interval, also with many sets per second.
// Entries are only removed STALE_GRACE_MS after they expired anyway, so a delay of
// a few seconds changes nothing (MAX_ENTRIES still bounds the size via evict())
const SWEEP_MIN_INTERVAL_MS = 30 * 1000

// debug output only when Cache.debug is set. Checked before the message is built: a template
// string per set() is wasted work when nothing is logged (the web server does not mute
// console.debug, there every set was written to the log).
// Default from the build config; the api server binds it to its dynamic config (api/server.mjs).
// No getDynamicConfig() here: it starts a refresh timer that keeps tests and workers alive
const isDebug = () => Cache.debug
// expired entries are kept this long before sweep() removes them, so callers
// doing stale-while-revalidate via peek() can still serve the old data
const STALE_GRACE_MS = 60 * 60 * 1000

// Upper bound for the number of entries. Part of the keys depend on request
// input (e.g. "not found" entries per url), so without a limit a scanner with
// random urls grows the cache - and the O(n) sweep - without bound.
// Only reached under pressure; every entry is a plain cache of recomputable
// data, so an evicted entry just means a cache miss (reload from the db).
// LUNUC_CACHE_MAX_ENTRIES=0 -> no limit (old behaviour)
const MAX_ENTRIES = (() => {
    const v = parseInt(process.env.LUNUC_CACHE_MAX_ENTRIES)
    return isNaN(v) ? 50000 : v
})()
// evict down to this fill level, so the O(n) eviction runs at most once per
// 10% of MAX_ENTRIES new entries (amortized)
const EVICT_TARGET = Math.floor(MAX_ENTRIES * 0.9)
const EVICT_WARN_INTERVAL_MS = 60 * 1000

// Map instead of a plain object: O(1) size, insertion order for the eviction
// (oldest first) and iteration without allocating a key array.
// Keys are converted to strings, exactly like the property keys of the
// previous plain object (same lookup semantics for numbers, ObjectIds, ...)
const toCacheMap = (value) => {
    if (value instanceof Map) {
        return value
    }
    // compatibility: scripts stored in the db (cronjobs, apis) still reset the cache with
    // `Cache.cache = {}` from the time it was a plain object. Without this conversion every
    // following Cache.get() throws "Cache.cache.get is not a function"
    if (!toCacheMap.warned) {
        toCacheMap.warned = true
        console.warn('Cache: Cache.cache was assigned a plain object - converted to a Map. Use Cache.clearAll() instead')
    }
    return new Map(value && typeof value === 'object' ? Object.entries(value) : [])
}

const Cache = {
    // internal code uses _cache directly (no getter call on the hot path),
    // the accessor is only for scripts that read or reset Cache.cache from outside
    _cache: new Map(),
    get cache() {
        return Cache._cache
    },
    set cache(value) {
        Cache._cache = toCacheMap(value)
    },
    aliases: new Map(),
    setCount: 0,
    lastSweep: 0,
    debug: !!defaultConfig.DEBUG || (typeof process !== 'undefined' && !!process.env.LUNUC_CACHE_DEBUG),
    lastEvictWarn: 0,
    setAlias: (aliasKey, key) => {
        Cache.aliases.set(String(aliasKey), String(key))
    },
    set: function (key, data, expiresIn) {
        key = String(key)
        if (isDebug()) {
            console.debug(`Cache: add to cache ${key}`)
        }
        // delete first: a re-set entry moves to the end of the insertion order
        // (= youngest), so the eviction removes entries that were not refreshed
        Cache._cache.delete(key)
        Cache._cache.set(key, {data, validUntil: (expiresIn ? Date.now() + expiresIn : 0)})

        if (MAX_ENTRIES > 0 && Cache._cache.size > MAX_ENTRIES) {
            Cache.evict()
        }

        // get() expires entries lazily on access only, so entries that are never
        // read again would stay in memory forever. sweep amortized on write.
        if (++Cache.setCount >= SWEEP_EVERY_N_SETS) {
            const now = Date.now()
            if (now - Cache.lastSweep >= SWEEP_MIN_INTERVAL_MS) {
                Cache.setCount = 0
                Cache.lastSweep = now
                Cache.sweep()
            }
        }
    },
    get: function (key) {
        key = String(key)
        let realKey = key
        let o = Cache._cache.get(realKey)
        if (o === undefined) {
            realKey = Cache.aliases.get(key)
            if (realKey === undefined) {
                return
            }
            o = Cache._cache.get(realKey)
            if (o === undefined) {
                return
            }
        }
        if (o.validUntil === 0 || Date.now() < o.validUntil) {
            return o.data
        }
        Cache._cache.delete(realKey)
        return
    },
    /* returns the raw entry {data, validUntil} even if it is expired (no deletion) */
    peek: function (key) {
        key = String(key)
        const o = Cache._cache.get(key)
        if (o !== undefined) {
            return o
        }
        const realKey = Cache.aliases.get(key)
        return realKey === undefined ? undefined : Cache._cache.get(realKey)
    },
    keys: function () {
        return [...Cache._cache.keys()]
    },
    size: function () {
        return Cache._cache.size
    },
    /* snapshot key -> entry as plain object, for diagnostics only */
    getAll: function () {
        return Object.fromEntries(Cache._cache)
    },
    /* removes everything incl. aliases, returns the number of removed entries */
    clearAll: function () {
        const count = Cache.size()
        Cache.notifyClear([''])
        Cache._cache = new Map()
        Cache.aliases = new Map()
        Cache.setCount = 0
        return count
    },
    isValid: function (o) {
        return o.validUntil === 0 || Date.now() < o.validUntil
    },
    /* drops aliases that no longer point to an existing entry */
    sweepAliases: function () {
        for (const [aliasKey, realKey] of Cache.aliases) {
            if (!Cache._cache.has(realKey)) {
                Cache.aliases.delete(aliasKey)
            }
        }
    },
    /* removes entries expired for longer than STALE_GRACE_MS and aliases pointing to removed keys */
    sweep: function () {
        const now = Date.now()
        const sweepStart = performance.now()
        let removed = 0

        // deleting the current entry while iterating a Map is safe
        for (const [key, o] of Cache._cache) {
            if (o.validUntil !== 0 && now - o.validUntil >= STALE_GRACE_MS) {
                Cache._cache.delete(key)
                removed++
            }
        }

        if (removed > 0) {
            Cache.sweepAliases()
            if (isDebug()) {
                console.debug(`Cache: swept ${removed} expired entries`)
            }
        }

        // diagnostic only: a sweep walks all keys synchronously
        const sweepMs = performance.now() - sweepStart
        if (sweepMs > 20) {
            console.warn(`Cache: sweep took ${Math.round(sweepMs)}ms for ${Cache._cache.size} entries (${removed} removed)`)
        }

        return removed
    },
    /*
     Called when MAX_ENTRIES is exceeded:
       1. remove all expired entries, ignoring the stale grace period (under
          pressure a stale-while-revalidate fallback is worth less than room)
       2. if still too full, remove the oldest entries (least recently set)
     down to EVICT_TARGET.
    */
    evict: function () {
        const now = Date.now()
        const start = performance.now()
        const sizeBefore = Cache._cache.size
        let expired = 0, oldest = 0

        for (const [key, o] of Cache._cache) {
            if (o.validUntil !== 0 && now >= o.validUntil) {
                Cache._cache.delete(key)
                expired++
            }
        }

        if (Cache._cache.size > EVICT_TARGET) {
            for (const key of Cache._cache.keys()) {
                if (Cache._cache.size <= EVICT_TARGET) {
                    break
                }
                Cache._cache.delete(key)
                oldest++
            }
        }

        Cache.sweepAliases()

        if (now - Cache.lastEvictWarn >= EVICT_WARN_INTERVAL_MS) {
            Cache.lastEvictWarn = now
            console.warn(`Cache: limit of ${MAX_ENTRIES} entries reached - removed ${expired} expired and ${oldest} oldest entries (${sizeBefore} -> ${Cache._cache.size}) in ${Math.round(performance.now() - start)}ms`)
        }
    },
    remove: function (key) {
        if (isDebug()) {
            console.debug(`Cache: remove key from cache ${key}`)
        }
        Cache.notifyClear([key])
        Cache._cache.delete(String(key))
    },
    // listeners notified on invalidation (e.g. to stop in-flight loads from
    // writing an already invalidated value back into the cache)
    clearListeners: [],
    onClear: (listener) => {
        Cache.clearListeners.push(listener)
    },
    notifyClear: (prefixes) => {
        for (const listener of Cache.clearListeners) {
            try {
                listener(prefixes)
            } catch (e) {
                console.warn('Cache: clear listener failed', e)
            }
        }
    },
    clearStartWith: (startkey) => {
        const allStartKeys = [].concat(startkey)  // handles both string and array
        Cache.notifyClear(allStartKeys)

        const debug = isDebug()
        const matches = key => allStartKeys.some(f => key.startsWith(f))

        for (const key of Cache._cache.keys()) {
            if (matches(key)) {
                if (debug) {
                    console.debug('Cache: clear cache by key ' + key)
                }
                Cache._cache.delete(key)
            }
        }

        if (Cache.aliases.size > 0) {
            for (const [key, realKey] of Cache.aliases) {
                if (matches(key)) {
                    if (debug) {
                        console.debug('Cache: clear cache by alias key ' + key)
                    }
                    Cache._cache.delete(realKey)
                    Cache.aliases.delete(key)
                }
            }
        }
    }
}
// diagnostic only: cache size shows up in event loop stall logs
registerWatchdogActivity('cache', () => [`${Cache._cache.size} keys`])

export default Cache
