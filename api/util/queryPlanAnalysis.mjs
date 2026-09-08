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

/**
 * Splits the parsed query into fields usable as equality bounds and fields
 * usable as range bounds. Operators that cannot drive index bounds at all
 * ($ne, $nin, $not, $expr, $text) are ignored on purpose.
 */
export const classifyPredicates = (parsedQuery) => {
    const equality = [], range = []

    const walk = (node) => {
        if (!node || node.constructor !== Object) return

        for (const key of Object.keys(node)) {
            const value = node[key]

            if (key === '$and' || key === '$or' || key === '$nor') {
                // $or cannot be served by a single compound index, but its fields
                // are still worth listing - the caller decides what to do with them.
                if (Array.isArray(value)) value.forEach(walk)
                continue
            }
            if (key.startsWith('$')) continue

            if (value?.constructor === Object) {
                const operators = Object.keys(value)
                if (operators.some(op => EQUALITY_OPERATORS.includes(op))) {
                    if (!equality.includes(key)) equality.push(key)
                } else if (operators.some(op => RANGE_OPERATORS.includes(op))) {
                    if (!range.includes(key)) range.push(key)
                }
            } else if (!equality.includes(key)) {
                equality.push(key)
            }
        }
    }

    walk(parsedQuery)
    return {equality, range}
}

/** Flattens a plan tree. Stages chain via inputStage, but some branch via inputStages. */
const collectStages = (root) => {
    const stages = []
    const queue = root ? [root] : []

    while (queue.length) {
        const stage = queue.shift()
        stages.push(stage)
        if (stage.inputStage) queue.push(stage.inputStage)
        if (Array.isArray(stage.inputStages)) queue.push(...stage.inputStages)
    }
    return stages
}

export const analyseQueryPlan = (explanation, pipeline, {documentCount} = {}) => {
    const planner = explanation?.stages?.[0]?.$cursor?.queryPlanner || explanation?.queryPlanner
    if (!planner) return []

    // The SBE engine nests the tree one level deeper than the classic one.
    const stages = collectStages(planner.winningPlan?.queryPlan || planner.winningPlan)

    const {equality, range} = classifyPredicates(planner.parsedQuery)
    const sort = pipeline?.find(stage => stage.$sort)?.$sort

    // ESR - equality first, then the sort fields, then ranges. A range in front
    // would stop every following key from narrowing the scan.
    const suggestedIndex = () => {
        const key = {}
        equality.forEach(field => key[field] = 1)
        Object.keys(sort || {}).forEach(field => {
            if (key[field] === undefined) key[field] = sort[field]
        })
        range.forEach(field => {
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
        findings.push({
            code: 'residualFilter',
            message: `Filtered after the fetch on ${Object.keys(residual.filter).join(', ')} - the index covers only part of the query`,
            suggestedIndex: suggestedIndex()
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
