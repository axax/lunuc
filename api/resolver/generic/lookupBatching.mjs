/**
 * Batched reference lookups.
 *
 * A reference field (e.g. GenericData.teilnehmer -> User) is resolved by a
 * $lookup per document, followed by a stage that rebuilds the array
 * positionally from the id list (addGenericTypeLookup.mjs). On a list page
 * every document runs its own lookup: the pokerhelden player page resolves
 * 193 tournaments with 8003 references to only 416 distinct users - 193
 * lookup executions per field, each user read ~19 times. The per-execution
 * overhead, not the reading, is what costs the time.
 *
 * Here the documents are grouped into batches; each batch runs ONE $lookup
 * with the ids of all its documents, then the documents are restored and every
 * one of them gets the rows of its batch. The rebuild stage that follows picks
 * each position by _id ($indexOfArray) and drops ids without a row, so the
 * rows of other documents are never used - the resolved field is identical.
 *
 * A batch is bounded by BOTH the number of ids and the number of documents:
 *  - ids: the rebuild scans the batch rows for every reference, so the rows of
 *    a batch must stay small (a document with 1000 references gets a batch of
 *    its own instead of 25000 rows);
 *  - documents: $group has to hold the documents of a batch in memory.
 *
 * Only applied to lookups explicitly marked as batchable (markBatchableLookup):
 * a plain $lookup whose `as` array is consumed as a whole would change. The
 * documents leave the batches in a different order, so the caller must only
 * apply this when nothing until a fully determining $sort depends on the
 * order (see AggregationBuilderV2). Requires MongoDB 5.0+ ($setWindowFields);
 * unbatchPipeline() returns the original pipeline for a retry.
 */

export const DEFAULT_LOOKUP_BATCH_MAX_IDS = 500
export const DEFAULT_LOOKUP_BATCH_MAX_DOCS = 50

const batchable = new WeakSet()
// first stage of a batched sequence -> {original, length}
const batchedSequences = new WeakMap()

const PREFIX = '__lunucLookup'
const NO = PREFIX + 'No'
const CUM = PREFIX + 'Cum'
const DOCS = PREFIX + 'Docs'
const IDS = PREFIX + 'Ids'
const ROWS = PREFIX + 'Rows'

/**
 * Marks a {$lookup: {localField, foreignField: '_id', as}} stage whose `as`
 * array is only read by an id-based rebuild in a later stage. Returns the stage.
 */
export const markBatchableLookup = (stage) => {
    if (stage && typeof stage === 'object') batchable.add(stage)
    return stage
}

export const isBatchableLookup = (stage) => batchable.has(stage)

// [] for null/missing, [x] for a scalar, the array itself otherwise
const ensureArray = expr => ({
    $cond: [{$isArray: expr}, expr,
        {$cond: [{$in: [{$type: expr}, ['missing', 'null']]}, [], [expr]]}]
})

const canBatch = (stage) => {
    const lookup = stage?.$lookup
    return !!lookup && isBatchableLookup(stage) &&
        typeof lookup.localField === 'string' && !lookup.localField.startsWith('$') &&
        lookup.foreignField === '_id' && typeof lookup.as === 'string' &&
        !lookup.let && !lookup.as.startsWith(PREFIX)
}

const toLimit = (value, fallback) => {
    const n = Number(value ?? fallback)
    return Number.isInteger(n) && n >= 1 ? n : null
}

