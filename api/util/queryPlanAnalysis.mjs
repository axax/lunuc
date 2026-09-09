/**
 * Derives improvement hints from a queryPlanner explain.
 *
 * Everything here is read from the plan MongoDB returns anyway - nothing is
 * executed. That is the whole point: an explain that runs the query is exactly
 * what must not happen on a query that is already slow.
 *
 * The findings are hints, not verdicts. Without executionStats the plan says
 * nothing about how many documents were actually touched, which is why the
 * scan-related findings are suppressed for small collections.
 */

// Below this many documents a collection scan is usually faster than an index
// lookup, so reporting one would be noise.
export const SMALL_COLLECTION_THRESHOLD = 1000

const RANGE_OPERATORS = ['$gt', '$gte', '$lt', '$lte']
// $in produces index bounds just like an equality does, so ESR treats it as one.
const EQUALITY_OPERATORS = ['$eq', '$in']
const BRANCH_OPERATORS = ['$and', '$or', '$nor']

const push = (list, value) => {
    if (!list.includes(value)) list.push(value)
}

/**
 * Field order as written in the pipeline's $match.
 *
 * parsedQuery cannot be used for this: MongoDB normalises it alphabetically,
 * which loses the order the developer wrote - and that order usually reflects
 * which field is the selective one. ESR only says which GROUP a field belongs
 * to, never how to order fields within a group.
 */
export const fieldOrderFromMatch = (pipeline) => {
    const order = []

    const walk = (node) => {
        if (!node || node.constructor !== Object) return

        for (const key of Object.keys(node)) {
            if (BRANCH_OPERATORS.includes(key)) {
                if (Array.isArray(node[key])) node[key].forEach(walk)
            } else if (!key.startsWith('$')) {
                push(order, key)
            }
        }
    }

    walk(pipeline?.find(stage => stage.$match)?.$match)
    return order
}

/** Every field name inside a filter expression, at any nesting depth. */
export const collectFilterFields = (filter) => {
    const fields = []

    const walk = (node) => {
        if (!node || node.constructor !== Object) return

        for (const key of Object.keys(node)) {
            if (key.startsWith('$')) {
                const value = node[key]
                if (Array.isArray(value)) value.forEach(walk)
                else walk(value)
            } else {
                push(fields, key)
            }
        }
    }

    walk(filter)
    return fields
}

/**
 * Splits the parsed query into fields usable as equality bounds, fields usable
 * as range bounds, and fields that cannot be bound at all because they sit in
 * an $or spanning several fields.
 *
 * Operators that produce no index bounds ($ne, $nin, $not, $expr, $text) are
 * ignored on purpose.
 */
export const classifyPredicates = (parsedQuery) => {
    const result = {equality: [], range: [], orFields: []}

    const walk = (node, target) => {
        if (!node || node.constructor !== Object) return

        for (const key of Object.keys(node)) {
            const value = node[key]

            if (key === '$and') {
                if (Array.isArray(value)) value.forEach(entry => walk(entry, target))
                continue
            }

            if (key === '$or' || key === '$nor') {
                // An $or over ONE field behaves like an $in and stays indexable.
                // Spanning several fields it does not: a single index scan cannot
                // bound two different fields, so the whole $or degrades into a
                // post-fetch filter. Putting those fields into a suggested index
                // would be wrong - they are alternatives, not a conjunction.
                const branch = {equality: [], range: [], orFields: []}
                if (Array.isArray(value)) value.forEach(entry => walk(entry, branch))

                const fields = [...new Set([...branch.equality, ...branch.range])]
                if (fields.length === 1) push(target.equality, fields[0])
                else fields.forEach(field => push(target.orFields, field))
                continue
            }

            if (key.startsWith('$')) continue

            if (value?.constructor === Object) {
                const operators = Object.keys(value)
                if (operators.some(op => EQUALITY_OPERATORS.includes(op))) push(target.equality, key)
                else if (operators.some(op => RANGE_OPERATORS.includes(op))) push(target.range, key)
            } else {
                push(target.equality, key)
            }
        }
    }

    walk(parsedQuery, result)

    // A field blocked by an $or must not end up in the suggested key.
    result.equality = result.equality.filter(field => !result.orFields.includes(field))
    result.range = result.range.filter(field => !result.orFields.includes(field))

    return result
}

