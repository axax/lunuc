/**
 * Impex: declarative data import from JSON files (inspired by SAP Commerce ImpEx).
 *
 * A file holds a list of operations that are executed in order:
 *
 *   {
 *     "description": "what this file does",
 *     "allowRemove": false,
 *     "operations": [
 *       {
 *         "mode": "INSERT_UPDATE",              // INSERT | UPDATE | INSERT_UPDATE | REMOVE
 *         "type": "GenericData",                // must be in allowedTypes
 *         "definition": "ThalBereich",          // GenericData only: name of the GenericDataDefinition
 *         "key": ["slug"],                      // fields that identify an existing entry
 *         "replace": ["data"],                  // object fields that are replaced instead of merged
 *         "defaults": {},                       // merged into every item
 *         "stringify": ["value"],               // fields written as JSON string
 *         "mergeArray": {"value": "name"},      // upsert array elements by a property instead of replacing,
 *                                               // an element {"name": "x", "$remove": true} removes it
 *         "multi": true,                        // UPDATE only: update every entry matching the key
 *                                               // (otherwise a key matching several entries is an error),
 *                                               // with "key": [] all entries of the type/definition
 *         "transform": {"$file": "x.js"},       // UPDATE only: js function body, called per entry with
 *                                               // {doc, data, values, item}, returns the fields to write
 *                                               // (GenericData: fields of data) or null to skip the entry
 *         "items": [ { "slug": "finanzen", "name": "Finanzen" } ]
 *       }
 *     ]
 *   }
 *
 * GenericData shorthand: when an item has no "data" property, the whole item is the data
 * object, and keys without "data." / "_id" prefix are relative to data.
 *
 * Special values inside items:
 *   {"$ref": {"slug": "finanzen"}}                         id (string) of an entry, same type/definition
 *   {"$ref": {"type": "GenericData", "definition": "X", "data.slug": "y"}}
 *   {"$ref": [{...}, {...}]}                               array of ids
 *   {"$ref": {...}, "as": "objectId"}                      ObjectId instead of string
 *   {"$file": "scripts/foo.js"}                            text content of a file (relative to the impex file)
 *   {"$json": {...}}                                       value stored as JSON string
 *   {"$oid": "..."} / {"$date": "..."}                     mongo extended json
 *
 * Media items: "$uploadFile": "files/x.jpg" (relative to the impex file) or "$uploadBase64": "<base64>"
 * (content inside the impex) is written into the upload folder under the _id of the entry
 * (key ["_id"] with {"$oid": ...} keeps the _id of the source system).
 *
 * Objects (e.g. data, structure) are merged into the existing value on update, only the given
 * properties change. List a field in "replace" to overwrite it completely.
 *
 * Writes go through GenericResolver, so access checks, hooks (typeCreated_..., typeUpdated_...)
 * and cache invalidation work exactly as when an entry is saved in the admin.
 */
import fs from 'fs'
import path from 'path'
import {ObjectId} from 'mongodb'

export const IMPEX_MODES = ['INSERT', 'UPDATE', 'INSERT_UPDATE', 'REMOVE']
export const DEFAULT_ALLOWED_TYPES = ['GenericDataDefinition', 'GenericData', 'CronJob', 'Hook', 'Api', 'KeyValue', 'KeyValueGlobal', 'Media']

const isPlainObject = v => v !== null && typeof v === 'object' && v.constructor === Object

const isObjectId = v => v && (v instanceof ObjectId || v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID')

export const getPath = (obj, p) => p.split('.').reduce((o, k) => (o === null || o === undefined) ? undefined : o[k], obj)

/**
 * normalizes a value for comparison: ObjectIds become strings, dates iso strings
 */
export const normalize = (value) => {
    if (value === null || value === undefined) return null
    if (isObjectId(value)) return value.toString()
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.map(normalize)
    if (typeof value === 'object') {
        if (value._id && Object.keys(value).length === 1) return normalize(value._id)
        const result = {}
        Object.keys(value).sort().forEach(k => {
            if (value[k] !== undefined) result[k] = normalize(value[k])
        })
        return result
    }
    return value
}

export const isEqual = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))

/**
 * list of changed fields when `values` is written onto `doc` (objects merge unless replaced)
 */
