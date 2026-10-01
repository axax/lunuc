/**
 * Index hints for cases where MongoDB's multi-planner reliably picks badly.
 *
 * The planner ranks candidate plans by "works" (steps) during a short trial
 * run. Two situations are systematically misjudged, both handled here:
 *
 * 1. $function in the root $match (deep search "~~"). Every trial run executes
 *    the server-side JavaScript, so plan selection alone costs a multiple of
 *    the query. With an equality on the leading field of a plain index (e.g.
 *    GenericData.definition) that index is pinned and the race skipped.
 *
 * 2. A regex on an indexed field while sorting only by _id. The _id plan wins
 *    the race because it needs no sort, although it FETCHes every document and
 *    filters afterwards - a fetch of a 5 MB document counts as one "work" just
 *    like a 200 byte one. The plan over the regex field's index evaluates the
 *    regex on the index keys and fetches only the matches. Its only drawback,
 *    the in-memory sort, is irrelevant here: the $facet count consumes every
 *    match anyway, so the _id plan cannot stop early either.
 *    Seen on KeyValueGlobal: 175 documents, 2.5 s instead of a few ms.
 *    Only applied when no equality field has a usable index - then the
 *    planner has a genuinely selective alternative and decides itself.
 */

// Indexes practically only change with a deployment/restart, so a long TTL is fine.
const INDEX_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const indexCache = new Map() // collectionName -> {expires, promise}

/** true if the object tree contains a $function operator */
export const containsFunction = (node) => {
    if (!node || typeof node !== 'object') return false
    if (Array.isArray(node)) return node.some(containsFunction)
    for (const key of Object.keys(node)) {
        if (key === '$function') return true
        if (containsFunction(node[key])) return true
    }
    return false
}

const isScalarValue = (value) => {
    if (value === null || value === undefined) return false
    if (typeof value !== 'object') return true
    const name = value.constructor?.name
    return name === 'ObjectId' || name === 'ObjectID' || name === 'Date'
}

const isEquality = (value) => {
    if (isScalarValue(value)) return true
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const keys = Object.keys(value)
        if (keys.length === 1 && keys[0] === '$eq') return isScalarValue(value.$eq)
        if (keys.length === 1 && keys[0] === '$in' && Array.isArray(value.$in) && value.$in.length === 1) {
            return isScalarValue(value.$in[0])
        }
    }
    return false
}

/** A positive regex condition: /x/ or {$regex: ..., $options?: ...} - never $not */
const isRegex = (value) => {
    if (value instanceof RegExp) return true
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const keys = Object.keys(value)
        return keys.includes('$regex') && keys.every(k => k === '$regex' || k === '$options')
    }
    return false
}

/**
 * Fields with a condition that applies to every document of the result:
 * top-level keys of the match and entries of a top-level $and. Conditions
 * inside $or/$nor are ignored - they do not bound an index scan.
 */
const collectFields = (match, predicate) => {
    const fields = new Set()
    const visit = (m) => {
        if (!m || typeof m !== 'object' || Array.isArray(m)) return
        for (const [key, value] of Object.entries(m)) {
            if (key === '$and' && Array.isArray(value)) {
                value.forEach(visit)
            } else if (!key.startsWith('$') && predicate(value)) {
                fields.add(key)
            }
        }
    }
    visit(match)
    return fields
}

export const collectEqualityFields = (match) => collectFields(match, isEquality)
export const collectRegexFields = (match) => collectFields(match, isRegex)

/**
 * Picks the index covering the most leading fields of the given set. Wildcard,
 * text, geo, hashed, partial, sparse and collation indexes are skipped because
 * they either cannot serve the match reliably or could silently drop documents.
 * Returns the index name or null.
 */
export const pickHintIndex = (indexes, fields) => {
    let best = null
    for (const index of indexes || []) {
        // hidden: a hint on a hidden index is rejected by MongoDB
        if (!index?.key || index.hidden || index.partialFilterExpression || index.sparse || index.collation) continue
        const keys = Object.keys(index.key)
        if (keys.some(k => k.includes('$**') || typeof index.key[k] !== 'number')) continue

        let prefix = 0
        while (prefix < keys.length && fields.has(keys[prefix])) prefix++
        if (prefix === 0) continue

        // more covered prefix wins, then the shorter (cheaper) index
        if (!best || prefix > best.prefix || (prefix === best.prefix && keys.length < best.length)) {
            best = {name: index.name, prefix, length: keys.length}
        }
    }
    return best ? best.name : null
}