export const analyseQueryPlan = (explanation, pipeline, {documentCount} = {}) => {
    const planner = explanation?.stages?.[0]?.$cursor?.queryPlanner || explanation?.queryPlanner
    if (!planner) return []

    // The SBE engine nests the tree one level deeper than the classic one.
    const stages = []
    const queue = []
    const root = planner.winningPlan?.queryPlan || planner.winningPlan
    if (root) queue.push(root)

    while (queue.length) {
        const stage = queue.shift()
        stages.push(stage)
        if (stage.inputStage) queue.push(stage.inputStage)
        if (Array.isArray(stage.inputStages)) queue.push(...stage.inputStages)
    }

    const {equality, range, orFields} = classifyPredicates(planner.parsedQuery)
    const sort = pipeline?.find(stage => stage.$sort)?.$sort

    // Order within the equality group follows the pipeline, not parsedQuery.
    const matchOrder = fieldOrderFromMatch(pipeline)
    const byMatchOrder = (a, b) => {
        const indexA = matchOrder.indexOf(a), indexB = matchOrder.indexOf(b)
        return (indexA < 0 ? Number.MAX_SAFE_INTEGER : indexA) -
               (indexB < 0 ? Number.MAX_SAFE_INTEGER : indexB)
    }

    // ESR - equality first, then the sort fields, then ranges. A range in front
    // would stop every following key from narrowing the scan.
    const suggestedIndex = () => {
        const key = {}
        ;[...equality].sort(byMatchOrder).forEach(field => key[field] = 1)
        Object.keys(sort || {}).forEach(field => {
            if (key[field] === undefined) key[field] = sort[field]
        })
        ;[...range].sort(byMatchOrder).forEach(field => {
            if (key[field] === undefined) key[field] = 1
        })
        return Object.keys(key).length > 0 ? key : undefined
    }

    const findings = []
    const bigEnough = documentCount === undefined || documentCount >= SMALL_COLLECTION_THRESHOLD

    if (stages.some(stage => stage.stage === 'COLLSCAN') && bigEnough) {
        findings.push({
            code: 'collscan',
            message: 'No index was used - every document is read',
            suggestedIndex: suggestedIndex()
        })
    }

    const sortStage = stages.find(stage => stage.stage === 'SORT')
    if (sortStage && bigEnough) {
        findings.push({
            code: 'blockingSort',
            message: `Sorting by ${JSON.stringify(sortStage.sortPattern)} happens in memory instead of coming from an index`,
            suggestedIndex: suggestedIndex()
        })
    }

    const residual = stages.find(stage => stage.stage === 'FETCH' && stage.filter)
    if (residual) {
        const fields = collectFilterFields(residual.filter)
        findings.push({
            code: 'residualFilter',
            message: `Filtered after the fetch on ${fields.join(', ') || '(no field names)'}` +
                ' - the index covers only part of the query',
            fields,
            suggestedIndex: suggestedIndex()
        })
    }

    // The decisive one for a wildcard index: it has a single $_path key, so one
    // scan can bind exactly one path. An $or over several fields therefore has
    // no indexable form at all and stays a post-fetch filter.
    if (orFields.length > 1) {
        findings.push({
            code: 'orAcrossFields',
            message: `The $or spans ${orFields.join(', ')} - one index scan cannot bound several fields, ` +
                'so this stays a post-fetch filter. Normalising the data to a single field is what makes it indexable',
            fields: orFields
        })
    }

    // Several equally good indexes mean the planner has to compare them on every
    // cache miss, and each candidate runs the filter during its trial phase.
    if (planner.rejectedPlans?.length >= 3) {
        findings.push({
            code: 'manyCandidates',
            message: `${planner.rejectedPlans.length + 1} candidate plans - likely redundant indexes sharing a prefix`
        })
    }

    if (JSON.stringify(planner.parsedQuery || {}).includes('$function')) {
        findings.push({
            code: 'notIndexable',
            message: 'The match contains server-side JavaScript ($function), which no index can serve'
        })
    }

    return findings
}
