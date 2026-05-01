import {ObjectId} from 'mongodb'
import ClientUtil from '../../client/util/index.mjs'
import {getType} from '../../util/types.mjs'
import Util from './index.mjs'
import {CAPABILITY_MANAGE_SAME_GROUP} from '../../util/capabilities.mjs'
import Cache from '../../util/cache.mjs'

// How long subQuery results are cached (in milliseconds)
const SUBQUERY_CACHE_TTL_MS = 10000

// ─── Comparator maps ──────────────────────────────────────────────────────────

export const comparatorMap = {
    ':':   '$regex',
    '=':   '$regex',
    '=~':  '$regex',
    '!~':  '$regex', /* ~ ---> Alt+N */
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

// ─── addFilterToMatch ─────────────────────────────────────────────────────────

/**
 * Builds a MongoDB match expression for a single filter condition and appends
 * it to the given match object.
 *
 * SubQuery DB lookups are cached via Cache to avoid redundant round-trips.
 *
 * @returns {boolean} true if a condition was added, false if the value was invalid.
 */
export const addFilterToMatch = async ({db, debugInfo, filterKey, filterValue, type, subQuery, multi, filterOptions, match}) => {

    const rawComperator = filterOptions && filterOptions.comparator

    let comparator = '$regex' // default comparator

    if (rawComperator && comparatorMap[rawComperator]) {
        comparator = comparatorMap[rawComperator]
    }

    if (comparator === '$regex' && (type === 'Boolean' || type === 'ID' || type === 'Float')) {

        if (rawComperator === '!=') {
            comparator = '$ne'
        } else {
            comparator = '$eq'
        }
    }
    if (type === 'ID') {
        if (filterValue) {

            if (filterValue.constructor === ObjectId) {
                // do nothing
            } else if (filterValue.startsWith('[') && filterValue.endsWith(']')) {
                filterValue = filterValue.substring(1, filterValue.length - 1).split(',')
                const ids = []
                for (const id of filterValue) {
                    if (ObjectId.isValid(id)) {
                        ids.push(new ObjectId(id))
                    } else {
                        if(debugInfo) {
                            debugInfo.push({
                                code: 'invalidId',
                                message: 'Search for IDs. But at least one ID is not valid'
                            })
                        }
                        return false
                    }
                }
                filterValue = ids
                if (comparator === '$ne') {
                    comparator = '$nin'
                } else {
                    comparator = '$in'
                }
            } else if (ObjectId.isValid(filterValue)) {
                // match by id
                filterValue = new ObjectId(filterValue)

            } else {
                if(debugInfo) {
                    debugInfo.push({message: 'Search for ID. But ID is not valid', code: 'invalidId'})
                }
                return false
            }
        } else {

            if (comparator === '$ne') {
                if (!match.$and) {
                    match.$and = []
                }
                match.$and.push({
                    // Check about no Company key
                    [filterKey]: {
                        $exists: true,
                    },
                })
                match.$and.push({
                    // Check about no Company key
                    [filterKey]: {$ne: null},
                })
            } else {

                if (!match.$or) {
                    match.$or = []
                }
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: {
                        $exists: false,
                    },
                })
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: null,
                })
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: {
                        $size: 0
                    },
                })
            }
            return true
        }
    } else if (type === 'Boolean') {
        if (filterValue === 'true' || filterValue === 'TRUE') {
            filterValue = true
        } else if (filterValue === 'false' || filterValue === 'FALSE') {
            filterValue = false
        }
    } else if (type === 'Float') {
        filterValue = parseFloat(filterValue)
    } else if (type === 'Object' && filterValue && db && db._versionInt >= 5) {
        filterValue = {
            body: `function(data) {return data && Object.keys(data).some(
                key => /${filterValue}/i.test( data[key] && (data[key].constructor===Object || data[key].constructor===Array)?JSON.stringify(data[key]):data[key])
                )}`,
            args: ['$' + filterKey],
            lang: 'js'
        }

        comparator = '$function'
        filterKey = '$expr'
    }

    let matchExpression
    if (['$gt', '$gte', '$lt', '$lte'].indexOf(comparator) >= 0) {
        matchExpression = {[comparator]: type === 'ID' ? filterValue : parseFloat(filterValue)}
    } else if (comparator === '$ne' || comparator === '$eq') {
        if (multi && filterValue && filterValue.constructor !== Array) {
            matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [filterValue]}
        } else if (filterValue === '') {
            matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [null, ""]}

            if (comparator !== '$eq') {
                // array must exist and must not be empty
                matchExpression.$exists = true
                matchExpression.$not = {$size: 0}
            }

        } else if (!filterOptions.inDoubleQuotes && filterValue === 'null') {
            matchExpression = {[comparator]: null}
        } else if (filterValue.constructor === ObjectId) {
            matchExpression = {[comparator]: filterValue}
        } else {
            if (filterOptions.inDoubleQuotes) {
                matchExpression = {[comparator]: filterValue}
            } else if (filterValue === true || filterValue === false) {
                matchExpression = {[comparator]: filterValue}
            } else if (!isNaN(filterValue)) {
                matchExpression = {[comparator]: parseFloat(filterValue)}
            } else if (filterValue && filterValue.constructor === String && filterValue.startsWith('[') && filterValue.endsWith(']')) {
                matchExpression = {
                    '$in': filterValue.substring(1, filterValue.length - 1).split(',').map(f=>{
                        if(f.startsWith('"') && f.endsWith('"')){
                            return f.slice(1, -1)
                        }
                        return f
                    })
                }
            } else {
                matchExpression = {[comparator]: filterValue}
            }
        }
    } else if (comparator === '$regex') {
        let $options, finalValue
        if(filterValue===undefined){
            filterValue = ''
        }

        if(filterValue.constructor!==String){
            // value must be a string
            filterValue = filterValue + ''
        }
        if(rawComperator.indexOf('~')>=0){
            const regParts = filterValue.match(/^\/(.*?)\/([gim]*)$/)
            if (regParts) {
                finalValue = new RegExp(regParts[1], regParts[2])
            } else {
                finalValue = new RegExp(filterValue)
            }
        }else {
            $options= 'i'
            finalValue = ClientUtil.escapeRegex(filterValue)
        }

        if (rawComperator.indexOf('!')>=0) {
            matchExpression = {$not: {[comparator]: finalValue}}
            if($options){
                matchExpression.$not.$options = $options
            }
        } else {
            matchExpression = {[comparator]: finalValue}
            if($options){
                matchExpression.$options = $options
            }
        }
    } else {
        matchExpression = {[comparator]: filterValue}
    }

    if (subQuery) {
        // execute sub query
        const ids = (await db.collection(subQuery.type).find({[subQuery.name]: matchExpression.$not ? matchExpression.$not : matchExpression}).toArray()).map(item => item._id)
        matchExpression = {[matchExpression.$not ? '$nin': '$in']: ids}
    }

    if (!filterOptions || filterOptions.operator === 'or') {
        if (!match.$or) {
            match.$or = []
        }
        match.$or.push({[filterKey]: matchExpression})
    } else {

        if (!match.$and) {
            match.$and = []
        }

        match.$and.push({[filterKey]: matchExpression})
    }
    return true
}




