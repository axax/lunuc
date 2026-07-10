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
    User: doc => doc.username,
    GenericData: doc => doc.data && doc.data.name
}

const getPrettyName = (collectionName, doc) => {
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

Hook.on(['typeUpdated', 'typeCreated', 'typeDeleted'], ({data, type, db}, name) => {
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

    const prettyName = getPrettyName(collectionName, doc)

    // reverse index: which refIds does this document point to
    refMap.docIndex[`${collectionName}:${docId}`] = [...foundIds]

    for (const refId of foundIds) {
        if (!refMap[refId]) refMap[refId] = []
        if (!refMap[refId].find(e => e.location === collectionName && e._id === docId)) {
            const entry = {location: collectionName, _id: docId}
            if (prettyName) {
                entry.name = prettyName
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