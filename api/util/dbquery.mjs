import {ObjectId} from 'mongodb'
import ClientUtil from '../../client/util/index.mjs'
import {getType} from '../../util/types.mjs'
import Util from './index.mjs'
import {CAPABILITY_MANAGE_SAME_GROUP} from '../../util/capabilities.mjs'
import Cache from '../../util/cache.mjs'

// How long subQuery results are cached (in milliseconds)
const SUBQUERY_CACHE_TTL_MS = 10000

/**
 * Key under which a deep search match entry carries its metadata. The property
 * is defined non-enumerable, so neither JSON.stringify nor the BSON serializer
 * ever sees it - it exists purely so AggregationBuilderV2 can recognise and
 * merge several deep searches on the same field.
 */
export const DEEP_SEARCH_META = '__deepSearch__'

/**
 * Body of the server-side deep search function. It takes an ARRAY of patterns:
 * non-negated requires every pattern to match, negated requires none to match -
 * which is exactly the AND semantics of separate $expr entries inside an $and.
 * Emitting the array form even for a single pattern is what allows several deep
 * searches to be merged later without generating a different body.
 */
const deepSearchFunctionBody = (negate) => `function(data, patterns) {
                if (data === null || data === undefined) return false;
                var haystack = (typeof data === 'object') ? JSON.stringify(data) : String(data);
                for (var i = 0; i < patterns.length; i++) {
                    if (${negate ? '' : '!'}new RegExp(patterns[i], 'i').test(haystack)) return false;
                }
                return true;
            }`

// ─── Comparator maps ──────────────────────────────────────────────────────────

export const comparatorMap = {
    ':':   '$regex',
    '=':   '$regex',
    '~':  '$regex',
    '=~':  '$regex',
    '!~':  '$regex', /* ~ ---> Alt+N */
    '~~':  '$deepSearch',  /* searches the whole value, including nested objects */
    '!~~': '$deepSearch',
    '==':  '$eq',
    '===': '$eq',
    '>':   '$gt',
    '>=':  '$gte',
    '<':   '$lt',
    '<=':  '$lte',
    '!=':  '$regex',
    '!==': '$ne'
}

// Set gives O(1) lookup instead of O(n) Array.indexOf
const RANGE_COMPARATORS = new Set(['$gt', '$gte', '$lt', '$lte'])

const makeAccentInsensitive = (str) => {
    return str
        .replace(/ss|ß|ẞ/gi, '(?:ss|ß|ẞ)')
        .replace(/ae|ä/gi, '(?:ae|ä)')
        .replace(/oe|ö/gi, '(?:oe|ö)')
        .replace(/ue|ü/gi, '(?:ue|ü)')
        .replace(/[aáàâåãä]/gi, '[aáàâåãä]')
        .replace(/[eéèêë]/gi, '[eéèêë]')
        .replace(/[iíìîï]/gi, '[iíìîï]')
        .replace(/[oóòôõö]/gi, '[oóòôõö]')
        .replace(/[uúùûü]/gi, '[uúùûü]')
        .replace(/[cç]/gi, '[cç]')
        .replace(/[nñ]/gi, '[nñ]')
}

