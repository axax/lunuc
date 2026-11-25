import {ObjectId} from 'mongodb'
import Util from '../../../api/util/index.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {createMatchForCurrentUser, filterReadableIds} from '../../../api/util/dbquery.mjs'
import {getGenericTypeDefinitionWithStructure} from '../../genericdata/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'
import Hook from '../../../util/hook.cjs'
import {SEARCH_COLLECTION, getIndexedTypes, DEFAULT_LANGUAGE, ANY_LANGUAGE, textLanguage} from './config.mjs'
import {MAX_WORD_LENGTH} from './extract.mjs'
import {findCorrections} from './fuzzy.mjs'

const MAX_LIMIT = 50
const SNIPPET_LENGTH = 180
// the substring search cannot use an index: it is stopped after this time and the hits found so far are used
const SUBSTRING_SEARCH_MAX_MS = 1000

const getViewer = async (db, context) => {
    const id = context && context.id
    let capabilities = []
    if (id) {
        const user = await Util.userById(db, id)
        const role = user && user.role ? await Util.getUserRoles(db, user.role) : null
        capabilities = (role && role.capabilities) || []
    }
    return {
        isGuest: !id,
        canSeeAll: await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS),
        ids: await Util.userAndJuniorIds(db, id),
        groups: ((context && context.group) || []).map(g => new ObjectId(g)),
        roles: ['anonymous', ...capabilities]
    }
}

// values of a field in a match (top level, $in and inside $or / $and)
const collectMatchValues = (match, key, values = []) => {
    if (!match || typeof match !== 'object') return values
    const value = match[key]
    if (value !== undefined) {
        if (value && value.$in) values.push(...value.$in)
        else if (value && typeof value === 'object' && !(value instanceof ObjectId) && !Array.isArray(value)) {
            // other operators: not usable for the pre-filter
        } else values.push(...(Array.isArray(value) ? value : [value]))
    }
    ;[...(match.$or || []), ...(match.$and || [])].forEach(sub => collectMatchValues(sub, key, values))
    return values
}

// whether a match still filters on this field (top level or inside $or / $and)
const hasMatchKey = (match, key) => !!match && typeof match === 'object' &&
    (match[key] !== undefined || [...(match.$or || []), ...(match.$and || [])].some(sub => hasMatchKey(sub, key)))

/**
 * Rough pre-filter in the index (the final check is done on the documents themselves).
 * User restrictions (hook enhanceTypeMatch, extension userrestriction) can extend what a user sees:
 * more users / groups (ownerGroup, createdBy) or no user relation at all ($remove) - the pre-filter
 * has to include these entries, otherwise they would never reach the final check.
 */
export const viewerMatch = (viewer, context, types) => {
    if (viewer.canSeeAll) return {}
    const createdBy = [...viewer.ids], ownerGroup = [...viewer.groups], unrestrictedTypes = []
    for (const type of types) {
        const probe = {createdBy: {$in: [...viewer.ids]}, ownerGroup: {$in: [...viewer.groups]}}
        Hook.call('enhanceTypeMatch', {type, context, match: probe})
        const probeCreatedBy = collectMatchValues(probe, 'createdBy'), probeOwnerGroup = collectMatchValues(probe, 'ownerGroup')
        if (!hasMatchKey(probe, 'createdBy') && !hasMatchKey(probe, 'ownerGroup')) {
            // no user relation left: all entries of the type are candidates
            unrestrictedTypes.push(type)
        }
        createdBy.push(...probeCreatedBy)
        ownerGroup.push(...probeOwnerGroup)
    }
    const unique = (list) => [...new Map(list.map(v => [String(v), v])).values()]
    return {
        $or: [
            {createdBy: {$in: unique(createdBy)}},
            {ownerGroup: {$in: unique(ownerGroup)}},
            {readRoles: {$in: viewer.roles}},
            ...(unrestrictedTypes.length > 0 ? [{type: {$in: unrestrictedTypes}}] : [])
        ]
    }
}

// same splitting as toWords in extract.mjs
const searchTerms = (query) => String(query).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2)