export const addFilterToMatchV2 = async ({
                                           db,
                                           debugInfo,
                                           filterKey,
                                           filterValue,
                                           type,
                                           subQuery,
                                           multi,
                                           filterOptions,
                                           match
                                       }) => {
    const rawComparator = filterOptions?.comparator

    // Resolve comparator, defaulting to $regex
    let comparator = comparatorMap[rawComparator] ?? '$regex'

    // $regex is not meaningful for Boolean / ID / Float – fall back to $eq / $ne
    if (comparator === '$regex' && (type === 'Boolean' || type === 'ID' || type === 'Float')) {
        comparator = rawComparator === '!=' ? '$ne' : '$eq'
    }

    // ── Type-specific value coercion ──────────────────────────────────────────

    if (type === 'ID') {
        if (filterValue) {
            if (filterValue.constructor === ObjectId) {
                // Already an ObjectId – nothing to do
            } else if (filterValue.startsWith('[') && filterValue.endsWith(']')) {
                // Array of IDs: "[id1,id2,...]"
                const rawIds = filterValue.slice(1, -1).split(',')
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

    } else if (type === 'Object' && filterValue && db && db._versionInt >= 5) {
        // Use a server-side JS function to search inside Object fields (MongoDB 5+)
        filterValue = {
            body: `function(data) {return data && Object.keys(data).some(
                key => /${filterValue}/i.test( data[key] && (data[key].constructor===Object || data[key].constructor===Array)?JSON.stringify(data[key]):data[key])
                )}`,
            args: ['$' + filterKey],
            lang: 'js'
        }
        comparator = '$function'
        filterKey  = '$expr'
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

        } else if (!filterOptions.inDoubleQuotes && filterValue === 'null') {
            matchExpression = { [comparator]: null }

        } else if (filterValue?.constructor === ObjectId) {
            matchExpression = { [comparator]: filterValue }

        } else {
            if (filterOptions.inDoubleQuotes) {
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
                    $in: filterValue.slice(1, -1).split(',').map(f =>
                        f.startsWith('"') && f.endsWith('"') ? f.slice(1, -1) : f
                    )
                }
            } else {
                matchExpression = { [comparator]: filterValue }
            }

        }

    } else if (comparator === '$regex') {
        if (filterValue === undefined || filterValue === null) filterValue = ''

        // Ensure string (already coerced above for non-special types, but guard here too)
        if (filterValue.constructor !== String) filterValue = String(filterValue)

        let $options, finalValue

        if (rawComparator.includes('~')) {
            // Treat value as a raw regex literal e.g. /pattern/flags
            const regParts = filterValue.match(/^\/(.*?)\/([gim]*)$/)
            finalValue = regParts ? new RegExp(regParts[1], regParts[2]) : new RegExp(filterValue)
        } else {
            $options   = 'i'
            finalValue = ClientUtil.escapeRegex(filterValue)
        }

        if (rawComparator.includes('!')) {
            matchExpression = { $not: { [comparator]: finalValue } }
            if ($options) matchExpression.$not.$options = $options
        } else {
            matchExpression = { [comparator]: finalValue }
            if ($options) matchExpression.$options = $options
        }

    } else {
        matchExpression = { [comparator]: filterValue }
    }

    // ── SubQuery: resolve IDs from a related collection ───────────────────────
    // Results are cached via Cache to avoid redundant DB round-trips when the
    // same sub-collection + condition appears more than once within a request.
    if (subQuery) {
        const subFilter = matchExpression.$not ?? matchExpression
        const isNegated = Boolean(matchExpression.$not)

        const cacheKey = `subquery:${subQuery.type}:${subQuery.name}:${JSON.stringify(subFilter)}`
        let ids = Cache.get(cacheKey)

        if (!ids) {

            // TODO    const typeDefinition = getType(typeName)
            //         match = extendWithOwnerGroupMatch(typeDefinition, context, match, true)
            ids = (await db.collection(subQuery.type).find({ [subQuery.name]: subFilter }).toArray())
                .map(item => item._id)
            Cache.set(cacheKey, ids, SUBQUERY_CACHE_TTL_MS)
        }

        matchExpression = { [isNegated ? '$nin' : '$in']: ids }
    }

    match.push({ [filterKey]: matchExpression })

    return true
}