export const addFilterToMatchV2 = async ({ db, debugInfo, filterKey, filterValue,
                                             type, subQuery, multi, filterOptions, match }) => {
    // Normalize once so every branch below can access these unguarded.
    const options = filterOptions ?? {}
    const rawComparator = options.comparator ?? ''

    // Set by the deep search branch below so the pushed match entry can be
    // tagged for later merging.
    let deepSearchMeta = null

    if (rawComparator && !comparatorMap[rawComparator] && debugInfo) {
        debugInfo.push({ code: 'unknownComparator',
            message: `Unknown comparator "${rawComparator}", falling back to regex match` })
    }

    let comparator = comparatorMap[rawComparator] ?? '$regex'

    // $regex is not meaningful for Boolean / ID / Float – fall back to $eq / $ne
    if (comparator === '$regex' && (type === 'Boolean' || type === 'ID' || type === 'Float')) {
        comparator = rawComparator === '!=' ? '$ne' : '$eq'
    }

    // ── Type-specific value coercion ──────────────────────────────────────────

    // Deep search is used when explicitly requested via ? / !?, or implicitly when
    // a regex filter targets an Object field at its root (info=vertrag). A plain
    // regex can never match an Object value, so the root case would silently
    // return nothing otherwise. Sub paths (info.foo.name) are NOT included: there
    // the value is usually a scalar and a plain regex is both correct and
    // indexable.
    const isDeepSearch =
        comparator === '$deepSearch' ||
        (comparator === '$regex' && type === 'Object' && !filterKey.includes('.'))

    if (isDeepSearch) {
        if (!db || db._versionInt < 5) {
            if (debugInfo) {
                debugInfo.push({
                    code: 'deepSearchUnsupported',
                    message: 'Deep search requires MongoDB 5 or newer'
                })
            }
            return false
        }

        if (subQuery) {
            // filterKey is rewritten to '$expr' below, which cannot be nested
            // under a sub-collection field path.
            if (debugInfo) {
                debugInfo.push({
                    code: 'deepSearchNoSubQuery',
                    message: 'Deep search is not supported on reference sub fields'
                })
            }
            return false
        }

        const negate = rawComparator.startsWith('!')

        // The patterns are passed in via `args` rather than interpolated into
        // the function body, and pre-escaped, so they can never break out of the
        // generated JS source (which MongoDB executes server-side via $function).
        const escapedValue = ClientUtil.escapeRegex(String(filterValue))

        // Same accent handling as the plain $regex branch below. Without it a
        // filter on a concrete field would match "Mueller" against "Müller"
        // while the vague search over the same data would not - one input box,
        // two behaviours. Note what makeAccentInsensitive actually does: it
        // equates the German transliterations (ue/ü, ae/ä, oe/ö, ss/ß) and adds
        // diacritic classes; a bare "u" is NOT treated as "ü".
        const escapedPattern = options.ignoreAccents !== false
            ? makeAccentInsensitive(escapedValue)
            : escapedValue

        filterValue = {
            body: deepSearchFunctionBody(negate),
            args: ['$' + filterKey, {$literal: [escapedPattern]}],
            lang: 'js'
        }

        // Remember what this expression tests, so several deep searches on the
        // same field can be collapsed into one $function call downstream.
        deepSearchMeta = { field: filterKey, negate }

        comparator = '$function'
        filterKey  = '$expr'

    } else if (type === 'ID') {
        if (filterValue) {
            if (filterValue.constructor === ObjectId) {
                // Already an ObjectId – nothing to do
            } else if (filterValue.startsWith('[') && filterValue.endsWith(']')) {
                // Array of IDs: "[id1,id2,...]"
                const rawIds = filterValue.slice(1, -1).split(',').map(id => id.trim())
                const ids = []

                for (const id of rawIds) {
                    // Use try/catch instead of calling isValid() + new ObjectId() separately,
                    // since the ObjectId constructor validates internally anyway.
                    try {
                        ids.push(new ObjectId(id))
                    } catch {
                        if (debugInfo) {
                            debugInfo.push({
                                code: 'invalidId',
                                message: 'Search for IDs. But at least one ID is not valid'
                            })
                        }
                        return false
                    }
                }

                filterValue = ids
                comparator  = comparator === '$ne' ? '$nin' : '$in'

            } else {
                // Single ID string
                try {
                    filterValue = new ObjectId(filterValue)
                } catch {
                    if (debugInfo) {
                        debugInfo.push({ message: 'Search for ID. But ID is not valid', code: 'invalidId' })
                    }
                    return false
                }
            }
        } else {
            // Empty / null ID filter – check for existence or absence
            if (comparator === '$ne') {
                match.push({$and:[
                        {[filterKey]: { $exists: true }},
                        {[filterKey]: { $ne: null }}
                    ]})
            } else {

                match.push({$or:[
                        { [filterKey]: { $exists: false } },
                        { [filterKey]: null },
                        { [filterKey]: { $size: 0 } }
                    ]})
            }
            return true
        }

    } else if (type === 'Boolean') {
        if (filterValue === 'true'  || filterValue === 'TRUE')  filterValue = true
        else if (filterValue === 'false' || filterValue === 'FALSE') filterValue = false

    } else if (type === 'Float') {
        filterValue = parseFloat(filterValue)

        if (isNaN(filterValue)) {
            if (debugInfo) {
                debugInfo.push({
                    code: 'invalidNumber',
                    message: `Search for a number on field ${filterKey}. But the value is not a valid number`
                })
            }
            return false
        }

    } else if (type === 'Object' && comparator === '$regex' && debugInfo) {
        // A plain regex can never match an Object value. Point the user at the
        // two options instead of silently returning no results.
        debugInfo.push({
            code: 'objectFilterNeedsPathOrDeepSearch',
            message: `Field ${filterKey} is an Object. Use a sub path (${filterKey}.name:value) or deep search (${filterKey}?value)`
        })
    }

    // ── Build the match expression ────────────────────────────────────────────

    let matchExpression

    if (RANGE_COMPARATORS.has(comparator)) {
        matchExpression = { [comparator]: type === 'ID' ? filterValue : parseFloat(filterValue) }

    } else if (comparator === '$ne' || comparator === '$eq') {
        const eqOp  = comparator === '$eq' ? '$in'  : '$nin'

        if (multi && filterValue && filterValue.constructor !== Array) {
            matchExpression = { [eqOp]: [filterValue] }

        } else if (filterValue === '') {
            matchExpression = { [eqOp]: [null, ''] }
            if (comparator !== '$eq') {
                matchExpression.$exists = true
                matchExpression.$not = { $size: 0 }
            }

        } else if (!options.inDoubleQuotes && filterValue === 'null') {
            matchExpression = { [comparator]: null }

        } else if (filterValue?.constructor === ObjectId) {
            matchExpression = { [comparator]: filterValue }

        } else if (ObjectId.isValid(filterValue)) {

            match.push({
                $or: [
                    { [filterKey]: { [comparator]: new ObjectId(filterValue) } },
                    { [filterKey]: { [comparator]: filterValue.toString() } }
                ]
            })
            return true

        } else {
            if (options.inDoubleQuotes) {
                matchExpression = { [comparator]: filterValue }
            } else if (filterValue === true || filterValue === false) {
                matchExpression = { [comparator]: filterValue }
            } else if (!isNaN(filterValue)) {
                matchExpression = { [comparator]: parseFloat(filterValue) }
            } else if (
                filterValue?.constructor === String &&
                filterValue.startsWith('[') &&
                filterValue.endsWith(']')
            ) {
                matchExpression = {
                    $in: filterValue.slice(1, -1).split(',').map(f => {
                        f = f.trim()
                        return f.startsWith('"') && f.endsWith('"') ? f.slice(1, -1) : f
                    })
                }
            } else {
                matchExpression = { [comparator]: filterValue }
            }

        }

    } else if (comparator === '$regex') {
        if (filterValue === undefined || filterValue === null) filterValue = ''
        if (filterValue.constructor !== String) filterValue = String(filterValue)

        let finalValue

        if (rawComparator.includes('~')) {
            const regParts = filterValue.match(/^\/(.*?)\/([gim]*)$/)
            finalValue = regParts ? new RegExp(regParts[1], regParts[2]) : new RegExp(filterValue)
        } else {
            const escapedValue = ClientUtil.escapeRegex(filterValue)
            const patternSource = options.ignoreAccents !== false
                ? makeAccentInsensitive(escapedValue)
                : escapedValue
            finalValue = new RegExp(patternSource, 'i')
        }

        matchExpression = rawComparator.includes('!')
            ? { $not: finalValue }
            : finalValue

    } else {
        matchExpression = { [comparator]: filterValue }
    }

    // ── SubQuery: resolve IDs from a related collection ───────────────────────
    // Results are cached via Cache to avoid redundant DB round-trips when the
    // same sub-collection + condition appears more than once within a request.
    if (subQuery) {
        // $not only means "negate the whole condition" when it is the sole key.
        // Alongside other operators (e.g. { $nin, $exists, $not }) the expression
        // must be passed through to the sub-collection unchanged.
        const keys = matchExpression?.constructor === Object ? Object.keys(matchExpression) : []
        const isNegated = keys.length === 1 && keys[0] === '$not'
        const subFilter = isNegated ? matchExpression.$not : matchExpression

        const cacheKey = `subquery:${subQuery.type}:${subQuery.name}:` +
            JSON.stringify(subFilter, (k, v) => v instanceof RegExp ? `__re__:${v.source}:${v.flags}` : v)

        let ids = Cache.get(cacheKey)
        if (!ids) {
            ids = (await db.collection(subQuery.type).find({ [subQuery.name]: subFilter }).toArray())
                .map(item => item._id)
            Cache.set(cacheKey, ids, SUBQUERY_CACHE_TTL_MS)
        }

        matchExpression = { [isNegated ? '$nin' : '$in']: ids }
    }

    const matchEntry = { [filterKey]: matchExpression }

    if (deepSearchMeta) {
        // Non-enumerable: invisible to JSON.stringify and to BSON serialization,
        // so it never reaches MongoDB.
        Object.defineProperty(matchEntry, DEEP_SEARCH_META, {
            value: deepSearchMeta,
            enumerable: false,
            writable: true,
            configurable: true
        })
    }

    match.push(matchEntry)

    return true
}

