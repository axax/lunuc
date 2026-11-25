import {ObjectId} from 'mongodb'
import {createHash} from 'crypto'
import {getType} from '../../../util/types.mjs'
import {getGenericTypeDefinitionWithStructure} from '../../genericdata/util/index.mjs'
import {SEARCH_COLLECTION, isIndexedType, getIndexedTypes, coreTypeConfig, getSettings} from './config.mjs'
import {buildEntries} from './extract.mjs'
import {addWords, syncVocabulary} from './fuzzy.mjs'

const toObjectId = (id) => {
    if (!id) return null
    if (id instanceof ObjectId) return id
    if (id._id) return toObjectId(id._id)
    return ObjectId.isValid(String(id)) ? new ObjectId(String(id)) : null
}
const toObjectIds = (value) => (Array.isArray(value) ? value : (value ? [value] : [])).map(toObjectId).filter(Boolean)
const asArray = (value) => Array.isArray(value) ? value : (value ? [value] : [])
const sha1 = (value) => createHash('sha1').update(JSON.stringify(value)).digest('base64')

// entries with this type store the state of a GenericDataDefinition (hash of what the index depends on)
const DEFINITION_META_TYPE = '_definition'

// which entries and fields of a GenericData type are indexed - null: the type is not indexed
// structure.searchIndex: missing / true = indexed (default), false = not indexed,
// {"title": [...], "fields": [...]} = only these fields (title: weighted higher)
const genericDataConfig = (definition) => {
    const structure = definition && definition.structure
    // types without access rules are not offered by any search (same rule as the search api)
    if (!structure || !structure.access || structure.searchIndex === false) {
        return null
    }
    const searchIndex = structure.searchIndex && structure.searchIndex.constructor === Object ? structure.searchIndex : {}
    // references (to other types or GenericData) and json objects contain no searchable text
    const isPlainField = f => f && f.name && !f.genericType && f.type !== 'Object' && !(f.type && getType(f.type))
    const titleFields = searchIndex.title ? asArray(searchIndex.title) : asArray(structure.pickerField || structure.searchFields || 'name')
    let fieldNames
    if (searchIndex.fields) {
        fieldNames = asArray(searchIndex.fields)
    } else {
        fieldNames = (structure.fields || []).filter(f => f.searchable && isPlainField(f)).map(f => f.name)
        if (fieldNames.length === 0) {
            fieldNames = structure.searchFields ? asArray(structure.searchFields) : titleFields
        }
    }
    const read = structure.access.read
    // like GraphQL: entries of other users are only readable with force (for every user with the role)
    const readRoles = read && read.constructor === Object && read.force ? asArray(read.role || read.capability) : []
    return {titleFields, fieldNames, readRoles}
}

// only the fields the index needs are loaded (CmsPage e.g. without template, script and style)
const BASE_FIELDS = ['_id', 'createdBy', 'ownerGroup', 'modifiedAt']
const documentProjection = (type, settings, genericConf) => {
    let paths
    if (type === 'GenericData') {
        // with the config of the definition only the indexed fields of data, otherwise all of data
        paths = [...BASE_FIELDS, 'definition', ...(genericConf
            ? [...genericConf.titleFields, ...genericConf.fieldNames].map(f => 'data.' + f)
            : ['data'])]
    } else {
        const conf = coreTypeConfig(type)
        if (!conf) return undefined
        const fieldPaths = conf.fieldPaths || {}
        paths = [...BASE_FIELDS, ...[...conf.titleFields, ...conf.fieldNames].map(f => fieldPaths[f] || f), ...(conf.publicField ? [conf.publicField] : [])]
    }
    // a path inside another one (a and a.b) is not allowed in a projection - the shorter one is enough
    const unique = [...new Set(paths.map(String))].sort((a, b) => a.length - b.length)
    const kept = []
    unique.forEach(path => {
        if (!kept.some(k => path.startsWith(k + '.'))) kept.push(path)
    })
    return Object.fromEntries(kept.map(path => [path, 1]))
}

