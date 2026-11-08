/*
 Views of a type for external systems, defined in the scope of an api token (see apis/genericdata):

   "<name>": {
     "type": "User",                                     collection
     "match": {"domain": "pokerhelden", "meta.newsletterConsent.status": {"$exists": true}},   always applied
     "fields": {"playerId": ["meta.virtualId", "_id"], "email": "email", ...},          output name -> path
                                                         (array: first value that is set)
     "dateFields": ["consentAt"],                        output fields stored as ms, returned as ISO
     "updatedField": "modifiedAt",                       change timestamp (sync + paging), default modifiedAt
     "upsert": {...}                                     see checkUpsertBody
   }

 Only the listed fields are ever read or returned, so a view can expose a part of a sensitive
 collection like User. Shared by the genericdata api and webhook.mjs.
 */
import {ObjectId} from 'mongodb'
import {toIso} from './flatRecord.mjs'

// --- cursor (keyset over updatedField,_id) ---------------------------------------
export const encodeCursor = (updated, id) => Buffer.from(JSON.stringify({m: updated || 0, i: id.toString()})).toString('base64url')
export const decodeCursor = (cursor) => {
    try {
        const c = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        if (typeof c.m === 'number' && ObjectId.isValid(c.i)) return c
    } catch (e) {
    }
    return null
}
export const cursorMatch = (field, cursor) => ({
    $or: [{[field]: {$gt: cursor.m}}, {[field]: cursor.m, _id: {$gt: new ObjectId(cursor.i)}}]
})

// --- compile ---------------------------------------------------------------------
// path segments up to the first array index - projections can't address array elements
const projectionPath = (path) => {
    const parts = path.split('.')
    const i = parts.findIndex(p => /^\d+$/.test(p))
    return (i < 0 ? parts : parts.slice(0, i)).join('.')
}

const compiledCache = new WeakMap()
export const compileView = (view) => {
    let cv = compiledCache.get(view)
    if (cv) return cv
    const updatedField = view.updatedField || 'modifiedAt'
    const fields = Object.keys(view.fields || {}).map(out => {
        const paths = [].concat(view.fields[out])
        return {out, paths, segments: paths.map(p => p.split('.'))}
    })
    const byOut = {}
    fields.forEach(f => byOut[f.out] = f)

    // projection without paths that collide (a.b and a.b.c -> a.b)
    const all = [...new Set([updatedField, ...fields.flatMap(f => f.paths.map(projectionPath))])].sort()
    const projection = {_id: 1}
    all.forEach((p, i) => {
        if (p !== '_id' && !all.some((q, j) => j !== i && p.startsWith(q + '.'))) projection[p] = 1
    })

    cv = {view, type: view.type, updatedField, fields, byOut, dateFields: new Set(view.dateFields || []), projection, match: view.match || {}}
    compiledCache.set(view, cv)
    return cv
}

// --- read ------------------------------------------------------------------------
const valueAt = (doc, segments) => {
    let v = doc
    for (let i = 0; i < segments.length && v !== undefined && v !== null; i++) v = v[segments[i]]
    return v
}
const firstValue = (doc, field) => {
    for (const seg of field.segments) {
        const v = valueAt(doc, seg)
        if (v !== undefined && v !== null && v !== '') return v
    }
    return null
}

export const toViewRecord = (doc, cv) => {
    const record = {_id: doc._id.toString()}
    for (const f of cv.fields) {
        const v = firstValue(doc, f)
        record[f.out] = cv.dateFields.has(f.out) ? toIso(v) : (v instanceof ObjectId ? v.toString() : v)
    }
    record.updatedAt = toIso(valueAt(doc, cv.updatedField.split('.')))
    return record
}

// "status==subscribed && source==login" on output names of the view (values compared as strings)
export const parseViewFilter = (cv, filter) => {
    if (!filter) return null
    const and = []
    for (const part of String(filter).split('&&')) {
        const m = part.trim().match(/^([\w]+)\s*==\s*(.*)$/)
        const f = m && cv.byOut[m[1]]
        if (!f) throw new Error(`invalid filter ${part.trim()}`)
        const value = m[2].trim() === 'null' ? null : m[2].trim()
        and.push({[f.paths[0]]: value})
    }
    return and
}

/**
 * Records changed since `since` (ms) and after `cursor`, ordered by the change timestamp.
 * Uses an index on {<match fields>, updatedField, _id} when there is one.
 */
