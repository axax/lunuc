import {
    draftKey, createDraft, readDraft, writeDraft, removeDraft, pruneDrafts, evaluateDraft, DRAFT_MAX_AGE, DRAFT_PREFIX
} from '../../extensions/cms/util/cmsDraft.mjs'

const memoryStorage = (quota = Infinity) => {
    const data = new Map()
    return {
        data,
        get length() {
            return data.size
        },
        key: i => Array.from(data.keys())[i] ?? null,
        getItem: k => data.has(k) ? data.get(k) : null,
        setItem: (k, v) => {
            const used = Array.from(data.entries()).reduce((n, [key, val]) => n + (key === k ? 0 : val.length), 0)
            if (used + v.length > quota) {
                const e = new Error('QuotaExceededError')
                e.name = 'QuotaExceededError'
                throw e
            }
            data.set(k, String(v))
        },
        removeItem: k => data.delete(k)
    }
}

const NOW = 1_800_000_000_000

describe('cmsDraft', () => {

    it('builds a key per page and version', () => {
        expect(draftKey('abc', undefined)).toBe(DRAFT_PREFIX + ':abc')
        expect(draftKey('abc', 'v2')).toBe(DRAFT_PREFIX + 'v2:abc')
    })

    it('keeps only versioned string fields', () => {
        const draft = createDraft({
            pageId: 'p1', slug: 's', now: NOW,
            values: {template: '{"t":"div"}', public: true, name: {de: 'x'}, style: 'a{}'},
            baseValues: {template: '{}', style: ['', 'b{}']}
        })
        expect(Object.keys(draft.values).sort()).toEqual(['style', 'template'])
        expect(draft.base.style).toHaveLength(2)
        expect(createDraft({pageId: 'p1', values: {public: true}, baseValues: {}, now: NOW})).toBeNull()
    })

    it('writes, reads and removes a draft', () => {
        const storage = memoryStorage()
        const key = draftKey('p1')
        const draft = createDraft({pageId: 'p1', values: {template: 'new'}, baseValues: {template: 'old'}, now: NOW})
        expect(writeDraft(storage, key, draft, NOW)).toBe(true)
        expect(readDraft(storage, key)).toEqual(draft)
        removeDraft(storage, key)
        expect(readDraft(storage, key)).toBeNull()
    })

    it('never throws on missing or broken storage', () => {
        expect(readDraft(null, 'x')).toBeNull()
        expect(writeDraft(null, 'x', {}, NOW)).toBe(false)
        const storage = memoryStorage()
        storage.setItem('k', '{broken')
        expect(readDraft(storage, 'k')).toBeNull()
        const throwing = {getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') }, length: 0, key: () => null}
        expect(readDraft(throwing, 'k')).toBeNull()
        expect(writeDraft(throwing, 'k', {v: 1}, NOW)).toBe(false)
        expect(() => removeDraft(throwing, 'k')).not.toThrow()
    })

    it('frees space by removing expired drafts of other pages when the storage is full', () => {
        const storage = memoryStorage(400)
        const old = createDraft({pageId: 'old', values: {template: 'x'.repeat(250)}, baseValues: {}, now: NOW - DRAFT_MAX_AGE - 1})
        storage.setItem(draftKey('old'), JSON.stringify(old))
        const draft = createDraft({pageId: 'p1', values: {template: 'y'.repeat(100)}, baseValues: {}, now: NOW})
        expect(writeDraft(storage, draftKey('p1'), draft, NOW)).toBe(true)
        expect(storage.getItem(draftKey('old'))).toBeNull()
    })

    it('prunes expired and broken drafts, keeps fresh ones and foreign keys', () => {
        const storage = memoryStorage()
        storage.setItem(draftKey('fresh'), JSON.stringify(createDraft({pageId: 'fresh', values: {template: 'a'}, baseValues: {}, now: NOW})))
        storage.setItem(draftKey('old'), JSON.stringify(createDraft({pageId: 'old', values: {template: 'a'}, baseValues: {}, now: NOW - DRAFT_MAX_AGE})))
        storage.setItem(draftKey('broken'), 'nope')
        storage.setItem('otherApp', 'keep')
        pruneDrafts(storage, NOW)
        expect(storage.getItem(draftKey('fresh'))).not.toBeNull()
        expect(storage.getItem(draftKey('old'))).toBeNull()
        expect(storage.getItem(draftKey('broken'))).toBeNull()
        expect(storage.getItem('otherApp')).toBe('keep')
    })

    describe('evaluateDraft', () => {
        const draft = createDraft({
            pageId: 'p1', now: NOW,
            values: {template: 'mine', style: 'same'},
            baseValues: {template: 'loaded', style: 'loaded-style'}
        })

        it('is restorable when the server still has the base value', () => {
            const r = evaluateDraft(draft, {template: 'loaded', style: 'same'}, NOW + 1000)
            expect(r.status).toBe('restorable')
            // style is already on the server: only the template is restored
            expect(r.values).toEqual({template: 'mine'})
            expect(r.fields).toEqual(['template'])
        })

        it('is saved when the server has all values', () => {
            expect(evaluateDraft(draft, {template: 'mine', style: 'same'}, NOW).status).toBe('saved')
        })

        it('is stale when someone else saved the field meanwhile', () => {
            expect(evaluateDraft(draft, {template: 'someone else', style: 'same'}, NOW).status).toBe('stale')
        })

        it('accepts every listed base (value of a save that was still on its way)', () => {
            const d = createDraft({pageId: 'p1', now: NOW, values: {template: 'v3'}, baseValues: {template: ['v1', 'v2']}})
            expect(evaluateDraft(d, {template: 'v1'}, NOW).status).toBe('restorable')
            expect(evaluateDraft(d, {template: 'v2'}, NOW).status).toBe('restorable')
            expect(evaluateDraft(d, {template: 'v9'}, NOW).status).toBe('stale')
        })

        it('treats a never saved field (undefined) as base', () => {
            const d = createDraft({pageId: 'p1', now: NOW, values: {script: 'new'}, baseValues: {script: undefined}})
            expect(evaluateDraft(d, {}, NOW).status).toBe('restorable')
        })

        it('ignores expired or invalid drafts', () => {
            expect(evaluateDraft(draft, {}, NOW + DRAFT_MAX_AGE).status).toBe('none')
            expect(evaluateDraft(null, {}, NOW).status).toBe('none')
            expect(evaluateDraft({v: 2}, {}, NOW).status).toBe('none')
        })
    })
})
