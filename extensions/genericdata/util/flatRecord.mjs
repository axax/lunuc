/*
 Flat representation of a GenericData entry for external consumers (genericdata api with
 format=flat or cursor paging): {_id, ...data, updatedAt}. Date fields of the structure
 (uitype date/datetime, stored as ms) are returned as ISO 8601 strings, and parsed back
 from ISO strings when external systems write data (fromFlatValues).
 */

const DATE_UITYPES = ['datetime', 'date']
const EMPTY_SET = new Set()

// Derived info per structure object - computed once, not per record (a list maps hundreds of
// records with the same structure). Definitions are cached objects, so the WeakMap hits and
// frees its entry together with the definition.
const structureInfoCache = new WeakMap()
const structureInfo = (structure) => {
    if (!structure || !Array.isArray(structure.fields)) {
        return {dateFields: EMPTY_SET, fieldsByName: {}}
    }
    let info = structureInfoCache.get(structure)
    if (!info) {
        const dateFields = new Set(), fieldsByName = {}
        for (const f of structure.fields) {
            if (!f) continue
            fieldsByName[f.name] = f
            if (DATE_UITYPES.includes(f.uitype)) dateFields.add(f.name)
        }
        info = {dateFields, fieldsByName}
        structureInfoCache.set(structure, info)
    }
    return info
}

export const toIso = (value) => {
    if (value === null || value === undefined || value === '') {
        return null
    }
    const date = new Date(typeof value === 'number' || isNaN(value) ? value : Number(value))
    return isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * @param {object} entry   {_id, data (object or json string), modifiedAt}
 * @param {object} options {structure, fields: optional whitelist of data fields}
 */
export const toFlatRecord = (entry, {structure, fields} = {}) => {
    let data = entry.data
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch (e) {
            data = null
        }
    }
    data = data || {}
    const {dateFields} = structureInfo(structure)
    const record = {_id: entry._id ? entry._id.toString() : null}
    const keys = Array.isArray(fields) && fields.length > 0 ? fields : Object.keys(data)
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i], value = data[key]
        record[key] = dateFields.has(key) ? toIso(value) : (value === undefined ? null : value)
    }
    record.updatedAt = toIso(entry.modifiedAt)
    return record
}

/**
 * Converts values written by an external system: ISO strings in date fields become ms.
 * Throws for invalid dates or values that are not in the enum of a select field.
 */
export const fromFlatValues = (values, structure) => {
    const {dateFields, fieldsByName} = structureInfo(structure)
    const result = {}
    for (const key of Object.keys(values)) {
        let value = values[key]
        if (dateFields.has(key) && value !== null && value !== '') {
            const ms = typeof value === 'number' ? value : Date.parse(value)
            if (isNaN(ms)) {
                throw new Error(`invalid date for field ${key}`)
            }
            value = ms
        }
        const field = fieldsByName[key]
        if (field && Array.isArray(field.enum) && value !== null && value !== undefined) {
            if (!field.enum.some(e => (e && e.constructor === Object ? e.value : e) === value)) {
                throw new Error(`invalid value for field ${key}: allowed are ${field.enum.map(e => e && e.constructor === Object ? e.value : e).join(', ')}`)
            }
        }
        result[key] = value
    }
    return result
}

// loaded lazily (once): keeps this module usable without the api (tests, scripts that only format)
let genericResolver
const getGenericResolver = async () => genericResolver || (genericResolver = (await import('../../../api/resolver/generic/genericResolver.mjs')).default)

/**
 * Writes changed data fields of a GenericData entry (genericdata api, upsert): merges `values` into
 * the stored data and only writes when something actually differs (no write = no modifiedAt change, no hooks).
 * @returns {Promise<{status: 'created'|'updated'|'unchanged', _id, data, modifiedAt}>}
 */
export const mergeGenericData = async ({db, context, def, existing, values, create, skipCheck}) => {
    if (existing) {
        const base = existing.data || {}
        let changed = false
        for (const k in values) {
            if (base[k] !== values[k]) {
                changed = true
                break
            }
        }
        if (!changed) {
            return {status: 'unchanged', _id: existing._id, data: base, modifiedAt: existing.modifiedAt}
        }
        const data = Object.assign({}, base, values)
        const res = await (await getGenericResolver()).updateEntity(db, context, 'GenericData',
            {_id: existing._id.toString(), definition: def._id, data},
            {primaryKey: ['_id', 'definition'], skipCheck})
        return {status: 'updated', _id: existing._id, data, modifiedAt: res.modifiedAt}
    }
    const modifiedAt = Date.now()
    const res = await (await getGenericResolver()).createEntity(db, {context}, 'GenericData',
        Object.assign({definition: def._id, data: values, modifiedAt}, create || {}), {skipCheck})
    return {status: 'created', _id: res._id, data: values, modifiedAt}
}