const makeSnippet = (parts, terms, allowedFields) => {
    const usable = allowedFields ? parts.filter(p => allowedFields.includes(p.f)) : parts
    // match stems too: "turniere" -> "turnier"
    const probes = terms.map(t => t.length > 5 ? t.substring(0, t.length - 2) : t)
    for (const part of usable) {
        const lower = part.t.toLowerCase()
        let pos = -1
        for (const probe of probes) {
            pos = lower.indexOf(probe)
            if (pos >= 0) break
        }
        if (pos >= 0) {
            const start = Math.max(0, pos - Math.floor(SNIPPET_LENGTH / 3))
            const text = part.t.substring(start, start + SNIPPET_LENGTH)
            return {field: part.f, snippet: (start > 0 ? '…' : '') + text + (start + SNIPPET_LENGTH < part.t.length ? '…' : '')}
        }
    }
    const first = usable[0]
    return first ? {field: first.f, snippet: first.t.substring(0, SNIPPET_LENGTH) + (first.t.length > SNIPPET_LENGTH ? '…' : '')} : {field: null, snippet: ''}
}

/**
 * Which candidates the viewer may read - same rules as a normal query of the type:
 * GenericData like GraphQL (createMatchForCurrentUser + access.read of the definition),
 * visitors without login only types with publicSearch. Other types: createMatchForCurrentUser,
 * public CmsPages for everybody.
 * Returns Map key "type:ref" -> {allowedFields} (null = all fields).
 */
const checkAccess = async (db, context, viewer, candidates) => {
    const allowed = new Map()
    const byGroup = new Map()
    // the same for every GenericData type: computed once, only when needed
    let genericDataMatch = null
    const getGenericDataMatch = () => {
        if (!genericDataMatch) genericDataMatch = createMatchForCurrentUser({typeName: 'GenericData', db, context})
        return genericDataMatch
    }
    for (const c of candidates) {
        const groupKey = c.type === 'GenericData' ? 'GenericData:' + c.definition : c.type
        if (!byGroup.has(groupKey)) byGroup.set(groupKey, [])
        byGroup.get(groupKey).push(c)
    }
    await Promise.all([...byGroup.values()].map(async (list) => {
        const type = list[0].type
        const refs = [...new Set(list.map(c => c.ref.toString()))].map(id => new ObjectId(id))
        let readable = new Set(), allowedFields = null

        if (type === 'GenericData') {
            const def = await getGenericTypeDefinitionWithStructure(db, {id: list[0].definition.toString()})
            const structure = def && def.structure
            if (!structure || !structure.access) return
            if (viewer.isGuest) {
                const publicSearch = structure.publicSearch
                if (!publicSearch) return
                let pickerFields = structure.searchFields || structure.pickerField || 'name'
                if (!Array.isArray(pickerFields)) pickerFields = [pickerFields]
                allowedFields = publicSearch.constructor === Object && Array.isArray(publicSearch.fields)
                    ? publicSearch.fields
                    : [...pickerFields, ...(structure.projectFields || [])]
            }
            // same order as GenericResolver.entities: base match, user restrictions (enhanceTypeMatch),
            // then the read rights of the type (genericdata hook beforeTypeLoaded). The rights of the type
            // come last on purpose: a restriction that extends createdBy must not open types like contact
            // forms that are only readable for certain roles (there createdBy is set back to the own ids)
            let match = {}
            if (!viewer.canSeeAll) {
                match = await getGenericDataMatch()
                if (!match) return
            }
            match = {...match}
            Hook.call('enhanceTypeMatch', {type: 'GenericData', context, match})
            const read = structure.access.read
            if (read) {
                const accessMatch = await Util.getAccessFilter(db, context, read)
                if (accessMatch.createdBy) {
                    match.createdBy = accessMatch.createdBy
                } else if (Object.keys(accessMatch).length > 0) {
                    // e.g. roleGroup without the role: {$or: [own entries, own group]} (same as genericdata beforeTypeLoaded)
                    match.$and = [...(match.$and || []), accessMatch]
                } else if (read.force) {
                    delete match.createdBy
                }
            }
            const docs = await db.collection('GenericData')
                .find({$and: [{_id: {$in: refs}}, {definition: def._id}, match]}, {projection: {_id: 1}}).toArray()
            readable = new Set(docs.map(d => d._id.toString()))
        } else {
            // filterReadableIds: rights of the type and user restrictions (without restrictions no query for admins)
            readable = await filterReadableIds({db, context, typeName: type, ids: refs})
            if (!viewer.canSeeAll) {
                // public CmsPages
                list.filter(c => (c.readRoles || []).some(r => viewer.roles.includes(r))).forEach(c => readable.add(c.ref.toString()))
            }
        }
        readable.forEach(id => allowed.set(type + ':' + id, {allowedFields}))
    }))
    return allowed
}

