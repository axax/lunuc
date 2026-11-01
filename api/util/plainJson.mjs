import {ObjectId} from 'mongodb'

/**
 * bson values -> plain json: ObjectId to {"$oid": "..."}, Date to {"$date": "..."}
 * (same notation as mongo extended json, so it stays readable and lossless)
 */
export const toPlainJson = (value) => {
    if (value === null || value === undefined) {
        return value
    }
    if (value instanceof ObjectId || value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') {
        return {$oid: value.toString()}
    }
    if (value instanceof Date) {
        return {$date: value.toISOString()}
    }
    if (Array.isArray(value)) {
        return value.map(toPlainJson)
    }
    if (typeof value === 'object') {
        const result = {}
        Object.keys(value).forEach(key => {
            result[key] = toPlainJson(value[key])
        })
        return result
    }
    return value
}

/**
 * reverse of toPlainJson
 */
export const fromPlainJson = (value) => {
    if (value === null || value === undefined) {
        return value
    }
    if (Array.isArray(value)) {
        return value.map(fromPlainJson)
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value)
        if (keys.length === 1 && keys[0] === '$oid' && ObjectId.isValid(value.$oid)) {
            return new ObjectId(value.$oid)
        }
        if (keys.length === 1 && keys[0] === '$date') {
            return new Date(value.$date)
        }
        const result = {}
        keys.forEach(key => {
            result[key] = fromPlainJson(value[key])
        })
        return result
    }
    return value
}

/**
 * json text for comparing a value from a file with the value in the database:
 * object keys sorted, object properties that are null, undefined or '' are left out
 * (e.g. a localized name {"en":"x","de":"y","fr":null} equals {"de":"y","en":"x"}).
 * Arrays keep their order.
 */
const normalizeForCompare = (value) => {
    if (Array.isArray(value)) {
        return value.map(normalizeForCompare)
    }
    if (value && typeof value === 'object') {
        const result = {}
        Object.keys(value).sort().forEach(key => {
            const v = value[key]
            if (v !== null && v !== undefined && v !== '') {
                result[key] = normalizeForCompare(v)
            }
        })
        return result
    }
    return value
}

export const stableJson = (value) => JSON.stringify(normalizeForCompare(value))