/** The stages that replace one batchable $lookup. */
export const batchedLookupStages = (stage, {maxIds = DEFAULT_LOOKUP_BATCH_MAX_IDS, maxDocs = DEFAULT_LOOKUP_BATCH_MAX_DOCS} = {}) => {
    const lookup = stage.$lookup
    const ids = ensureArray('$' + lookup.localField)
    const stages = [
        // running document number and id count (any stable order, the caller re-sorts)
        {
            $setWindowFields: {
                sortBy: {_id: 1},
                output: {
                    [NO]: {$documentNumber: {}},
                    [CUM]: {$sum: {$size: ids}, window: {documents: ['unbounded', 'current']}}
                }
            }
        },
        {
            $group: {
                _id: {
                    ids: {$floor: {$divide: [{$subtract: ['$' + CUM, 1]}, maxIds]}},
                    docs: {$floor: {$divide: [{$subtract: ['$' + NO, 1]}, maxDocs]}}
                },
                [DOCS]: {$push: '$$ROOT'},
                [IDS]: {$push: ids}
            }
        },
        {
            $project: {
                [DOCS]: 1,
                [IDS]: {$reduce: {input: '$' + IDS, initialValue: [], in: {$setUnion: ['$$value', '$$this']}}}
            }
        },
        {$lookup: {...lookup, localField: IDS, as: ROWS}},
        {$unwind: '$' + DOCS},
        {$replaceRoot: {newRoot: {$mergeObjects: ['$' + DOCS, {[ROWS]: '$' + ROWS}]}}},
        {$addFields: {[lookup.as]: '$' + ROWS}},
        {$unset: [ROWS, NO, CUM]}
    ]
    batchedSequences.set(stages[0], {original: stage, length: stages.length})
    return stages
}

/**
 * Returns a new stage list in which every batchable lookup is replaced by its
 * batched form. Other stages are passed through unchanged (same objects).
 * Returns the given array itself if nothing was batched.
 */
export const batchLookups = (stages, {maxIds, maxDocs} = {}) => {
    if (!Array.isArray(stages)) return stages
    const ids = toLimit(maxIds, DEFAULT_LOOKUP_BATCH_MAX_IDS)
    const docs = toLimit(maxDocs, DEFAULT_LOOKUP_BATCH_MAX_DOCS)
    // a batch of one document is the original per-document lookup plus overhead
    if (!ids || !docs || docs < 2) return stages
    let changed = false
    const result = []
    for (const stage of stages) {
        if (canBatch(stage)) {
            result.push(...batchedLookupStages(stage, {maxIds: ids, maxDocs: docs}))
            changed = true
        } else {
            result.push(stage)
        }
    }
    return changed ? result : stages
}

// Stages that treat every document on its own: they neither change the number
// of documents per _id nor depend on the order of the documents.
const PER_DOCUMENT_STAGES = new Set(['$addFields', '$set', '$unset', '$project', '$lookup', '$match', '$replaceRoot', '$replaceWith'])

/** true if every stage is a single per-document stage (see PER_DOCUMENT_STAGES). */
export const onlyPerDocumentStages = (stages) =>
    (stages || []).every(stage => {
        if (!stage || stage.constructor !== Object) return false
        const keys = Object.keys(stage)
        return keys.length === 1 && PER_DOCUMENT_STAGES.has(keys[0])
    })

const unbatchStages = (stages) => {
    let changed = false
    const result = []
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i]
        const sequence = batchedSequences.get(stage)
        if (sequence) {
            result.push(sequence.original)
            i += sequence.length - 1
            changed = true
        } else if (stage?.$facet && stage.$facet.constructor === Object) {
            let facetChanged = false
            const facet = {}
            for (const [key, sub] of Object.entries(stage.$facet)) {
                const plain = Array.isArray(sub) ? unbatchStages(sub) : sub
                if (plain !== sub) facetChanged = true
                facet[key] = plain
            }
            if (facetChanged) changed = true
            result.push(facetChanged ? {...stage, $facet: facet} : stage)
        } else {
            result.push(stage)
        }
    }
    return changed ? result : stages
}

/**
 * The pipeline without batching (top level and $facet sub-pipelines), or the
 * given array itself if it contains no batched lookup. For a retry after
 * MongoDB rejected the batched form.
 */
export const unbatchPipeline = (pipeline) => Array.isArray(pipeline) ? unbatchStages(pipeline) : pipeline

export const containsBatchedLookups = (pipeline) => unbatchPipeline(pipeline) !== pipeline