const adminUrl = (hit) => {
    if (hit.type === 'GenericData') {
        return `/admin/types/GenericData?fixType=GenericData&meta=${encodeURIComponent(hit.genericType)}&open=${hit.ref}`
    }
    return `/admin/types/${hit.type}?open=${hit.ref}`
}

/**
 * Full text search over the SearchIndex with the rights of the given user.
 *
 *  query     search terms
 *  lang      language of the query (default: DEFAULT_LANGUAGE), entries without language are always included
 *  types     subset of the indexed types (types with searchIndex in build.json)
 *  genericTypes  only these GenericData types (names)
 *  fuzzy     default true: if there are not enough hits, misspelled terms are corrected to similar words
 *
 * Returns {total, results: [{type, genericType, _id, title, field, snippet, score, lang, url, adminUrl}], corrections}
 * corrections (only if used): {term: [similar words that were searched as well]}
 * total = number of readable hits found (at most the candidates that were checked)
 */
export const search = async (db, context, {query, lang, types, genericTypes, limit = 10, offset = 0, fuzzy = true} = {}) => {
    const q = String(query || '').trim()
    if (q.length < 2) {
        return {total: 0, results: []}
    }
    limit = Math.max(1, Math.min(parseInt(limit) || 10, MAX_LIMIT))
    offset = Math.max(0, parseInt(offset) || 0)
    const language = lang || DEFAULT_LANGUAGE
    const viewer = await getViewer(db, context)
    const collection = db.collection(SEARCH_COLLECTION)

    const indexedTypes = getIndexedTypes()
    const typeList = (Array.isArray(types) && types.length > 0 ? types : indexedTypes).filter(t => indexedTypes.includes(t))
    const filter = {
        lang: {$in: [language, ANY_LANGUAGE]},
        type: {$in: typeList},
        ...viewerMatch(viewer, context, typeList)
    }
    if (Array.isArray(genericTypes) && genericTypes.length > 0) {
        filter.$and = [{$or: [{type: {$ne: 'GenericData'}}, {genericType: {$in: genericTypes}}]}]
    }
    const candidateLimit = Math.min((offset + limit) * 4, 400)
    // candidates without text and parts (can be large) - the parts are loaded for the returned hits only
    const projection = {_id: 1, type: 1, ref: 1, definition: 1, genericType: 1, lang: 1, title: 1, readRoles: 1}

    // 1. text search (stemming in the language of the entry, ranked)
    let candidates = await collection.aggregate([
        {$match: {$text: {$search: q, $language: textLanguage(language)}, ...filter}},
        {$addFields: {score: {$meta: 'textScore'}}},
        {$sort: {score: -1}},
        {$limit: candidateLimit},
        {$project: {...projection, score: 1}}
    ]).toArray()

    // 2. not enough hits: substring search (parts of words, article numbers, names)
    let corrections = null
    if (candidates.length < offset + limit) {
        const regex = new RegExp(ClientUtil.escapeRegex(q), 'i')
        const substringMatch = {$or: [{title: regex}, {'parts.t': regex}]}
        const known = new Set(candidates.map(c => c._id.toString()))
        const addCandidates = (list) => list.forEach(c => {
            const id = c._id.toString()
            if (!known.has(id)) {
                known.add(id)
                candidates.push({...c, score: 0})
            }
        })
        // 2a. hits where every term is the beginning of a word: found via the index on words, then the same
        //     substring check as in 2b - so these are the same hits 2b finds, just fast
        // the longest term first: the index range is taken from it
        const terms = [...new Set(searchTerms(q).map(t => t.substring(0, MAX_WORD_LENGTH)))].sort((a, b) => b.length - a.length)
        if (terms.length > 0) {
            try {
                addCandidates(await collection.find({
                    $and: [filter, {words: {$all: terms.map(t => new RegExp('^' + ClientUtil.escapeRegex(t)))}}, substringMatch]
                }, {projection}).hint('search_words').limit(candidateLimit).toArray())
            } catch (e) {
                // e.g. index not created yet: 2b finds these hits as well
                console.warn('search: prefix search failed', e.message)
            }
        }
        // 2c. still not enough: fuzzy - misspelled terms are replaced by similar words of the vocabulary,
        //     every term has to match (itself as beginning of a word or one of its corrections)
        const allTerms = [...new Set(searchTerms(q).map(t => t.substring(0, MAX_WORD_LENGTH)))]
        if (fuzzy && candidates.length < offset + limit && allTerms.length > 0) {
            try {
                const found = await findCorrections(db, allTerms)
                if (Object.keys(found).length > 0) {
                    corrections = found
                    const termMatches = allTerms.map(t => ({
                        words: {$in: [new RegExp('^' + ClientUtil.escapeRegex(t)), ...(found[t] || [])]}
                    }))
                    addCandidates(await collection.find({$and: [filter, ...termMatches]}, {projection})
                        .limit(candidateLimit).toArray())
                }
            } catch (e) {
                // e.g. vocabulary not built yet
                console.warn('search: fuzzy search failed', e.message)
            }
        }
        // 2b. still not enough: the rest (the term in the middle of a word), cannot use an index -> time limit
        if (candidates.length < offset + limit) {
            try {
                addCandidates(await collection.find({$and: [filter, substringMatch]}, {projection})
                    .maxTimeMS(SUBSTRING_SEARCH_MAX_MS).limit(candidateLimit).toArray())
            } catch (e) {
                if (e && (e.code === 50 || e.codeName === 'MaxTimeMSExpired')) {
                    console.warn(`search: substring search for "${q}" stopped after ${SUBSTRING_SEARCH_MAX_MS}ms`)
                } else {
                    throw e
                }
            }
        }
    }

    // one hit per document (the best language)
    const best = new Map()
    for (const c of candidates) {
        const key = c.type + ':' + c.ref
        if (!best.has(key) || best.get(key).score < c.score) best.set(key, c)
    }
    const unique = [...best.values()].sort((a, b) => b.score - a.score)

    // 3. final check on the documents with the normal rights
    const allowed = await checkAccess(db, context, viewer, unique)
    const terms = [...searchTerms(q), ...(corrections ? Object.values(corrections).flat() : [])]
    const readable = unique.filter(c => allowed.has(c.type + ':' + c.ref))

    const page = readable.slice(offset, offset + limit)
    // the parts (texts per field) for snippets and urls, only for the returned hits
    const partsById = new Map()
    if (page.length > 0) {
        const docs = await collection.find({_id: {$in: page.map(c => c._id)}}, {projection: {parts: 1}}).toArray()
        docs.forEach(d => partsById.set(d._id.toString(), d.parts || []))
    }

    const results = page.map(c => {
        const {allowedFields} = allowed.get(c.type + ':' + c.ref)
        const parts = partsById.get(c._id.toString()) || []
        const {field, snippet} = makeSnippet(parts, terms, allowedFields)
        const slugPart = c.type === 'CmsPage' ? parts.find(p => p.f === 'slug') : null
        return {
            type: c.type,
            ...(c.genericType ? {genericType: c.genericType} : {}),
            _id: c.ref.toString(),
            title: c.title,
            field,
            snippet,
            score: Math.round((c.score || 0) * 100) / 100,
            lang: c.lang,
            ...(slugPart ? {url: '/' + slugPart.t} : {}),
            adminUrl: adminUrl(c)
        }
    })
    return {total: readable.length, results, ...(corrections ? {corrections} : {})}
}
