import {registerWatchdogActivity} from './eventLoopWatchdog.mjs'
/*
 A very basic cache implementation
 */

const SWEEP_EVERY_N_SETS = 100
// expired entries are kept this long before sweep() removes them, so callers
// doing stale-while-revalidate via peek() can still serve the old data
const STALE_GRACE_MS = 60 * 60 * 1000

const Cache = {
    cache: Object.create(null),
    aliases: Object.create(null),
    setCount: 0,
    setAlias: (aliasKey, key) => {
        Cache.aliases[aliasKey] = key
    },
    set: function (key, data, expiresIn) {
        console.debug(`Cache: add to cache ${key}`)
        Cache.cache[key] = {data, validUntil: (expiresIn ? Date.now() + expiresIn : 0)}

        // get() expires entries lazily on access only, so entries that are never
        // read again would stay in memory forever. sweep amortized on write.
        if (++Cache.setCount >= SWEEP_EVERY_N_SETS) {
            Cache.setCount = 0
            Cache.sweep()
        }
    },
    get: function (key) {
        let realKey = key
        let o = Cache.cache[realKey]
        if (o === undefined) {
            realKey = Cache.aliases[key]
            if (realKey === undefined) {
                return
            }
            o = Cache.cache[realKey]
            if (o === undefined) {
                return
            }
        }
        if (o.validUntil === 0 || Date.now() < o.validUntil) {
            return o.data
        }
        delete Cache.cache[realKey]
        return
    },
    /* returns the raw entry {data, validUntil} even if it is expired (no deletion) */
    peek: function (key) {
        const o = Cache.cache[key]
        if (o !== undefined) {
            return o
        }
        const realKey = Cache.aliases[key]
        return realKey === undefined ? undefined : Cache.cache[realKey]
    },
    keys: function () {
        return Object.keys(Cache.cache)
    },
    size: function () {
        return Object.keys(Cache.cache).length
    },
    /* raw key -> entry map, for diagnostics only - do not mutate */
    getAll: function () {
        return Cache.cache
    },
    /* removes everything incl. aliases, returns the number of removed entries */
    clearAll: function () {
        const count = Cache.size()
        Cache.notifyClear([''])
        Cache.cache = Object.create(null)
        Cache.aliases = Object.create(null)
        Cache.setCount = 0
        return count
    },
    isValid: function (o) {
        return o.validUntil === 0 || Date.now() < o.validUntil
    },
    /* removes entries expired for longer than STALE_GRACE_MS and aliases pointing to removed keys */
    sweep: function () {
        const now = Date.now()
        const sweepStart = performance.now()
        let removed = 0

        for (const key of Object.keys(Cache.cache)) {
            const o = Cache.cache[key]
            if (o.validUntil !== 0 && now - o.validUntil >= STALE_GRACE_MS) {
                delete Cache.cache[key]
                removed++
            }
        }

        if (removed > 0) {
            // drop aliases that no longer point to an existing entry
            for (const aliasKey of Object.keys(Cache.aliases)) {
                if (Cache.cache[Cache.aliases[aliasKey]] === undefined) {
                    delete Cache.aliases[aliasKey]
                }
            }
            console.debug(`Cache: swept ${removed} expired entries`)
        }

        // diagnostic only: a sweep walks all keys synchronously
        const sweepMs = performance.now() - sweepStart
        if (sweepMs > 20) {
            console.warn(`Cache: sweep took ${Math.round(sweepMs)}ms for ${Object.keys(Cache.cache).length} entries (${removed} removed)`)
        }

        return removed
    },
    remove: function (key) {
        console.debug(`Cache: remove key from cache ${key}`)
        Cache.notifyClear([key])
        delete Cache.cache[key]
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

        const matches = key => allStartKeys.some(f => key.startsWith(f))

        Object.keys(Cache.cache).forEach(key => {
            if (matches(key)) {
                console.debug('Cache: clear cache by key ' + key)
                delete Cache.cache[key]
            }
        })

        Object.keys(Cache.aliases).forEach(key => {
            if (matches(key)) {
                console.debug('Cache: clear cache by alias key ' + key)
                delete Cache.cache[Cache.aliases[key]]
                delete Cache.aliases[key]
            }
        })
    }
}
// diagnostic only: cache size shows up in event loop stall logs
registerWatchdogActivity('cache', () => [`${Object.keys(Cache.cache).length} keys`])

export default Cache