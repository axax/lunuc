import {
    batchLookups,
    batchedLookupStages,
    markBatchableLookup,
    isBatchableLookup,
    onlyPerDocumentStages,
    unbatchPipeline,
    containsBatchedLookups,
    DEFAULT_LOOKUP_BATCH_MAX_IDS,
    DEFAULT_LOOKUP_BATCH_MAX_DOCS
} from '../../api/resolver/generic/lookupBatching.mjs'

/* Reference lookup as addGenericTypeLookup builds it for GenericData.teilnehmer -> User */
const teilnehmerLookup = () => markBatchableLookup({
    $lookup: {
        from: 'User',
        localField: 'teilnehmerObjectId',
        foreignField: '_id',
        as: 'data.teilnehmer',
        pipeline: [{$project: {_id: 1, username: 1}}]
    }
})
const resolveStage = {$addFields: {'data.teilnehmer': {$let: {vars: {rows: '$data.teilnehmer'}, in: '$$rows'}}}}
const groupKeyOf = stages => stages.find(s => s.$group).$group._id

describe('lookupBatching', () => {
    describe('markBatchableLookup', () => {
        it('marks only the given stage object', () => {
            const marked = teilnehmerLookup()
            expect(isBatchableLookup(marked)).toBe(true)
            expect(isBatchableLookup({...marked})).toBe(false)
            expect(isBatchableLookup(JSON.parse(JSON.stringify(marked)))).toBe(false)
        })

        it('adds nothing to the stage that would reach MongoDB', () => {
            expect(Object.keys(teilnehmerLookup())).toEqual(['$lookup'])
        })
    })

    describe('batchLookups', () => {
        it('replaces a marked lookup and keeps every other stage as it is', () => {
            const before = {$addFields: {teilnehmerObjectId: '$data.teilnehmer'}}
            const stages = [before, teilnehmerLookup(), resolveStage]
            const result = batchLookups(stages)
            expect(result).not.toBe(stages)
            expect(result[0]).toBe(before)
            expect(result[result.length - 1]).toBe(resolveStage)
            expect(result.map(s => Object.keys(s)[0])).toEqual([
                '$addFields', '$setWindowFields', '$group', '$project', '$lookup',
                '$unwind', '$replaceRoot', '$addFields', '$unset', '$addFields'
            ])
        })

        it('leaves unmarked lookups alone and returns the same array', () => {
            const plain = {$lookup: {from: 'User', localField: 'createdBy', foreignField: '_id', as: 'createdBy'}}
            const stages = [plain, resolveStage]
            expect(batchLookups(stages)).toBe(stages)
        })

        it('leaves marked lookups alone that are not a localField -> _id join', () => {
            const byOtherField = markBatchableLookup({$lookup: {from: 'User', localField: 'x', foreignField: 'email', as: 'y'}})
            const withLet = markBatchableLookup({$lookup: {from: 'User', localField: 'x', foreignField: '_id', as: 'y', let: {a: 1}, pipeline: []}})
            const pipelineOnly = markBatchableLookup({$lookup: {from: 'User', as: 'y', pipeline: []}})
            for (const stage of [byOtherField, withLet, pipelineOnly]) {
                const stages = [stage]
                expect(batchLookups(stages)).toBe(stages)
            }
        })

        it('does nothing for batches of one document or invalid limits', () => {
            const stages = [teilnehmerLookup()]
            expect(batchLookups(stages, {maxDocs: 1})).toBe(stages)
            expect(batchLookups(stages, {maxDocs: 0})).toBe(stages)
            expect(batchLookups(stages, {maxIds: 'abc'})).toBe(stages)
            expect(batchLookups(stages, {maxIds: 2.5})).toBe(stages)
        })

        it('uses the default limits and accepts numbers given as strings (KeyValueGlobal)', () => {
            expect(groupKeyOf(batchLookups([teilnehmerLookup()]))).toEqual({
                ids: {$floor: {$divide: [{$subtract: ['$__lunucLookupCum', 1]}, DEFAULT_LOOKUP_BATCH_MAX_IDS]}},
                docs: {$floor: {$divide: [{$subtract: ['$__lunucLookupNo', 1]}, DEFAULT_LOOKUP_BATCH_MAX_DOCS]}}
            })
            const key = groupKeyOf(batchLookups([teilnehmerLookup()], {maxIds: '200', maxDocs: '10'}))
            expect(key.ids.$floor.$divide[1]).toBe(200)
            expect(key.docs.$floor.$divide[1]).toBe(10)
        })

        it('handles several marked lookups independently', () => {
            const rangliste = markBatchableLookup({$lookup: {from: 'User', localField: 'ranglisteObjectId', foreignField: '_id', as: 'data.rangliste'}})
            const result = batchLookups([teilnehmerLookup(), resolveStage, rangliste])
            expect(result.filter(s => s.$lookup).map(s => s.$lookup.localField)).toEqual(['__lunucLookupIds', '__lunucLookupIds'])
            expect(result.filter(s => s.$setWindowFields)).toHaveLength(2)
            expect(result.filter(s => s.$addFields?.['data.rangliste'])).toHaveLength(1)
        })

        it('passes non-arrays through', () => {
            expect(batchLookups(undefined)).toBeUndefined()
            expect(batchLookups(null)).toBeNull()
        })
    })

    describe('batchedLookupStages', () => {
        const stages = batchedLookupStages(teilnehmerLookup(), {maxIds: 500, maxDocs: 50})
        const [window, group, project, lookup, unwind, replaceRoot, setAs, unset] = stages

        it('counts documents and ids, and bounds a batch by both', () => {
            expect(window.$setWindowFields.output.__lunucLookupNo).toEqual({$documentNumber: {}})
            expect(window.$setWindowFields.output.__lunucLookupCum.window).toEqual({documents: ['unbounded', 'current']})
            expect(JSON.stringify(window.$setWindowFields.output.__lunucLookupCum.$sum)).toContain('$teilnehmerObjectId')
            expect(Object.keys(group.$group._id)).toEqual(['ids', 'docs'])
            expect(group.$group.__lunucLookupDocs).toEqual({$push: '$$ROOT'})
        })

        it('collects the ids of the batch as one distinct list', () => {
            expect(JSON.stringify(group.$group.__lunucLookupIds)).toContain('$teilnehmerObjectId')
            expect(project.$project.__lunucLookupIds.$reduce.in).toEqual({$setUnion: ['$$value', '$$this']})
        })

        it('runs the original lookup once per batch, with its sub-pipeline', () => {
            expect(lookup.$lookup).toEqual({
                from: 'User',
                localField: '__lunucLookupIds',
                foreignField: '_id',
                as: '__lunucLookupRows',
                pipeline: [{$project: {_id: 1, username: 1}}]
            })
        })

        it('restores every document, fills the original field and removes the helpers', () => {
            expect(unwind).toEqual({$unwind: '$__lunucLookupDocs'})
            expect(replaceRoot.$replaceRoot.newRoot.$mergeObjects[0]).toBe('$__lunucLookupDocs')
            expect(setAs).toEqual({$addFields: {'data.teilnehmer': '$__lunucLookupRows'}})
            expect(unset).toEqual({$unset: ['__lunucLookupRows', '__lunucLookupNo', '__lunucLookupCum']})
        })

        it('does not modify the original lookup stage', () => {
            const original = teilnehmerLookup()
            const copy = JSON.parse(JSON.stringify(original))
            batchedLookupStages(original)
            expect(JSON.parse(JSON.stringify(original))).toEqual(copy)
        })
    })

    describe('onlyPerDocumentStages', () => {
        it('accepts stages that treat each document on its own', () => {
            expect(onlyPerDocumentStages([
                {$addFields: {a: 1}}, {$set: {b: 1}}, {$unset: 'c'}, {$project: {d: 1}},
                {$lookup: {from: 'x', as: 'y', pipeline: []}}, {$match: {e: 1}}
            ])).toBe(true)
            expect(onlyPerDocumentStages([])).toBe(true)
            expect(onlyPerDocumentStages(undefined)).toBe(true)
        })

        it('rejects stages that multiply, merge, reorder or cut documents', () => {
            for (const stage of [{$unwind: '$a'}, {$group: {_id: '$a'}}, {$sort: {a: 1}}, {$limit: 1},
                {$skip: 1}, {$facet: {}}, {$sample: {size: 1}}, {$setWindowFields: {}}]) {
                expect(onlyPerDocumentStages([{$addFields: {a: 1}}, stage])).toBe(false)
            }
        })

        it('rejects malformed stages', () => {
            expect(onlyPerDocumentStages([{$addFields: {a: 1}, $unset: 'b'}])).toBe(false)
            expect(onlyPerDocumentStages([null])).toBe(false)
            expect(onlyPerDocumentStages(['$x'])).toBe(false)
        })
    })

    describe('unbatchPipeline', () => {
        it('restores the original lookups inside a $facet', () => {
            const lookup = teilnehmerLookup()
            const plainFacet = [{$limit: 10}, lookup, resolveStage]
            const pipeline = [{$match: {a: 1}}, {$facet: {results: batchLookups(plainFacet), count: [{$count: 'count'}]}}]
            expect(containsBatchedLookups(pipeline)).toBe(true)
            const plain = unbatchPipeline(pipeline)
            expect(plain[0]).toBe(pipeline[0])
            expect(plain[1].$facet.results).toEqual(plainFacet)
            expect(plain[1].$facet.results[1]).toBe(lookup)
            expect(plain[1].$facet.count).toBe(pipeline[1].$facet.count)
        })

        it('restores top-level batched lookups (split query without $facet)', () => {
            const lookup = teilnehmerLookup()
            const pipeline = [{$match: {a: 1}}, {$limit: 10}, ...batchLookups([lookup, resolveStage])]
            const plain = unbatchPipeline(pipeline)
            expect(plain.map(s => Object.keys(s)[0])).toEqual(['$match', '$limit', '$lookup', '$addFields'])
            expect(plain[2]).toBe(lookup)
        })

        it('returns the same array if nothing is batched', () => {
            const pipeline = [{$match: {a: 1}}, {$facet: {results: [{$limit: 1}]}}]
            expect(unbatchPipeline(pipeline)).toBe(pipeline)
            expect(containsBatchedLookups(pipeline)).toBe(false)
        })

        it('does not touch the given pipeline', () => {
            const pipeline = [{$facet: {results: batchLookups([teilnehmerLookup(), resolveStage])}}]
            const length = pipeline[0].$facet.results.length
            unbatchPipeline(pipeline)
            expect(pipeline[0].$facet.results).toHaveLength(length)
        })
    })
})