export const diffValues = (doc, values, replace = []) => {
    const changes = []
    Object.keys(values).forEach(field => {
        const value = values[field]
        const current = doc ? doc[field] : undefined
        if (isPlainObject(value) && replace.indexOf(field) < 0) {
            Object.keys(value).forEach(sub => {
                const cur = isPlainObject(current) ? current[sub] : undefined
                if (!isEqual(cur, value[sub])) {
                    changes.push(`${field}.${sub}`)
                }
            })
        } else if (!isEqual(current, value)) {
            changes.push(field)
        }
    })
    return changes
}

const DATA_PREFIXED = k => k === '_id' || k === 'definition' || k.startsWith('data.')

/**
 * runs all impex files of `dir` (alphabetical order) or a single `file`
 *
 * options:
 *   db, context            as in cronjobs (this.db, this.context)
 *   dir                    folder with the pending *.json files
 *   file                   optional, only this file (name inside dir)
 *   dryRun                 nothing is written, the log shows what would happen
 *   doneDir                successfully imported files are moved here (not in dry run)
 *   allowedTypes           whitelist of types
 *   resolver, cache        injectable for tests (default GenericResolver / util/cache)
 *   log                    function(line)
 */
export const runImpex = async ({db, context, dir, file, dryRun = false, doneDir, allowedTypes = DEFAULT_ALLOWED_TYPES, resolver, cache, uploadDir, log = console.log}) => {
    if (!resolver) {
        resolver = (await import('../resolver/generic/genericResolver.mjs')).default
    }
    if (cache === undefined) {
        cache = (await import('../../util/cache.mjs')).default
    }
    const root = path.resolve(dir)
    if (!fs.existsSync(root)) {
        throw new Error(`${root} does not exist`)
    }
    const files = (file ? [file] : fs.readdirSync(root).filter(f => f.endsWith('.json')).sort())
    const summary = []
    for (const name of files) {
        const result = await runImpexFile({
            db, context, filePath: path.join(root, name), dryRun, allowedTypes, resolver, cache, uploadDir, log
        })
        summary.push(result)
        if (!dryRun && doneDir && result.errors.length === 0) {
            const target = path.resolve(doneDir)
            fs.mkdirSync(target, {recursive: true})
            fs.renameSync(path.join(root, name), path.join(target, name))
            for (const stale of ['.dryrun.log', '.log']) {
                const staleFile = path.join(root, name.replace(/\.json$/, stale))
                if (fs.existsSync(staleFile)) fs.rmSync(staleFile)
            }
            fs.writeFileSync(path.join(target, name.replace(/\.json$/, '.log')), result.lines.join('\n') + '\n', 'utf8')
        } else {
            fs.writeFileSync(path.join(root, name.replace(/\.json$/, dryRun ? '.dryrun.log' : '.log')), result.lines.join('\n') + '\n', 'utf8')
        }
    }
    return summary
}

