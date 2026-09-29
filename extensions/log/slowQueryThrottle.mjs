/**
 * Throttling for the slow query log - see extensions/log/server.mjs.
 */

export const SLOW_QUERY_THRESHOLD_MS = 1000
export const SLOW_QUERY_LOG_INTERVAL_MS = 10 * 60 * 1000
const SLOW_QUERY_MAX_SHAPES = 2000

const slowQueryShapes = new Map() // shapeKey -> {lastLoggedAt, suppressed, running}

/**
 * Structure of a pipeline without its values: {definition: ObjectId(..)} and
 * {definition: ObjectId(...other)} give the same shape, a different field or
 * operator does not. Same idea as MongoDB's queryShapeHash, which is only
 * known after the explain we want to avoid.
 */
export const pipelineShape = (value) => {
    if (Array.isArray(value)) {
        return value.every(v => v === null || typeof v !== 'object' || v.constructor?.name === 'ObjectId')
            ? '[?]'
            : value.map(pipelineShape)
    }
    if (value && typeof value === 'object' && value.constructor === Object) {
        const out = {}
        for (const key of Object.keys(value)) out[key] = pipelineShape(value[key])
        return out
    }
    return '?'
}

export const shapeKeyOf = (collectionName, dataQuery) =>
    collectionName + ':' + JSON.stringify(pipelineShape(dataQuery))

/** Decides whether this slow query gets a log entry now; counts it otherwise. */
export const claimSlowQueryLog = (shapeKey, now = Date.now(), shapes = slowQueryShapes) => {
    let state = shapes.get(shapeKey)
    if (!state) {
        if (shapes.size >= SLOW_QUERY_MAX_SHAPES) {
            // drop the oldest entries - Map keeps insertion order
            for (const key of shapes.keys()) {
                shapes.delete(key)
                if (shapes.size < SLOW_QUERY_MAX_SHAPES * 0.9) break
            }
        }
        state = {lastLoggedAt: -Infinity, suppressed: 0, running: false}
        shapes.set(shapeKey, state)
    }
    if (state.running || now - state.lastLoggedAt < SLOW_QUERY_LOG_INTERVAL_MS) {
        state.suppressed++
        return null
    }
    const suppressed = state.suppressed
    state.suppressed = 0
    state.lastLoggedAt = now
    state.running = true
    return {suppressed, done: () => { state.running = false }}
}

