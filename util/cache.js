/*
 A very basic cache implementation
 */

const Cache = {
    cache: {},
    aliases:{},
    setAlias: (aliasKey, key)=>{
        Cache.aliases[aliasKey] = key
    },
    set: function (key, data, expiresIn) {
        Cache.cache[key] = {data, validUntil: (expiresIn ? (new Date()).getTime() + expiresIn : 0)}
    },
    get: function (key) {
        const o = Cache.cache[key]
        if (o) {
            if (Cache.isValid(o)) {
                return o.data
            } else {
                delete Cache.cache[key]
            }
        }
        return null
    },
    isValid: function (o) {
        return o.validUntil === 0 || (new Date()).getTime() < o.validUntil
    },
    remove: function (key) {
        delete Cache.cache[key]
    },
    clearStartWith: (startkey) => {
        Object.keys(Cache.cache).forEach(key => {
            if (key.indexOf(startkey) === 0) {
                delete Cache.cache[key]
            }
        })

        Object.keys(Cache.aliases).forEach(key => {
            if (key.indexOf(startkey) === 0) {

                console.log('clear cache by alias key '+key)
                delete Cache.cache[Cache.aliases[key]]
                delete Cache.aliases[key]
            }
        })
    }
}

export default Cache