/**
 * (Re)builds the entries of the given documents of one type, removes the entries of documents
 * that are no longer searchable. Entries whose content has not changed (same hash) are not touched
 * at all - rewriting them would rewrite the text index for every word (indexedAt = last written).
 * New words go into the vocabulary of the fuzzy search, allWords (optional Set) collects the words of all entries.
 * Returns {count: entries of the documents, written: entries inserted}
 */
const indexDocuments = async (db, type, docs, settings, now, allWords) => {
    const collection = db.collection(SEARCH_COLLECTION)
    const entriesToWrite = []
    const refs = []
    for (const doc of docs) {
        refs.push(doc._id)
        let conf, source, definition = null, genericType = null, readRoles = []
        if (type === 'GenericData') {
            const def = doc.definition ? await getGenericTypeDefinitionWithStructure(db, {id: doc.definition.toString()}) : null
            conf = genericDataConfig(def)
            if (!conf) continue
            source = doc.data && doc.data.constructor === Object ? doc.data : {}
            definition = def._id
            genericType = def.name
            readRoles = conf.readRoles
        } else {
            conf = coreTypeConfig(type)
            if (!conf) continue
            source = doc
            if (conf.publicField && doc[conf.publicField] === true) {
                readRoles = ['anonymous']
            }
        }
        const entries = buildEntries({
            source,
            titleFields: conf.titleFields,
            fieldNames: conf.fieldNames,
            fieldPaths: conf.fieldPaths,
            maxTextLength: settings.maxTextLength
        })
        for (const entry of entries) {
            const newEntry = {
                type,
                ...(genericType ? {genericType, definition} : {}),
                ref: doc._id,
                ...entry,
                createdBy: toObjectId(doc.createdBy),
                ownerGroup: toObjectIds(doc.ownerGroup),
                readRoles,
                modifiedAt: doc.modifiedAt || null
            }
            newEntry.hash = sha1(newEntry)
            entriesToWrite.push(newEntry)
        }
    }
    if (refs.length === 0) {
        return {count: 0, written: 0}
    }
    const existing = await collection.find({type, ref: {$in: refs}}, {projection: {_id: 1, ref: 1, lang: 1, hash: 1}}).toArray()
    const existingByKey = new Map(existing.map(e => [e.ref.toString() + ':' + e.lang, e]))
    const keep = [], toInsert = []
    for (const entry of entriesToWrite) {
        const key = entry.ref.toString() + ':' + entry.lang
        const old = existingByKey.get(key)
        if (old && old.hash && old.hash === entry.hash) {
            keep.push(old._id)
            existingByKey.delete(key)
        } else {
            toInsert.push({...entry, indexedAt: now})
        }
    }
    // everything else of these documents: changed entries, languages that are gone, documents that are no longer searchable
    await collection.deleteMany({type, ref: {$in: refs}, _id: {$nin: keep}})
    if (toInsert.length > 0) {
        await collection.insertMany(toInsert, {ordered: false})
        await addWords(db, toInsert.flatMap(e => e.words || []))
    }
    if (allWords) {
        entriesToWrite.forEach(e => (e.words || []).forEach(w => allWords.add(w)))
    }
    return {count: entriesToWrite.length, written: toInsert.length}
}

/**
 * Reindexes documents by id (deleted ones lose their entries).
 */
export const reindexByIds = async (db, type, ids) => {
    if (!isIndexedType(type)) return 0
    const objectIds = toObjectIds(ids)
    if (objectIds.length === 0) return 0
    const settings = await getSettings(db)
    const docs = await db.collection(type).find({_id: {$in: objectIds}}, {projection: documentProjection(type, settings)}).toArray()
    const found = new Set(docs.map(d => d._id.toString()))
    const missing = objectIds.filter(id => !found.has(id.toString()))
    if (missing.length > 0) {
        await db.collection(SEARCH_COLLECTION).deleteMany({type, ref: {$in: missing}})
    }
    const {count} = await indexDocuments(db, type, docs, settings, Date.now())
    return count
}

