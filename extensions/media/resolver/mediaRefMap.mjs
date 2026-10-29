import Cache from '../../../util/cache.mjs'
import Hook from '../../../util/hook.cjs'
import {ObjectId} from 'mongodb'


const REF_MAP_CACHE_KEY = 'allCollectionRefMap'
const REF_MAP_TTL = 1000 * 60 * 60 * 24 // 1 day

// keys in the map that are not reference ids
const META_KEYS = ['collectionsToSearchIn', 'docIndex']

// matches 24-char hex ids, also when embedded in longer strings (e.g. urls, html, json),
// but not as a substring of a longer hex sequence (e.g. md5/sha hashes)
const ID_REGEX_PATTERN = /(?<![a-f0-9])[a-f0-9]{24}(?![a-f0-9])/gi

// resolves a human readable name per collection
const PRETTY_NAME_RESOLVERS = {
    CmsPage: doc => doc.slug,
    User: doc => doc.username
}

// ---- GenericData: human readable name + link info derived from the GenericDataDefinition ----

// definition _id -> {name, title, fieldNames} (null = definition not found)
const definitionCache = new Map()

const NAME_FIELD_CANDIDATES = ['name', 'title', 'titel', 'bezeichnung', 'label']
const MAX_NAME_LENGTH = 120

const toDefinitionInfo = def => {
    let structure = def.structure
    if (typeof structure === 'string') {
        try {
            structure = JSON.parse(structure)
        } catch (e) {
            structure = {}
        }
    }
    return {
        name: def.name,
        title: structure?.title || def.name,
        fieldNames: (structure?.fields || []).map(f => f && f.name).filter(Boolean)
    }
}

const loadAllDefinitions = async (db) => {
    definitionCache.clear()
    const defs = await db.collection('GenericDataDefinition').find({}).toArray()
    for (const def of defs) {
        definitionCache.set(def._id.toString(), toDefinitionInfo(def))
    }
}

// makes sure the definition of a GenericData doc is in the cache
const ensureDefinition = async (db, collectionName, doc) => {
    if (collectionName !== 'GenericData' || !doc || !doc.definition || !db) return
    const key = doc.definition.toString()
    if (definitionCache.has(key)) return
    const def = await db.collection('GenericDataDefinition').findOne({_id: new ObjectId(key)})
    definitionCache.set(key, def ? toDefinitionInfo(def) : null)
}

const isUsableName = v => typeof v === 'string' && v.trim() !== '' && v.length <= MAX_NAME_LENGTH &&
    !/^[a-f0-9]{24}$/i.test(v.trim()) && !/<[a-z][\s\S]*>/i.test(v)

// localized values like {de: '...', en: '...'} -> take first string
const firstString = v => {
    if (v && typeof v === 'object' && !Array.isArray(v) && v._bsontype === undefined) {
        v = Object.values(v).find(x => typeof x === 'string' && x)
    }
    return isUsableName(v) ? v.trim() : undefined
}

// name candidates first (name, title, ...), then the first usable text field in the order of the definition
const getGenericDataName = (doc, info) => {
    let data = doc.data
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data)
        } catch (e) {
            return undefined
        }
    }
    if (!data || typeof data !== 'object') return undefined

    const fieldNames = info ? info.fieldNames : []
    const ordered = [
        ...NAME_FIELD_CANDIDATES.filter(c => !info || fieldNames.includes(c)),
        ...fieldNames,
        ...(info ? [] : Object.keys(data))
    ]
    for (const key of ordered) {
        const name = firstString(data[key])
        if (name) return name
    }
    return undefined
}

const getPrettyName = (collectionName, doc, definitionInfo) => {
    if (collectionName === 'GenericData') {
        return getGenericDataName(doc, definitionInfo)
    }

    const resolver = PRETTY_NAME_RESOLVERS[collectionName]
    let name = resolver ? resolver(doc) : undefined

    // generic fallback for other collections
    if (!name) {
        name = doc.name || doc.title
    }

    // localized values like {de: '...', en: '...'} -> take first entry
    if (name && typeof name === 'object') {
        name = Object.values(name).find(v => typeof v === 'string' && v)
    }

    return typeof name === 'string' ? name : undefined
}