// ─── extendWithOwnerGroupMatch ────────────────────────────────────────────────

/** Extends a match object to restrict results to documents owned by the user's group(s). */
export const extendWithOwnerGroupMatch = (typeDefinition, context, match, userFilter) => {
    if (!typeDefinition) return match

    const ownerGroup = typeDefinition.fields.find(f => f.name === 'ownerGroup')
    if (!ownerGroup) return match

    if (context.group?.length > 0) {
        const ownerMatch = { ownerGroup: { $in: context.group.map(f => new ObjectId(f)) } }
        match = match && Object.keys(match).length > 0
            ? { $or: [match, ownerMatch] }
            : ownerMatch
    } else if (!userFilter) {
        if (!match) match = {}
        match.ownerGroup = {}
    }

    return match
}

// ─── createMatchForCurrentUser ────────────────────────────────────────────────

/**
 * Builds a MongoDB match that limits results to documents the current user
 * is allowed to see, based on role, group membership, and type-level access config.
 */
export const createMatchForCurrentUser = async ({ typeName, db, context, operation = 'read' }) => {
    let match

    if (typeName === 'UserRole') {
        match = { name: { $in: ['subscriber', context.role] } }
        const typeDefinition = getType(typeName)
        match = extendWithOwnerGroupMatch(typeDefinition, context, match, true)

    } else if (typeName === 'User') {
        match = { _id: { $in: await Util.userAndJuniorIds(db, context.id) } }

        if (context.group?.length > 0) {
            const userCanManageSameGroup = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_SAME_GROUP)
            if (userCanManageSameGroup) {
                match = { $or: [match, { group: { $in: context.group.map(f => new ObjectId(f)) } }] }
            }
        }

    } else {


        if(context.accessScope && context.accessScope.length > 0){
            // oauth access scope
            if(context.accessScope.includes('user:read')){
                match = { createdBy: { $in: await Util.userAndJuniorIds(db, context.id) } }
                return match
            }
        }




        const typeDefinition = getType(typeName)
        let userFilter = true

        if (typeDefinition) {
            if (typeDefinition.noUserRelation) userFilter = false

            if (typeDefinition.access?.[operation]) {
                if (await Util.userHasCapability(db, context, typeDefinition.access[operation])) {
                    match = {}
                    if (typeDefinition.access[operation].type === 'roleAndUser') {
                        if (userFilter) {
                            match = { createdBy: { $in: await Util.userAndJuniorIds(db, context.id) } }
                        }
                        match = extendWithOwnerGroupMatch(typeDefinition, context, match, userFilter)
                    }
                    // User has general access rights for this type
                    return match
                } else {
                    // User lacks permission – return undefined to signal no access
                    return
                }
            }
        }

        if (userFilter) {
            match = { createdBy: { $in: await Util.userAndJuniorIds(db, context.id) } }
        }

        match = extendWithOwnerGroupMatch(typeDefinition, context, match, userFilter)
    }

    return match
}

// ─── makeAllMatchAnAndMatch ───────────────────────────────────────────────────

/**
 * Moves all top-level keys (except $and) into match.$and so that subsequent
 * conditions can be safely appended without clobbering existing ones.
 *
 * Uses for…in instead of Object.keys() to avoid allocating an intermediate array.
 */
export const makeAllMatchAnAndMatch = (match) => {
    if (!match) return
    for (const k in match) {
        if (k === '$and') continue
        if (!match.$and) match.$and = []
        match.$and.push({ [k]: match[k] })
        delete match[k]
    }
}