export const findViewRecords = async ({db, cv, since, cursor, filter, limit}) => {
    const and = [cv.match]
    if (since !== null && since !== undefined) and.push({[cv.updatedField]: {$gte: since}})
    if (cursor) and.push(cursorMatch(cv.updatedField, cursor))
    const filterAnd = parseViewFilter(cv, filter)
    if (filterAnd) and.push(...filterAnd)

    const docs = await db.collection(cv.type).find({$and: and}, {projection: cv.projection})
        .sort({[cv.updatedField]: 1, _id: 1}).limit(limit + 1).toArray()

    let nextCursor = null
    if (docs.length > limit) {
        docs.length = limit
        const last = docs[limit - 1]
        nextCursor = encodeCursor(valueAt(last, cv.updatedField.split('.')), last._id)
    }
    return {results: docs.map(d => toViewRecord(d, cv)), nextCursor}
}

// --- write -----------------------------------------------------------------------
/**
 * Checks a write of an external system against the upsert config of its scope:
 *  keys: fields an entry may be identified by, fields: fields that may be written,
 *  values: allowed values per field, required: fields that must be sent, set: values always written
 * @returns {error: [httpCode, message]} or {values: fields to write (without keys)}
 */
export const checkUpsertBody = (conf, keys, body, scoped) => {
    if (keys.length === 0 || (scoped && keys.some(k => !(conf.keys || []).includes(k)))) {
        return {error: [400, 'invalid key fields']}
    }
    for (const k of keys) {
        if (body[k] === undefined || body[k] === null || body[k] === '') return {error: [400, `key ${k} is missing`]}
    }
    const values = {}
    for (const k of Object.keys(body)) {
        if (keys.includes(k)) continue
        if (scoped && !(conf.fields || []).includes(k)) return {error: [403, `field ${k} may not be written`]}
        if (conf.values && conf.values[k] && !conf.values[k].includes(body[k])) {
            return {error: [403, `value ${JSON.stringify(body[k])} is not allowed for ${k}`]}
        }
        values[k] = body[k]
    }
    for (const k of (conf.required || [])) {
        if (values[k] === undefined || values[k] === null || values[k] === '') return {error: [400, `field ${k} is required`]}
    }
    Object.assign(values, conf.set || {})
    return {values}
}

// a key value as string and number (ids are stored either way)
export const keyVariants = (v) => {
    const alt = typeof v === 'number' ? String(v) : (/^\d+$/.test(String(v)) ? Number(v) : null)
    return alt === null ? v : {$in: [v, alt]}
}

const setPath = (obj, path, value) => {
    const parts = path.split('.')
    let o = obj
    for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] === undefined || o[parts[i]] === null) o[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {}
        o = o[parts[i]]
    }
    o[parts[parts.length - 1]] = value
}

/**
 * Updates one existing entry of a view (no creation). Only paths of the given output fields are written,
 * nothing is written when the values are already stored.
 * @returns {status: 'updated'|'unchanged', record} or {error: [httpCode, message]}
 */
export const updateViewRecord = async ({db, cv, keys, body, values}) => {
    const and = [cv.match]
    for (const k of keys) {
        const f = cv.byOut[k]
        if (!f) return {error: [400, `unknown key ${k}`]}
        and.push({$or: f.paths.map(p => ({[p]: p === '_id' ? (ObjectId.isValid(String(body[k])) ? new ObjectId(String(body[k])) : null) : keyVariants(body[k])}))})
    }
    const matches = await db.collection(cv.type).find({$and: and}, {projection: cv.projection}).limit(2).toArray()
    if (matches.length === 0) return {error: [404, 'entry not found']}
    if (matches.length > 1) return {error: [409, 'key is not unique']}
    const doc = matches[0]

    const $set = {}
    for (const out of Object.keys(values)) {
        const f = cv.byOut[out]
        if (!f) return {error: [400, `unknown field ${out}`]}
        let v = values[out]
        if (cv.dateFields.has(out) && v !== null && v !== '') {
            v = typeof v === 'number' ? v : Date.parse(v)
            if (isNaN(v)) return {error: [400, `invalid date for field ${out}`]}
        }
        if (firstValue(doc, f) !== v) $set[f.paths[0]] = v
    }
    if (Object.keys($set).length === 0) {
        return {status: 'unchanged', record: toViewRecord(doc, cv)}
    }
    $set[cv.updatedField] = Date.now()
    await db.collection(cv.type).updateOne({_id: doc._id}, {$set})
    Object.keys($set).forEach(p => setPath(doc, p, $set[p]))
    return {status: 'updated', _id: doc._id, record: toViewRecord(doc, cv)}
}
