/*
 A very basic cache implementation
 */

const Cache = {
    cache: {},
    set: function (key, data, expiresIn) {
        Cache.cache[key] = {data, validUntil: (expiresIn ? (new Date()).getTime() + expiresIn : 0)}
    },
    get: function (key) {
        const o = Cache.cache[key]
        if (o) {
            if (o.validUntil === 0 || (new Date()).getTime() < o.validUntil) {
                return o.data
            } else {
                delete Cache.cache[key]
            }
        }
        return null
    },
    clearStartWith: (startkey) => {
        Object.keys(Cache.cache).forEach(key => {
            if (key.indexOf(startkey)) {
                delete Cache.cache[key]
            }
        })
    }
}

export default Cache