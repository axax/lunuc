import {
    llmSessionId, isLlmSessionId, getLlmSession, assertOwner, runInSession, isPageIdle, pruneIdlePages,
    getRegistry, LLM_SESSION_IDLE_MS, DEFAULT_IDLE_MS
} from '../../util/browserSession.mjs'

describe('browserSession', () => {
    beforeEach(() => {
        global._app_ = {}
    })
    afterAll(() => {
        clearInterval(global._app_ && global._app_._browserSessionPruneTimer)
    })

    test('session id of a chat', () => {
        expect(llmSessionId('a1b2-c3')).toBe('llm-a1b2-c3')
        expect(llmSessionId('../x y')).toBe('llm-xy')
        expect(llmSessionId('')).toBe(null)
        expect(isLlmSessionId('llm-a1b2-c3')).toBe(true)
        expect(isLlmSessionId('abc')).toBe(false)
        expect(isLlmSessionId('llm-a/b')).toBe(false)
    })

    test('a session belongs to one user', () => {
        const ctx = getLlmSession('llm-chat1', {userId: 'u1'})
        expect(ctx.llm).toBe(true)
        expect(ctx.idleMs).toBe(LLM_SESSION_IDLE_MS)
        expect(getLlmSession('llm-chat1', {userId: 'u1'})).toBe(ctx)
        expect(() => getLlmSession('llm-chat1', {userId: 'u2'})).toThrow(/another user/)
        expect(() => assertOwner(ctx, 'u2')).toThrow()
        expect(getLlmSession('llm-chat2', {userId: 'u1', create: false})).toBe(null)
        expect(() => getLlmSession('nope', {userId: 'u1'})).toThrow()
    })

    test('actions of a page run one after the other', async () => {
        const ctx = {}
        const order = []
        const slow = runInSession(ctx, async () => {
            expect(ctx.llmBusy).toBe(true)
            await new Promise(r => setTimeout(r, 30))
            order.push('a')
        })
        const failing = runInSession(ctx, async () => { order.push('b'); throw new Error('x') })
        const fast = runInSession(ctx, async () => { order.push('c'); return 42 })
        await slow
        await expect(failing).rejects.toThrow('x')
        expect(await fast).toBe(42)
        expect(order).toEqual(['a', 'b', 'c'])
        expect(ctx.llmBusy).toBe(false)
    })

    test('idle pages are closed, busy or watched ones are kept', async () => {
        const now = Date.now()
        expect(isPageIdle({time: now - DEFAULT_IDLE_MS - 1}, now)).toBe(true)
        expect(isPageIdle({time: now - DEFAULT_IDLE_MS - 1, idleMs: LLM_SESSION_IDLE_MS}, now)).toBe(false)
        expect(isPageIdle({time: 0, llmBusy: true}, now)).toBe(false)
        expect(isPageIdle({time: 0, frameListeners: new Set([() => {}])}, now)).toBe(false)

        const registry = getRegistry()
        registry.old = {time: 0}
        registry.watched = {time: 0, frameListeners: new Set([() => {}])}
        registry.fresh = {time: Date.now()}
        await pruneIdlePages()
        expect(Object.keys(registry).sort()).toEqual(['fresh', 'watched'])
    })
})
