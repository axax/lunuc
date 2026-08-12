/*
 A very basic cache implementation
 */

const SWEEP_EVERY_N_SETS = 100

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
    isValid: function (o) {
        return o.validUntil === 0 || Date.now() < o.validUntil
    },
    /* removes all expired entries and aliases pointing to removed keys */
    sweep: function () {
        const now = Date.now()
        let removed = 0

        for (const key of Object.keys(Cache.cache)) {
            const o = Cache.cache[key]
            if (o.validUntil !== 0 && now >= o.validUntil) {
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

        return removed
    },
    remove: function (key) {
        console.debug(`Cache: remove key from cache ${key}`)
        delete Cache.cache[key]
    },
    clearStartWith: (startkey) => {
        const allStartKeys = [].concat(startkey)  // handles both string and array

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
export default Cache