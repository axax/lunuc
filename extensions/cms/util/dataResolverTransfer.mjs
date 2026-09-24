// extensions/cms/util/dataResolverTransfer.mjs
//
// Makes resolved data safe to be sent between the api thread and a
// dataResolver worker (structured clone). Structured clone keeps plain
// objects, arrays, Date, RegExp, Map, Set, typed arrays and primitives, but
// drops prototypes: a mongodb ObjectId would arrive as a plain object and
// serialize differently afterwards. ObjectIds are therefore encoded as a
// marker and revived on the other side. Values that cannot be transferred
// without changing them (functions, Buffers, other class instances) throw
// UnsupportedTransferError - the caller then falls back to the api thread.

import {ObjectId} from 'mongodb'

const OID_MARKER = '__lunucObjectId'

export class UnsupportedTransferError extends Error {}

const isObjectId = (v) => v instanceof ObjectId || v._bsontype === 'ObjectId'

const describe = (v) => (v && v.constructor && v.constructor.name) || typeof v

// returns true if the value contains an ObjectId, throws if it contains
// something structured clone would change
const scan = (v, seen) => {
    const t = typeof v
    if (t === 'function' || t === 'symbol') {
        throw new UnsupportedTransferError(`value of type ${t} can not be transferred`)
    }
    if (t !== 'object' || v === null) {
        return false
    }
    if (seen.has(v)) {
        return false
    }
    seen.add(v)

    if (Array.isArray(v)) {
        let found = false
        for (let i = 0; i < v.length; i++) {
            if (scan(v[i], seen)) found = true
        }
        return found
    }
    const proto = Object.getPrototypeOf(v)
    if (proto === Object.prototype || proto === null) {
        let found = false
        for (const k in v) {
            if (Object.prototype.hasOwnProperty.call(v, k) && scan(v[k], seen)) found = true
        }
        return found
    }
    if (isObjectId(v)) {
        return true
    }
    if (v instanceof Date || v instanceof RegExp) {
        return false
    }
    if (v instanceof Map) {
        let found = false
        for (const [k, val] of v) {
            if (scan(k, seen) || scan(val, seen)) found = true
        }
        return found
    }
    if (v instanceof Set) {
        let found = false
        for (const val of v) {
            if (scan(val, seen)) found = true
        }
        return found
    }
    if (ArrayBuffer.isView(v) && !(typeof Buffer !== 'undefined' && Buffer.isBuffer(v))) {
        return false
    }
    throw new UnsupportedTransferError(`value of type ${describe(v)} can not be transferred`)
}

// deep copy that replaces ObjectIds by a marker (shared references are kept)
const encodeCopy = (v, memo) => {
    if (typeof v !== 'object' || v === null) {
        return v
    }
    if (memo.has(v)) {
        return memo.get(v)
    }
    if (isObjectId(v)) {
        return {[OID_MARKER]: v.toHexString()}
    }
    if (Array.isArray(v)) {
        const out = new Array(v.length)
        memo.set(v, out)
        for (let i = 0; i < v.length; i++) {
            out[i] = encodeCopy(v[i], memo)
        }
        return out
    }
    const proto = Object.getPrototypeOf(v)
    if (proto === Object.prototype || proto === null) {
        const out = proto === null ? Object.create(null) : {}
        memo.set(v, out)
        for (const k in v) {
            if (Object.prototype.hasOwnProperty.call(v, k)) {
                out[k] = encodeCopy(v[k], memo)
            }
        }
        return out
    }
    if (v instanceof Map) {
        const out = new Map()
        memo.set(v, out)
        for (const [k, val] of v) {
            out.set(encodeCopy(k, memo), encodeCopy(val, memo))
        }
        return out
    }
    if (v instanceof Set) {
        const out = new Set()
        memo.set(v, out)
        for (const val of v) {
            out.add(encodeCopy(val, memo))
        }
        return out
    }
    // Date, RegExp, typed arrays: structured clone handles them
    return v
}

/**
 * Returns {value, hasObjectIds}. value is the original (if it contains no
 * ObjectId) or an encoded copy. Throws UnsupportedTransferError.
 */
export const prepareForTransfer = (value) => {
    const hasObjectIds = scan(value, new Set())
    return {value: hasObjectIds ? encodeCopy(value, new Map()) : value, hasObjectIds}
}

// revives encoded ObjectIds in place (the value is a fresh structured clone)
export const reviveTransfer = (v, seen = new Set()) => {
    if (typeof v !== 'object' || v === null || seen.has(v)) {
        return v
    }
    seen.add(v)
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            v[i] = reviveTransfer(v[i], seen)
        }
        return v
    }
    if (v instanceof Map) {
        const entries = [...v]
        v.clear()
        for (const [k, val] of entries) {
            v.set(reviveTransfer(k, seen), reviveTransfer(val, seen))
        }
        return v
    }
    if (v instanceof Set) {
        const values = [...v]
        v.clear()
        for (const val of values) {
            v.add(reviveTransfer(val, seen))
        }
        return v
    }
    const proto = Object.getPrototypeOf(v)
    if (proto !== Object.prototype && proto !== null) {
        return v
    }
    const keys = Object.keys(v)
    if (keys.length === 1 && keys[0] === OID_MARKER && typeof v[OID_MARKER] === 'string') {
        return new ObjectId(v[OID_MARKER])
    }
    for (const k of keys) {
        v[k] = reviveTransfer(v[k], seen)
    }
    return v
}
