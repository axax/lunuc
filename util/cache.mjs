/*
 A very basic cache implementation
 */

const Cache = {
    cache: {},
    aliases: {},
    setAlias: (aliasKey, key) => {
        Cache.aliases[aliasKey] = key
    },
    set: function (key, data, expiresIn) {
        console.debug(`Cache: add to cache ${key}`)
        Cache.cache[key] = {data, validUntil: (expiresIn ? (new Date()).getTime() + expiresIn : 0)}
    },
    get: function (key) {
        const o = Cache.cache[key] || Cache.cache[Cache.aliases[key]]
        if (o) {
            if (Cache.isValid(o)) {
                return o.data
            } else {
                delete Cache.cache[key]
            }
        }
        return
    },
    isValid: function (o) {
        return o.validUntil === 0 || (new Date()).getTime() < o.validUntil
    },
    remove: function (key) {
        console.debug(`Cache: remove key from cache ${key}`)
        delete Cache.cache[key]
    },
    clearStartWith: (startkey) => {
        console.debug(`Cache: clear cache start with ${startkey}`)
        Object.keys(Cache.cache).forEach(key => {
            if (key.indexOf(startkey) === 0) {
                console.debug('clear cache by key ' + key)
                delete Cache.cache[key]
            }
        })

        Object.keys(Cache.aliases).forEach(key => {
            if (key.indexOf(startkey) === 0) {
                console.debug('Cache: clear cache by alias key ' + key)
                delete Cache.cache[Cache.aliases[key]]
                delete Cache.aliases[key]
            }
        })
    }
}
export default Cache
