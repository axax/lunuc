import Hook from '../../../util/hook.cjs'
import {ObjectId} from 'mongodb'

/*
 Where is a media used? The collection MediaReference (type in ../build.json) has one entry per media
 and referencing document: {mediaId, location (collection), docId, name, meta, title}.

 - built once by scanning all relevant collections (in the background, into a temp collection that
   replaces the old one at the end), rebuilt when older than REBUILD_AFTER
 - kept up to date incrementally with every create/update/delete through the generic resolver
 - indexed, survives restarts and is shared by all processes (before: an in-memory map per process,
   rebuilt by a full scan after every restart)
 Media.references.count/locations is updated for the media whose references changed.
 */

export const MEDIA_REFERENCE_COLLECTION = 'MediaReference'
const BUILD_COLLECTION = 'MediaReference_build'
const BUILT_AT_KEY = 'MediaReferenceBuiltAt'
const REBUILD_AFTER = 1000 * 60 * 60 * 24 // 1 day: catches changes made directly in the db
const BATCH_SIZE = 1000

// matches 24-char hex ids, also when embedded in longer strings (e.g. urls, html, json),
// but not as a substring of a longer hex sequence (e.g. md5/sha hashes)
const ID_REGEX_PATTERN = /(?<![a-f0-9])[a-f0-9]{24}(?![a-f0-9])/gi

// resolves a human readable name per collection
const PRETTY_NAME_RESOLVERS = {
    CmsPage: doc => doc.slug,
    User: doc => doc.username,
    KeyValue: doc => doc.key
}

// collections that are never searched for references (big or irrelevant)
const IGNORE_COLLECTIONS = ['system.profile', 'OAuthCode', 'OAuthClient', 'NewsletterMailing', 'MediaConversion', 'UserTracking',
    'TelegramCommand', 'GenericDataDefinition', 'History', 'Comment', 'Bot',
    'BotConversation', 'Media', 'UserRole', 'NewsletterSubscriber', 'CrmAddress',
    'Log', 'Word', 'Post', 'MailClient', 'MailTracking', 'NewsletterList',
    'PreProcessor', 'MediaGroup', 'NewsletterSent', 'Rating', 'StaticFile', 'Chat',
    'MailClientArchive', 'WordCategory', 'DnsHost', 'NewsletterTracking', 'TelegramBot',
    'Product', 'CronJobExecution', 'ProductCategory', 'KeyValueGlobal', 'FtpUser',
    'UserGroup', 'UserRestriction', 'UserSetting', 'SmsLog', 'MailAccountMessage',
    'MailAccount', 'MailAccounts', 'MailAccountFolder', 'DnsHostGroup', 'ProxyUser',
    'WebAuthnCredential', 'ChatMessage', MEDIA_REFERENCE_COLLECTION,
    // the search index contains every media (it is built from them), that is not a usage
    'SearchIndex']

// versioned collections (CmsPage_xxx) and system collections are not searched
const isSearchedCollection = name => !!name && name.indexOf('-') < 0 && name.indexOf('_') < 0 &&
    !name.startsWith('system.') && !IGNORE_COLLECTIONS.includes(name)

// KeyValue keys that are only ui state (e.g. the last selection in a type list), not a usage.
// Documents of these keys are not indexed at all.
const IGNORED_KEYVALUE_KEYS = new Set(['TypesContainerSettings'])
const isIgnoredDoc = (collectionName, doc) => collectionName === 'KeyValue' && IGNORED_KEYVALUE_KEYS.has(doc.key)
// entries written before a collection/key was ignored (removed by the next rebuild)
const isRealReference = entry => !IGNORE_COLLECTIONS.includes(entry.location) &&
    !(entry.location === 'KeyValue' && IGNORED_KEYVALUE_KEYS.has(entry.name))

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

// all ids in a document (strings and ObjectIds, recursively)
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