export const runImpexFile = async ({db, context, filePath, dryRun = false, allowedTypes = DEFAULT_ALLOWED_TYPES, resolver, cache, uploadDir, log = console.log}) => {
    const name = path.basename(filePath)
    const result = {file: name, created: 0, updated: 0, unchanged: 0, removed: 0, errors: [], lines: []}
    const out = (line) => {
        const l = (dryRun ? '[dry run] ' : '') + line
        result.lines.push(l)
        log(l)
    }
    const fail = (line) => {
        result.errors.push(line)
        out('ERROR ' + line)
    }

    let content
    try {
        content = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
        fail(`${name}: invalid json: ${e.message}`)
        return result
    }
    out(`${name}: ${content.description || ''} (${new Date().toISOString()})`)

    if (!context.lang) {
        context = {...context, lang: 'de'}
    }

    // entries written (or, in a dry run, simulated) in this run, so later $refs find them
    const registry = []
    let fakeId = 0

    const findDefinition = async (defName) => {
        const fromRegistry = registry.find(r => r.type === 'GenericDataDefinition' && r.doc.name === defName)
        if (fromRegistry) return fromRegistry.doc
        return db.collection('GenericDataDefinition').findOne({name: defName})
    }

    const buildMatch = async (type, definitionName, criteria) => {
        const match = {}
        let definitionId
        if (type === 'GenericData') {
            if (!definitionName) throw new Error('GenericData needs a definition')
            const def = await findDefinition(definitionName)
            if (!def) throw new Error(`GenericDataDefinition ${definitionName} not found`)
            definitionId = def._id
            match.definition = def._id
        }
        Object.keys(criteria).forEach(k => {
            let v = criteria[k]
            if (k === '_id' && typeof v === 'string' && ObjectId.isValid(v)) v = new ObjectId(v)
            match[k] = v
        })
        return {match, definitionId}
    }

    const matchesDoc = (doc, match) => Object.keys(match).every(k => isEqual(getPath(doc, k), match[k]))

    const findEntries = async (type, match, all = false) => {
        const fromRegistry = registry.filter(r => r.type === type && matchesDoc(r.doc, match)).map(r => r.doc)
        if (fromRegistry.length) return fromRegistry
        if (Object.values(match).some(v => typeof v === 'string' && v.startsWith('impex-new-'))) return []
        // 2 are enough to detect a key that is not unique; multi updates need all entries
        const cursor = db.collection(type).find(match)
        return (all ? cursor : cursor.limit(2)).toArray()
    }

    const resolveRef = async (ref, op) => {
        const {type = op.type, definition = op.definition, ...criteria} = ref
        const prefixed = {}
        Object.keys(criteria).forEach(k => {
            prefixed[(type === 'GenericData' && !DATA_PREFIXED(k)) ? 'data.' + k : k] = criteria[k]
        })
        const {match} = await buildMatch(type, definition, prefixed)
        const found = await findEntries(type, match)
        if (found.length === 0) throw new Error(`$ref not found: ${JSON.stringify(ref)}`)
        if (found.length > 1) throw new Error(`$ref not unique: ${JSON.stringify(ref)}`)
        return found[0]._id
    }

    const resolveValue = async (value, op) => {
        if (Array.isArray(value)) {
            const arr = []
            for (const v of value) arr.push(await resolveValue(v, op))
            return arr
        }
        if (!isPlainObject(value)) return value
        const keys = Object.keys(value)
        if (keys.length === 1 && keys[0] === '$oid') return new ObjectId(value.$oid)
        if (keys.length === 1 && keys[0] === '$date') return new Date(value.$date)
        if (keys.length === 1 && keys[0] === '$file') {
            return fs.readFileSync(path.resolve(path.dirname(filePath), value.$file), 'utf8')
        }
        if (keys.length === 1 && keys[0] === '$json') {
            return JSON.stringify(await resolveValue(value.$json, op))
        }
        if (value.$ref !== undefined) {
            const asObjectId = value.as === 'objectId'
            const toOut = id => (asObjectId && !String(id).startsWith('impex-new-')) ? new ObjectId(String(id)) : String(id)
            if (Array.isArray(value.$ref)) {
                const ids = []
                for (const r of value.$ref) ids.push(toOut(await resolveRef(r, op)))
                return ids
            }
            return toOut(await resolveRef(value.$ref, op))
        }
        const obj = {}
        for (const k of keys) obj[k] = await resolveValue(value[k], op)
        return obj
    }

    // Media: "$uploadFile" of an item is copied to the upload folder under the _id of the media entry
    // (only when it is not there yet), so a media keeps its _id and the references in contents stay valid
    // upload = {name, path} (file next to the impex) or {name, buffer} (base64 inside the impex)
    const placeUpload = async (upload, id) => {
        if (!upload) return
        const {name} = upload
        const size = upload.buffer ? upload.buffer.length : fs.statSync(upload.path).size
        const dir = uploadDir || (await import('../../gensrc/config.mjs')).default.UPLOAD_DIR_ABSPATH
        const dest = path.join(dir, String(id))
        if (fs.existsSync(dest) && fs.statSync(dest).size === size) {
            out(`  file ${name}: already in the upload folder`)
        } else if (dryRun || String(id).startsWith('impex-new-')) {
            out(`  file ${name}: would be written to the upload folder`)
        } else {
            if (upload.buffer) {
                fs.writeFileSync(dest, upload.buffer)
            } else {
                fs.copyFileSync(upload.path, dest)
            }
            out(`  file ${name}: written to the upload folder`)
        }
    }

    const allowRemove = content.allowRemove === true
    const operations = Array.isArray(content.operations) ? content.operations : []

    for (let opIndex = 0; opIndex < operations.length; opIndex++) {
        const op = operations[opIndex]
        const mode = (op.mode || 'INSERT_UPDATE').toUpperCase()
        const opLabel = `#${opIndex + 1} ${mode} ${op.type}${op.definition ? '(' + op.definition + ')' : ''}`

        if (IMPEX_MODES.indexOf(mode) < 0) {
            fail(`${opLabel}: unknown mode`)
            continue
        }
        if (allowedTypes.indexOf(op.type) < 0) {
            fail(`${opLabel}: type not allowed (allowed: ${allowedTypes.join(', ')})`)
            continue
        }
        if (mode === 'REMOVE' && !allowRemove) {
            fail(`${opLabel}: REMOVE needs "allowRemove": true in the file`)
            continue
        }
        const isGenericData = op.type === 'GenericData'
        const keyFields = [].concat(op.key || (op.type === 'GenericDataDefinition' ? ['name'] : []))
            .map(k => (isGenericData && !DATA_PREFIXED(k)) ? 'data.' + k : k)
        const multiOp = op.multi === true && mode === 'UPDATE'
        if (keyFields.length === 0 && mode !== 'INSERT' && !multiOp) {
            fail(`${opLabel}: "key" is missing`)
            continue
        }
        let transformFn = null
        if (op.transform) {
            if (mode !== 'UPDATE') {
                fail(`${opLabel}: "transform" is only allowed with mode UPDATE`)
                continue
            }
            try {
                const code = typeof op.transform === 'string' ? op.transform :
                    fs.readFileSync(path.resolve(path.dirname(filePath), op.transform.$file), 'utf8')
                transformFn = new Function('input', code)
            } catch (e) {
                fail(`${opLabel}: transform: ${e.message}`)
                continue
            }
        }
        const replace = [].concat(op.replace || [])
        out(`${opLabel}: ${(op.items || []).length} item(s)`)

        const items = op.items || []
        for (let i = 0; i < items.length; i++) {
            let item = items[i]
            if (isGenericData && !('data' in item)) {
                item = {data: item}
            }
            if (op.defaults) {
                const defaults = isGenericData && !('data' in op.defaults) ? {data: op.defaults} : op.defaults
                item = mergeDefaults(defaults, item)
            }
            let label = `${opLabel} item ${i + 1}`
            try {
                let uploadFile = null
                if (item && (item.$uploadFile !== undefined || item.$uploadBase64 !== undefined)) {
                    if (op.type !== 'Media') throw new Error('$uploadFile / $uploadBase64 are only allowed for the type Media')
                    if (item.$uploadBase64 !== undefined) {
                        // file content inside the impex: "$uploadBase64": "<base64>" (a data url prefix is ignored)
                        const b64 = String(item.$uploadBase64).replace(/^data:[^,]*,/, '')
                        uploadFile = {name: item.name || 'file', buffer: Buffer.from(b64, 'base64')}
                        if (uploadFile.buffer.length === 0) throw new Error('$uploadBase64 is empty')
                    } else {
                        const p = path.resolve(path.dirname(filePath), item.$uploadFile)
                        if (!fs.existsSync(p)) throw new Error(`$uploadFile not found: ${item.$uploadFile}`)
                        uploadFile = {name: path.basename(p), path: p}
                    }
                    item = {...item}
                    delete item.$uploadFile
                    delete item.$uploadBase64
                    if (item.size === undefined) item.size = uploadFile.buffer ? uploadFile.buffer.length : fs.statSync(uploadFile.path).size
                }
                const baseValues = await resolveValue(item, op)
                const criteria = {}
                for (const k of keyFields) {
                    const v = getPath(baseValues, k)
                    if (v === undefined) throw new Error(`key ${k} has no value`)
                    criteria[k] = v
                }
                label += ' [' + keyFields.map(k => `${k}=${normalize(criteria[k])}`).join(', ') + ']'

                const {match, definitionId} = await buildMatch(op.type, op.definition, criteria)
                const multi = multiOp
                const existing = (keyFields.length || multi) ? await findEntries(op.type, match, multi) : []
                if (existing.length > 1 && !multi) throw new Error('key is not unique, ' + existing.length + ' entries match')
                const docs = multi && existing.length > 0 ? existing : [existing[0]]
                const baseLabel = label
                for (const doc of docs) {
                const values = {...baseValues}
                if (multi && docs.length > 1) label = baseLabel + ' (' + doc._id + ')'
                if (transformFn && doc) {
                    const fields = await transformFn({doc, data: doc.data || {}, values, item})
                    if (!fields) {
                        result.unchanged++
                        out(`${label}: skipped by transform`)
                        continue
                    }
                    if (isGenericData) {
                        values.data = {...(values.data || {}), ...fields}
                    } else {
                        Object.assign(values, fields)
                    }
                }

                if (mode === 'REMOVE') {
                    if (!doc) {
                        out(`${label}: not found, nothing to remove`)
                        result.unchanged++
                        continue
                    }
                    if (!dryRun) {
                        await resolver.deleteEnity(db, context, op.type, {_id: String(doc._id)})
                    }
                    result.removed++
                    out(`${label}: removed (${doc._id})`)
                    continue
                }

                // arrays that are merged into an existing array by a property (e.g. KeyValueGlobal value)
                const mergeArray = op.mergeArray || {}
                const stringify = [].concat(op.stringify || [])
                for (const field of Object.keys(mergeArray)) {
                    if (!Array.isArray(values[field])) throw new Error(`mergeArray: ${field} must be an array`)
                    const by = mergeArray[field]
                    const current = parseJsonValue(doc ? doc[field] : null)
                    if (current !== null && !Array.isArray(current)) throw new Error(`mergeArray: existing ${field} is not an array`)
                    const merged = current ? [...current] : []
                    values[field].forEach(el => {
                        const idx = merged.findIndex(e => e && el && e[by] === el[by])
                        if (el && el.$remove === true) {
                            // {"name": "x", "$remove": true} removes the element
                            if (idx >= 0) merged.splice(idx, 1)
                        } else if (idx >= 0) merged[idx] = el
                        else merged.push(el)
                    })
                    values[field] = merged
                }
                const encode = (data) => {
                    stringify.forEach(f => {
                        if (data[f] !== undefined && typeof data[f] !== 'string') data[f] = JSON.stringify(data[f])
                    })
                    return data
                }

                if (doc && mode === 'INSERT') throw new Error(`already exists (${doc._id})`)
                if (!doc && mode === 'UPDATE') throw new Error('not found')

                if (!doc) {
                    let created
                    if (!dryRun) {
                        const data = encode({...values})
                        if (isGenericData) data.definition = String(definitionId)
                        created = await resolver.createEntity(db, {context}, op.type, data, {skipCheck: false})
                    }
                    const _id = created && created._id ? created._id : 'impex-new-' + (++fakeId)
                    registry.push({type: op.type, doc: {...values, _id, ...(isGenericData ? {definition: definitionId} : {})}})
                    result.created++
                    out(`${label}: created (${_id})`)
                    await placeUpload(uploadFile, _id)
                } else {
                    const update = {...values}
                    delete update._id
                    const compareDoc = {...doc}
                    stringify.concat(Object.keys(mergeArray)).forEach(f => {
                        compareDoc[f] = parseJsonValue(doc[f])
                    })
                    const changes = diffValues(compareDoc, update, replace)
                    if (changes.length === 0) {
                        result.unchanged++
                        out(`${label}: unchanged`)
                    } else {
                        if (!dryRun && !String(doc._id).startsWith('impex-new-')) {
                            const data = {_id: String(doc._id)}
                            Object.keys(update).forEach(k => {
                                // a json string replaces an object field completely, an object is merged
                                data[k] = (replace.indexOf(k) >= 0 && isPlainObject(update[k])) ? JSON.stringify(update[k]) : update[k]
                            })
                            await resolver.updateEntity(db, context, op.type, encode(data))
                        }
                        result.updated++
                        out(`${label}: updated ${changes.join(', ')}`)
                    }
                    await placeUpload(uploadFile, doc._id)
                    registry.push({type: op.type, doc: mergeForRegistry(doc, update, replace)})
                }
                }
            } catch (e) {
                fail(`${label}: ${e.message}`)
            }
        }
    }

    if (!dryRun && cache) {
        // new definitions may have been cached as "missing"
        cache.clearStartWith('GenericDataDefinition')
    }
    out(`${name}: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.removed} removed, ${result.errors.length} errors`)
    return result
}

const parseJsonValue = v => {
    if (typeof v !== 'string') return v === undefined ? null : v
    return v.trim() ? JSON.parse(v) : null
}

const mergeDefaults = (defaults, item) => {
    const merged = {...defaults}
    Object.keys(item).forEach(k => {
        merged[k] = (isPlainObject(defaults[k]) && isPlainObject(item[k])) ? {...defaults[k], ...item[k]} : item[k]
    })
    return merged
}

const mergeForRegistry = (doc, update, replace) => {
    const merged = {...doc}
    Object.keys(update).forEach(k => {
        merged[k] = (isPlainObject(update[k]) && isPlainObject(doc[k]) && replace.indexOf(k) < 0) ? {...doc[k], ...update[k]} : update[k]
    })
    return merged
}