Hook.on(['typeUpdated', 'typeCreated', 'typeDeleted'], async ({data, type, db}, name) => {
    if (type === 'GenericDataDefinition') {
        // definition changed (name/title/fields) -> reload lazily
        definitionCache.clear()
        return
    }

    const refMap = Cache.get(REF_MAP_CACHE_KEY)
    if (!refMap || !refMap.collectionsToSearchIn) {
        // no cache -> nothing to update
        return
    }

    const collectionName = type
    const payload = data

    if (!collectionName || !payload) {
        // not enough info for an incremental update -> invalidate cache as fallback
        console.log('Ref map: insufficient hook data, invalidating cache', name)
        Cache.remove(REF_MAP_CACHE_KEY)
        return
    }

    if (!refMap.collectionsToSearchIn.includes(collectionName)) {
        // collection is not part of the ref map -> ignore
        return
    }

    const docs = Array.isArray(payload) ? payload : [payload]

    // collect all refIds affected by this change (old and new references)
    const affectedRefIds = new Set()

    for (const doc of docs) {
        const docId = doc && doc._id ? doc._id.toString() : (typeof doc === 'string' ? doc : null)
        if (!docId) {
            console.log('Ref map: document without _id, invalidating cache', name)
            Cache.remove(REF_MAP_CACHE_KEY)
            return
        }

        if (name === 'typeUpdated' || name === 'typeDeleted') {
            // old references before removal
            const oldRefIds = refMap.docIndex[`${collectionName}:${docId}`]
            if (oldRefIds) {
                oldRefIds.forEach(id => affectedRefIds.add(id))
            }
            removeDocFromRefMap(refMap, collectionName, docId)
        }

        if (name === 'typeCreated' || name === 'typeUpdated') {
            if (typeof doc === 'object') {
                await ensureDefinition(db, collectionName, doc)
                addDocToRefMap(refMap, collectionName, doc)
                // new references after adding
                const newRefIds = refMap.docIndex[`${collectionName}:${docId}`]
                if (newRefIds) {
                    newRefIds.forEach(id => affectedRefIds.add(id))
                }
            } else {
                // only got an id but no document data -> can't extract refs
                console.log('Ref map: no document data for update, invalidating cache', name)
                Cache.remove(REF_MAP_CACHE_KEY)
                return
            }
        }
    }

    // refresh cache entry (also bumps TTL)
    Cache.set(REF_MAP_CACHE_KEY, refMap, REF_MAP_TTL)
    console.log(`Ref map updated incrementally (${name}, ${collectionName}, ${docs.length} doc(s))`)

    // update reference info on affected media documents
    if (db && affectedRefIds.size > 0) {
        checkRefForMedias([...affectedRefIds], refMap, db)
        console.log(`Ref map: reference info updated for ${affectedRefIds.size} affected id(s)`)
    }
})


export const checkRefForMedias = (ids, refMap, db) => {
    const checkedItems = {}

    for (const _id of ids) {
        const collectionsWithRef = refMap[_id] || []

        const $set = {
            references: {
                count: collectionsWithRef.length,
                locations: collectionsWithRef,
                lastChecked: new Date().getTime()
            }
        }
        checkedItems[_id] = $set
        db.collection('Media').updateOne({_id: new ObjectId(_id)}, {$set})
    }
    return checkedItems;
}

export const getRefMap = async (db, collectionsToSearchIn) => {

    // load from cache or rebuild
    let refMap = Cache.get(REF_MAP_CACHE_KEY)
    if (!refMap) {
        refMap = await buildRefMap(db, collectionsToSearchIn)
    }

    return refMap
}


const extractIds = (obj, results = new Set()) => {
    if (!obj || typeof obj !== 'object') return results
    for (const val of Object.values(obj)) {
        if (!val) continue
        if (typeof val === 'string') {
            // matchAll finds every id in the string, not just exact matches
            for (const match of val.matchAll(ID_REGEX_PATTERN)) {
                results.add(match[0].toLowerCase())
            }
        } else if (val._bsontype === 'ObjectId') {
            results.add(val.toString())
        } else if (typeof val === 'object') {
            extractIds(val, results)
        }
    }
    return results
}

// adds all references of a single document to the map and the reverse index
const addDocToRefMap = (refMap, collectionName, doc) => {
    const docId = doc._id.toString()
    const foundIds = extractIds(doc)
    foundIds.delete(docId)

    const definitionInfo = collectionName === 'GenericData' && doc.definition
        ? definitionCache.get(doc.definition.toString())
        : undefined
    const prettyName = getPrettyName(collectionName, doc, definitionInfo)

    // reverse index: which refIds does this document point to
    refMap.docIndex[`${collectionName}:${docId}`] = [...foundIds]

    for (const refId of foundIds) {
        if (!refMap[refId]) refMap[refId] = []
        if (!refMap[refId].find(e => e.location === collectionName && e._id === docId)) {
            const entry = {location: collectionName, _id: docId}
            if (prettyName) {
                entry.name = prettyName
            }
            if (definitionInfo) {
                // needed to build the link to the right GenericData list in the admin
                entry.meta = definitionInfo.name
                entry.title = definitionInfo.title
            }
            refMap[refId].push(entry)
        }
    }
}

// removes all entries of a single document using the reverse index
const removeDocFromRefMap = (refMap, collectionName, docId) => {
    const indexKey = `${collectionName}:${docId}`
    const refIds = refMap.docIndex[indexKey]
    if (!refIds) return

    for (const refId of refIds) {
        const entries = refMap[refId]
        if (!entries) continue
        const filtered = entries.filter(e => !(e.location === collectionName && e._id === docId))
        if (filtered.length > 0) {
            refMap[refId] = filtered
        } else {
            delete refMap[refId]
        }
    }
    delete refMap.docIndex[indexKey]
}

const buildRefMap = async (db, collectionsToSearchIn) => {
    console.log('Building ref map cache...')
    const startTime = new Date().getTime()
    const map = {docIndex: {}}

    await loadAllDefinitions(db)

    for (const name of collectionsToSearchIn) {
        console.log(`Scanning ${name}...`)
        const fullCursor = db.collection(name).find({})
        for await (const doc of fullCursor) {
            addDocToRefMap(map, name, doc)
        }
    }
    map.collectionsToSearchIn = collectionsToSearchIn
    Cache.set(REF_MAP_CACHE_KEY, map, REF_MAP_TTL)
    console.log(`Ref map built in ${new Date().getTime() - startTime}ms, ${Object.keys(map).length - META_KEYS.length} unique IDs indexed`)
    return map
}