export const removeByIds = async (db, type, ids) => {
    const objectIds = toObjectIds(ids)
    if (objectIds.length > 0) {
        await db.collection(SEARCH_COLLECTION).deleteMany({type, ref: {$in: objectIds}})
    }
}

// what the entries of a GenericData type depend on (see genericDataConfig, indexDocuments)
const definitionHash = (def) => {
    const structure = def && def.structure
    if (!structure) return 'none'
    return sha1({
        name: def.name,
        access: !!structure.access,
        read: (structure.access && structure.access.read) || null,
        pickerField: structure.pickerField || null,
        searchFields: structure.searchFields || null,
        searchIndex: structure.searchIndex === undefined ? true : structure.searchIndex,
        fields: (structure.fields || []).map(f => f && {name: f.name, searchable: !!f.searchable, type: f.type || null, genericType: f.genericType || null})
    })
}

/**
 * Reindexes all entries of a GenericData type after its definition has changed - only if something
 * changed the index depends on (fields, searchable, access, title fields, name), not e.g. for labels.
 * The old entries stay searchable until they are replaced.
 */
export const reindexDefinition = async (db, definitionId, {force = false} = {}) => {
    const id = toObjectId(definitionId)
    if (!id) return 0
    const collection = db.collection(SEARCH_COLLECTION)
    const def = await getGenericTypeDefinitionWithStructure(db, {id: id.toString()})
    const hash = definitionHash(def)
    if (!force) {
        const meta = await collection.findOne({type: DEFINITION_META_TYPE, ref: id}, {projection: {hash: 1}})
        if (meta && meta.hash === hash) {
            return 0
        }
    }
    const total = await rebuild(db, {types: ['GenericData'], match: {definition: id}, removeStale: false})
    // stored after the rebuild: if it fails, the next save tries again
    await collection.updateOne({type: DEFINITION_META_TYPE, ref: id}, {$set: {hash, indexedAt: Date.now()}}, {upsert: true})
    return total
}

/**
 * Builds the index for all (or only recently modified) documents.
 *  - types: subset of the indexed types (default: all types with searchIndex)
 *  - since: only documents with modifiedAt >= since (incremental run)
 *  - match: additional filter on the documents (e.g. {definition: id} for GenericData)
 *  - removeStale: full run only - removes entries whose document no longer exists or is no longer indexed
 */
export const rebuild = async (db, {types = getIndexedTypes(), since, match = {}, removeStale = true, batchSize = 200, log = () => {}} = {}) => {
    const settings = await getSettings(db)
    const start = Date.now()
    const isFullRun = removeStale && !since && Object.keys(match).length === 0
    // full run over all types: afterwards the vocabulary of the fuzzy search contains exactly the indexed words
    const allIndexedTypes = getIndexedTypes()
    const allWords = isFullRun && allIndexedTypes.every(t => types.includes(t)) ? new Set() : null
    let total = 0
    for (const type of types) {
        if (!isIndexedType(type)) continue
        // ids of the indexed documents of a full run, everything else in the index is stale
        const seen = isFullRun ? new Set() : null
        let count = 0, written = 0

        const indexQuery = async (query, projection) => {
            if (since) query.modifiedAt = {$gte: since}
            const cursor = db.collection(type).find(query, {projection})
            let batch = []
            const indexBatch = async () => {
                const result = await indexDocuments(db, type, batch, settings, start, allWords)
                count += result.count
                written += result.written
                batch = []
            }
            for await (const doc of cursor) {
                if (seen) seen.add(doc._id.toString())
                batch.push(doc)
                if (batch.length >= batchSize) {
                    await indexBatch()
                }
            }
            if (batch.length > 0) {
                await indexBatch()
            }
        }

        if (type === 'GenericData') {
            // per definition: only the indexed fields of data are loaded, not indexed types are skipped
            const definitionIds = match.definition
                ? toObjectIds(match.definition)
                : (await db.collection('GenericDataDefinition').find({}, {projection: {_id: 1}}).toArray()).map(d => d._id)
            for (const definitionId of definitionIds) {
                if (!definitionId) continue
                const def = await getGenericTypeDefinitionWithStructure(db, {id: definitionId.toString()})
                const conf = genericDataConfig(def)
                if (!conf) continue
                await indexQuery({...match, definition: toObjectId(definitionId)}, documentProjection(type, settings, conf))
            }
        } else {
            await indexQuery({...match}, documentProjection(type, settings))
        }

        if (seen) {
            const removed = await removeStaleEntries(db, type, seen)
            log(`${type}: ${removed} stale entries removed`)
        }
        log(`${type}: ${count} entries (${written} new or changed)`)
        total += count
    }
    if (allWords) {
        const vocabulary = await syncVocabulary(db, allWords)
        log(`vocabulary: ${vocabulary.total} words (${vocabulary.added} added, ${vocabulary.removed} removed)`)
    }
    return total
}

