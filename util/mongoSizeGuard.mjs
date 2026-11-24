// util/mongoSizeGuard.mjs
//
// A document over the BSON size limit (16 MB) fails inside the driver while the
// command is serialized. The error ("RangeError: The value of "offset" is out of
// range" or a BSONError) carries only driver frames - the log entry does not
// show which collection was written.
//
// This guard wraps the write methods of Collection. On such an error the message
// is prefixed with operation, collection and size, e.g.
// "[insertOne Log, 17.0 MB] The value of "offset" is out of range ...",
// and error.debugData (stored by the log extension) gets the largest fields.
//
// Load: everything is determined in the catch, a successful write costs only the
// wrapper call. Reads are not wrapped.

import {Collection, BSON} from 'mongodb'

const WRITE_METHODS = ['insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne',
    'findOneAndUpdate', 'findOneAndReplace', 'bulkWrite']
const MAX_FIELDS = 8
const MB = 1024 * 1024

const isBsonSizeError = (error) => {
    if (!error) return false
    const message = String(error.message || '')
    if (error.code === 'ERR_OUT_OF_RANGE' && String(error.stack || '').includes('bson')) return true
    if (error.name === 'BSONError' && /size|larger/i.test(message)) return true
    // rejected by the server (document a little over 16 MB): code 10334 / BSONObjectTooLarge,
    // message e.g. "object to insert too large. size in bytes: ..., max size: 16777216"
    if (error.code === 10334 || error.codeName === 'BSONObjectTooLarge') return true
    return /larger than the maximum|exceeds.*maximum.*size|too large|BSONObjectTooLarge/i.test(message)
}

const sizeOf = (value) => {
    try {
        return BSON.calculateObjectSize({v: value})
    } catch {
        return -1
    }
}

const formatSize = (bytes) => bytes < 0 ? '?' : (bytes >= MB ? (bytes / MB).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB')

// largest fields, one level deeper for big plain objects (GenericData keeps its fields in "data")
const largestFields = (doc, prefix = '', depth = 0, out = []) => {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc._bsontype) return out
    for (const key of Object.keys(doc)) {
        const value = doc[key]
        const size = sizeOf(value)
        out.push({path: prefix + key, size})
        if (depth < 1 && size > MB && value && typeof value === 'object' && !Array.isArray(value) && !value._bsontype) {
            largestFields(value, prefix + key + '.', depth + 1, out)
        }
    }
    return out
}

// the documents a write method sends
const payloadOf = (method, args) => {
    switch (method) {
        case 'insertOne': return [args[0]]
        case 'insertMany':
        case 'bulkWrite': return Array.isArray(args[0]) ? args[0] : []
        case 'replaceOne':
        case 'findOneAndReplace': return [args[1]]
        default: return Array.isArray(args[1]) ? args[1] : [args[1]] // updates
    }
}

const enrichError = (error, collection, method, args) => {
    if (!isBsonSizeError(error) || error.debugData?.collection) return
    try {
        const name = collection?.collectionName || '?'
        const payload = payloadOf(method, args)
        const total = payload.reduce((sum, doc) => sum + Math.max(0, sizeOf(doc)), 0)
        const fields = payload
            .flatMap((doc, i) => largestFields(doc, payload.length > 1 ? `[${i}].` : ''))
            .sort((a, b) => b.size - a.size)
            .slice(0, MAX_FIELDS)
            .map(f => `${f.path}: ${formatSize(f.size)}`)

        error.debugData = {
            ...(error.debugData || {}),
            collection: name,
            operation: method,
            documents: payload.length,
            totalSize: formatSize(total),
            largestFields: fields
        }
        error.message = `[${method} ${name}, ${formatSize(total)}] ${error.message}`
    } catch (e) {
        // never hide the original error
    }
}

export const installMongoSizeGuard = () => {
    const proto = Collection.prototype
    if (proto.__lunucSizeGuard__) return
    Object.defineProperty(proto, '__lunucSizeGuard__', {value: true})

    for (const method of WRITE_METHODS) {
        const original = proto[method]
        if (typeof original !== 'function') continue

        proto[method] = function (...args) {
            let result
            try {
                result = original.apply(this, args)
            } catch (error) {
                enrichError(error, this, method, args)
                throw error
            }
            if (result && typeof result.catch === 'function') {
                return result.catch(error => {
                    enrichError(error, this, method, args)
                    throw error
                })
            }
            return result
        }
    }
}