// ─── addSearchStringToMatch ───────────────────────────────────────────────────

/*
 * Parses a search input string and converts it into a MongoDB query.
 * Format: conditions separated by "&&", groups enclosed in parentheses,
 * conditions within a group separated by "||". Each condition: "field=value".
 */
const OPERATOR_MAP    = { '||': '$or', '&&': '$and' }
const COMPARATOR_MAP  = { '>': '$gt', '>=': '$gte', '<': '$lt', '<=': '$lte', '=': '$regex', '!=': '$regex', '==': '$eq', '!==': '$ne' }

export const addSearchStringToMatch = (inputString, query) => {
    let subQuery         = query
    let inQuote          = false
    let currTerm         = ''
    let comparator       = ''
    let operator         = ''
    let currField        = ''
    let parenthesisLevel = 0
    const parenthesisParents  = {}
    const parenthesisOperator = {}

    const addToQuery = (mQuery = {}) => {
        const mOperator = OPERATOR_MAP[operator] || '$ukn'
        if (!subQuery[mOperator]) subQuery[mOperator] = []

        // Promote any unresolved ($ukn) entries into the real operator bucket
        if (mOperator !== '$ukn' && subQuery.$ukn) {
            subQuery[mOperator].push(...subQuery.$ukn)
            delete subQuery.$ukn
        }
        subQuery[mOperator].push(mQuery)
        return mQuery
    }

    const pushCurrTerm = () => {
        if (!currField || !currTerm || !comparator) return

        const comp = COMPARATOR_MAP[comparator] || '$eq'
        if (comp.startsWith('$lt') || comp.startsWith('$gt')) {
            currTerm = parseFloat(currTerm)
        }

        const mQuery = { [currField]: { [comp]: currTerm } }
        if (comp === '$regex') {
            // AND-style regex: each whitespace-separated word must match somewhere
            mQuery[currField][comp] = `^${mQuery[currField][comp].split(/\s/).map(f => `(?=.*${f}.*)`).join('')}.*$`
            mQuery[currField].$options = 'i'
        }
        addToQuery(mQuery)
        comparator = currField = currTerm = operator = ''
    }

    for (let i = 0; i < inputString.length; i++) {
        const char = inputString[i]

        if (char === '"') {
            inQuote = !inQuote
        } else if (!inQuote) {
            if (char === '(') {
                parenthesisOperator[parenthesisLevel] = operator
                parenthesisParents[parenthesisLevel]  = subQuery
                parenthesisLevel++
                operator = ''
                subQuery = addToQuery()

            } else if (char === ')') {
                pushCurrTerm()
                parenthesisLevel--
                operator = parenthesisOperator[parenthesisLevel]
                subQuery = parenthesisParents[parenthesisLevel]
                delete parenthesisParents[parenthesisLevel]
                delete parenthesisOperator[parenthesisLevel]

            } else if (char === '|' || char === '&') {
                operator += char
            } else if (char === '=' || char === '<' || char === '>' || char === '!') {
                comparator += char
            } else if (char === ' ') {
                pushCurrTerm()
            } else {
                if (comparator) currTerm  += char
                else            currField += char
            }
        } else {
            currTerm += char
        }
    }

    pushCurrTerm()

    // Flush any remaining $ukn conditions into $and
    if (query.$ukn) {
        if (!query.$and) query.$and = []
        query.$and.push(...query.$ukn)
        delete query.$ukn
    }

    return query
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
        match.$and.push({ [k]: match[k] })
        delete match[k]
    }
}