// removes the entries of a type whose document was not indexed by the full run (deleted or no longer indexed)
const removeStaleEntries = async (db, type, seen) => {
    const collection = db.collection(SEARCH_COLLECTION)
    const cursor = collection.find({type}, {projection: {_id: 1, ref: 1}})
    let stale = [], removed = 0
    const removeBatch = async () => {
        const result = await collection.deleteMany({_id: {$in: stale}})
        removed += result.deletedCount
        stale = []
    }
    for await (const entry of cursor) {
        if (!entry.ref || !seen.has(entry.ref.toString())) {
            stale.push(entry._id)
            if (stale.length >= 1000) await removeBatch()
        }
    }
    if (stale.length > 0) await removeBatch()
    return removed
}

// ─── queue: changes are collected and written together, saving a document never waits for the index ───

const queue = new Map() // key type -> Set of ids
const deleteQueue = new Map()
const definitionQueue = new Set()
let flushTimer = null, flushRunning = false
const FLUSH_DELAY_MS = 2000

const scheduleFlush = (db) => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
        flushTimer = null
        flush(db).catch(e => console.error('search: index update failed', e))
    }, FLUSH_DELAY_MS)
}

const addTo = (map, type, ids) => {
    if (!map.has(type)) map.set(type, new Set())
    const set = map.get(type)
    asArray(ids).forEach(id => {
        const objectId = toObjectId(id)
        if (objectId) set.add(objectId.toString())
    })
}

export const queueReindex = (db, type, ids) => {
    if (!isIndexedType(type)) return
    addTo(queue, type, ids)
    scheduleFlush(db)
}

export const queueRemove = (db, type, ids) => {
    if (!isIndexedType(type)) return
    addTo(deleteQueue, type, ids)
    scheduleFlush(db)
}

export const queueDefinition = (db, definitionId) => {
    const id = toObjectId(definitionId)
    if (!id) return
    definitionQueue.add(id.toString())
    scheduleFlush(db)
}

const flush = async (db) => {
    if (flushRunning) {
        // a flush is still running: try again later
        scheduleFlush(db)
        return
    }
    flushRunning = true
    try {
        for (const [type, ids] of [...deleteQueue]) {
            deleteQueue.delete(type)
            await removeByIds(db, type, [...ids])
        }
        for (const [type, ids] of [...queue]) {
            queue.delete(type)
            const list = [...ids]
            for (let i = 0; i < list.length; i += 200) {
                await reindexByIds(db, type, list.slice(i, i + 200))
            }
        }
        for (const id of [...definitionQueue]) {
            definitionQueue.delete(id)
            await reindexDefinition(db, id)
        }
    } finally {
        flushRunning = false
    }
}