// the reference entries of one document (one per id it contains)
const referencesOfDoc = (collectionName, doc) => {
    if (isIgnoredDoc(collectionName, doc)) return []
    const docId = doc._id.toString()
    const ids = extractIds(doc)
    ids.delete(docId)
    if (!ids.size) return []

    const definitionInfo = collectionName === 'GenericData' && doc.definition
        ? definitionCache.get(doc.definition.toString())
        : undefined
    const base = {location: collectionName, docId}
    const name = getPrettyName(collectionName, doc, definitionInfo)
    if (name) base.name = name
    if (definitionInfo) {
        // needed to build the link to the right GenericData list in the admin
        base.meta = definitionInfo.name
        base.title = definitionInfo.title
    }
    return [...ids].map(mediaId => ({mediaId, ...base}))
}


// ─── build ────────────────────────────────────────────────────────────────────

let building = null       // promise of the running build
let pendingChanges = null // documents changed while a build runs: applied again after it

const getBuiltAt = async (db) => {
    const entry = await db.collection('KeyValueGlobal').findOne({key: BUILT_AT_KEY}, {projection: {value: 1}})
    return entry ? entry.value : 0
}

const buildReferences = async (db) => {
    const startTime = Date.now()
    console.log('MediaReference: building...')
    pendingChanges = new Map()
    await loadAllDefinitions(db)

    const target = db.collection(BUILD_COLLECTION)
    await target.drop().catch(() => {})

    const collections = (await db.listCollections({}, {nameOnly: true}).toArray()).map(c => c.name).filter(isSearchedCollection)
    let batch = [], count = 0
    for (const name of collections) {
        for await (const doc of db.collection(name).find({})) {
            for (const ref of referencesOfDoc(name, doc)) {
                batch.push(ref)
                if (batch.length >= BATCH_SIZE) {
                    await target.insertMany(batch, {ordered: false})
                    count += batch.length
                    batch = []
                }
            }
        }
    }
    if (batch.length) {
        await target.insertMany(batch, {ordered: false})
        count += batch.length
    }
    // indexes before the switch, so queries are fast right away (also declared in build.json)
    await target.createIndex({mediaId: 1})
    await target.createIndex({location: 1, docId: 1})

    if (count) {
        await target.rename(MEDIA_REFERENCE_COLLECTION, {dropTarget: true})
    } else {
        await target.drop().catch(() => {})
        await db.collection(MEDIA_REFERENCE_COLLECTION).deleteMany({})
    }
    await db.collection('KeyValueGlobal').updateOne({key: BUILT_AT_KEY}, {$set: {value: Date.now()}}, {upsert: true})

    // changes during the build went into the old collection: apply them to the new one
    const changes = pendingChanges
    pendingChanges = null
    for (const {collectionName, docId} of changes.values()) {
        await updateReferencesOfDoc(db, collectionName, docId)
    }
    console.log(`MediaReference: ${count} references of ${collections.length} collections built in ${Date.now() - startTime}ms`)
}

// makes sure the references exist: the first build is awaited, an outdated one is rebuilt in the
// background (the existing references are used meanwhile). One build at a time per process.
export const ensureMediaReferences = async (db, {force} = {}) => {
    if (building) {
        if (force || !(await getBuiltAt(db))) await building
        return
    }
    const builtAt = await getBuiltAt(db)
    if (!force && builtAt && Date.now() - builtAt < REBUILD_AFTER) {
        return
    }
    building = buildReferences(db).catch(e => {
        console.error('MediaReference: build failed', e)
        pendingChanges = null
    }).finally(() => {
        building = null
    })
    if (force || !builtAt) {
        await building
    }
}


// ─── incremental updates ──────────────────────────────────────────────────────