/** Forget the cached index list, e.g. after a hint was rejected because an index was hidden or dropped. */
export const clearIndexCache = (collectionName) => {
    if (collectionName) indexCache.delete(collectionName)
    else indexCache.clear()
}

// The promise is cached, so concurrent requests on a cold cache share one
// listIndexes call. A failed call is evicted so the next request retries.
const getIndexes = (collection) => {
    const name = collection.collectionName
    const cached = indexCache.get(name)
    if (cached && cached.expires > Date.now()) return cached.promise
    const promise = collection.indexes().catch(e => {
        indexCache.delete(name)
        throw e
    })
    indexCache.set(name, {expires: Date.now() + INDEX_CACHE_TTL_MS, promise})
    return promise
}

/** true if the pipeline sorts right after the match by nothing but _id */
const sortsOnlyById = (pipeline) => {
    const sort = pipeline?.[1]?.$sort
    if (!sort) return true
    const keys = Object.keys(sort)
    return keys.length === 1 && keys[0] === '_id'
}

/**
 * Returns {hint, reason} for the given pipeline, or null.
 * Never throws - a failed lookup simply means no hint.
 */
const NEGATION_OPERATORS = new Set(['$ne', '$nin', '$not'])

/**
 * Wildcard indexes like {definition: 1, 'data.$**': 1} whose fields before the
 * wildcard are all bound by equalities - only those can be picked by the
 * planner here at all. Returns their path prefixes ('data.').
 */
const usableWildcardPrefixes = (indexes, equalityFields) => {
    const prefixes = []
    for (const index of indexes || []) {
        if (!index?.key || index.hidden) continue
        const keys = Object.keys(index.key)
        const wildcardPos = keys.findIndex(k => k.includes('$**'))
        if (wildcardPos < 0) continue
        if (!keys.slice(0, wildcardPos).every(k => equalityFields.has(k))) continue
        prefixes.push(keys[wildcardPos].replace('$**', ''))
    }
    return prefixes
}

/**
 * true if nothing in the match can bound a wildcard path: every condition on a
 * field under one of the prefixes is a plain negation ($ne / $nin / $not) at
 * the top level or in a top-level $and, and there is no $expr. Then the
 * wildcard index can only be scanned with $_path [MinKey, MaxKey], i.e. one
 * key per FIELD of every matching document instead of one per document.
 */
const wildcardCannotBound = (match, prefixes) => {
    const under = key => prefixes.some(prefix => prefix === '' || key.startsWith(prefix))
    let allOccurrences = 0, negationOccurrences = 0, hasExpr = false

    const countAll = (node) => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(countAll); return }
        if (node.constructor !== Object) return
        for (const [key, value] of Object.entries(node)) {
            if (key === '$expr' || key === '$where' || key === '$function') hasExpr = true
            if (!key.startsWith('$') && under(key)) allOccurrences++
            countAll(value)
        }
    }
    const countNegations = (node) => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return
        for (const [key, value] of Object.entries(node)) {
            if (key === '$and' && Array.isArray(value)) {
                value.forEach(countNegations)
            } else if (!key.startsWith('$') && under(key) && value && value.constructor === Object) {
                const ops = Object.keys(value)
                if (ops.length > 0 && ops.every(op => NEGATION_OPERATORS.has(op))) negationOccurrences++
            }
        }
    }
    countAll(match)
    countNegations(match)
    return !hasExpr && allOccurrences === negationOccurrences
}

/** true if the pipeline sorts right after the match by a field under one of the prefixes */
const sortsByWildcardPath = (pipeline, prefixes) => {
    const sort = pipeline?.[1]?.$sort
    if (!sort) return false
    return Object.keys(sort).some(key => prefixes.some(prefix => prefix === '' || key.startsWith(prefix)))
}

