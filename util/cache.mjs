/*
 A very basic cache implementation
 */

const Cache = {
    cache: Object.create(null),
    aliases: Object.create(null),
    setAlias: (aliasKey, key) => {
        Cache.aliases[aliasKey] = key
    },
    set: function (key, data, expiresIn) {
        console.debug(`Cache: add to cache ${key}`)
        Cache.cache[key] = {data, validUntil: (expiresIn ? Date.now() + expiresIn : 0)}
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