// recalculates the entries of one document (null doc = deleted), returns the affected media ids
const updateReferencesOfDoc = async (db, collectionName, docId, deleted) => {
    const collection = db.collection(MEDIA_REFERENCE_COLLECTION)
    const old = await collection.find({location: collectionName, docId}, {projection: {mediaId: 1, name: 1, meta: 1, title: 1}}).toArray()
    const doc = deleted ? null : await db.collection(collectionName).findOne({_id: ObjectId.isValid(docId) ? new ObjectId(docId) : docId})
    if (doc) {
        await ensureDefinition(db, collectionName, doc)
    }
    const refs = doc ? referencesOfDoc(collectionName, doc) : []

    const oldIds = new Set(old.map(r => r.mediaId)), newIds = new Set(refs.map(r => r.mediaId))
    const unchanged = oldIds.size === newIds.size && [...oldIds].every(id => newIds.has(id))
    // nothing changed (same ids, same name): no write - the usual case for an update
    if (unchanged && (!refs.length || old.every(r => r.name === refs[0].name && r.meta === refs[0].meta && r.title === refs[0].title))) {
        return []
    }
    // replace the entries of the document (also when only the name of the document changed)
    await collection.deleteMany({location: collectionName, docId})
    if (refs.length) {
        await collection.insertMany(refs, {ordered: false})
    }
    return unchanged ? [] : [...new Set([...oldIds, ...newIds])].filter(id => !oldIds.has(id) || !newIds.has(id))
}

Hook.on(['typeUpdated', 'typeCreated', 'typeDeleted'], async ({data, result, deletedDocuments, ids, type, db}, name) => {
    if (type === 'GenericDataDefinition') {
        // definition changed (name/title/fields) -> reload lazily
        definitionCache.clear()
        return
    }
    if (!db || !isSearchedCollection(type)) {
        return
    }
    try {
        // ids of the changed documents
        let docIds
        if (name === 'typeDeleted') {
            docIds = deletedDocuments ? deletedDocuments.map(d => d._id.toString()) : [].concat(ids || [])
        } else {
            const doc = name === 'typeCreated' ? (result || data) : data
            docIds = doc && doc._id ? [doc._id.toString()] : []
        }
        if (!docIds.length) return

        if (pendingChanges) {
            // a build is running: remember it, it is applied again when the build is done
            docIds.forEach(docId => pendingChanges.set(type + ':' + docId, {collectionName: type, docId}))
        }
        if (!(await getBuiltAt(db))) {
            // not built yet: the build will find it
            return
        }
        const affected = new Set()
        for (const docId of docIds) {
            (await updateReferencesOfDoc(db, type, docId, name === 'typeDeleted')).forEach(id => affected.add(id))
        }
        if (affected.size) {
            await updateMediaReferenceCounts(db, [...affected])
        }
    } catch (e) {
        console.error('MediaReference: update failed', type, name, e.message)
    }
})


// ─── queries ──────────────────────────────────────────────────────────────────

// all references of the given media ids: {id: [{location, _id, name, meta, title}]}
const loadReferences = async (db, ids) => {
    const refs = await db.collection(MEDIA_REFERENCE_COLLECTION).find(
        {mediaId: {$in: ids.map(id => String(id).toLowerCase())}},
        {projection: {_id: 0, mediaId: 1, location: 1, docId: 1, name: 1, meta: 1, title: 1}}
    ).toArray()
    const byId = {}
    for (const {mediaId, docId, ...rest} of refs) {
        if (!isRealReference(rest)) continue
        (byId[mediaId] || (byId[mediaId] = [])).push({...rest, _id: docId})
    }
    return byId
}

// real usages of the given media ids: {id: [{location, _id, name}]} - only ids that are used
export const findMediaUsages = async (db, ids) => {
    await ensureMediaReferences(db)
    const refs = await loadReferences(db, ids)
    const usages = {}
    for (const id of ids) {
        const entries = refs[String(id).toLowerCase()] || []
        if (entries.length) {
            usages[id] = entries
        }
    }
    return usages
}

// writes references.count/locations/lastChecked into the Media entries, returns {id: {references}}
export const updateMediaReferenceCounts = async (db, ids) => {
    const refs = await loadReferences(db, ids)
    const checkedItems = {}
    const now = Date.now()
    const operations = ids.filter(id => ObjectId.isValid(id)).map(id => {
        const locations = refs[String(id).toLowerCase()] || []
        const $set = {references: {count: locations.length, locations, lastChecked: now}}
        checkedItems[id] = $set
        return {updateOne: {filter: {_id: new ObjectId(id)}, update: {$set}}}
    })
    if (operations.length) {
        await db.collection('Media').bulkWrite(operations, {ordered: false})
    }
    return checkedItems
}