export const findQueryHint = async (collection, pipeline) => {
    try {
        const match = pipeline?.[0]?.$match
        if (!match) return null

        const hasFunction = containsFunction(match)
        const equalityFields = collectEqualityFields(match)
        const regexFields = hasFunction ? new Set() : collectRegexFields(match)

        if (equalityFields.size === 0 && regexFields.size === 0) return null

        const indexes = await getIndexes(collection)
        const equalityHint = equalityFields.size > 0 ? pickHintIndex(indexes, equalityFields) : null

        if (hasFunction) {
            return equalityHint ? {hint: equalityHint, reason: 'function'} : null
        }

        // 3. A usable wildcard index that nothing in the match can bound: the
        //    plain equality index reads one key per document, the wildcard one
        //    key per field of every document (pokerhelden title list: 300
        //    tournaments with hundreds of fields each). Not when the sort is on
        //    a wildcard path - there the wildcard index may deliver the order.
        if (equalityHint && regexFields.size === 0) {
            const prefixes = usableWildcardPrefixes(indexes, equalityFields)
            // only without a sort or with an _id sort: another index might deliver a different order
            if (prefixes.length > 0 && wildcardCannotBound(match, prefixes) &&
                !sortsByWildcardPath(pipeline, prefixes) && sortsOnlyById(pipeline)) {
                return {hint: equalityHint, reason: 'wildcard'}
            }
        }

        if (regexFields.size === 0) return null

        // An indexed equality is a real alternative - leave the choice to the planner.
        if (equalityHint || !sortsOnlyById(pipeline)) return null

        const regexHint = pickHintIndex(indexes, regexFields)
        return regexHint ? {hint: regexHint, reason: 'regex'} : null
    } catch (e) {
        console.warn('findQueryHint failed', e.message)
        return null
    }
}

const COVERABLE_OPERATORS = new Set(['$eq', '$in', '$gt', '$gte', '$lt', '$lte'])

const isCoverableCondition = (value) => {
    if (isScalarValue(value)) return true
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const keys = Object.keys(value)
    if (keys.length === 0) return false
    return keys.every(op => {
        if (!COVERABLE_OPERATORS.has(op)) return false
        if (op === '$in') return Array.isArray(value.$in) && value.$in.length > 0 && value.$in.every(isScalarValue)
        return isScalarValue(value[op])
    })
}

/**
 * Fields of a match that consists ONLY of equality/range conditions on plain
 * fields (top level or in a top-level $and). Anything else - $or, $expr,
 * regex, $exists, $not ... - returns null, since it cannot be decided on the
 * index keys alone.
 */
export const coverableMatchFields = (match) => {
    const fields = new Set()
    let coverable = true
    const visit = (m) => {
        if (!coverable) return
        if (!m || typeof m !== 'object' || Array.isArray(m)) { coverable = false; return }
        for (const [key, value] of Object.entries(m)) {
            if (key === '$and' && Array.isArray(value)) {
                value.forEach(visit)
            } else if (!key.startsWith('$') && isCoverableCondition(value)) {
                fields.add(key)
            } else {
                coverable = false
                return
            }
        }
    }
    visit(match)
    return coverable && fields.size > 0 ? fields : null
}

/**
 * Name of a plain index that can answer the whole match from its keys (its
 * leading field is in the match and every match field is part of the key),
 * or null. Used to decide whether a separate count can run without fetching
 * documents. A multikey index cannot cover - listIndexes does not tell, so
 * in that rare case the count fetches and costs about what the $facet did.
 */
export const pickCoveringIndex = (indexes, fields) => {
    let best = null
    for (const index of indexes || []) {
        // hidden: a hint on a hidden index is rejected by MongoDB
        if (!index?.key || index.hidden || index.partialFilterExpression || index.sparse || index.collation) continue
        const keys = Object.keys(index.key)
        if (keys.some(k => k.includes('$**') || typeof index.key[k] !== 'number')) continue
        if (!fields.has(keys[0])) continue
        if (![...fields].every(f => keys.includes(f))) continue
        if (!best || keys.length < best.length) best = {name: index.name, length: keys.length}
    }
    return best ? best.name : null
}

/** Covering index for the match of the given collection, or null. Never throws. */
export const findCoveringIndex = async (collection, match) => {
    try {
        const fields = coverableMatchFields(match)
        if (!fields) return null
        return pickCoveringIndex(await getIndexes(collection), fields)
    } catch (e) {
        console.warn('findCoveringIndex failed', e.message)
        return null
    }
}
