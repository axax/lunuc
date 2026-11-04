import {isRetryableSaveError, getSaveRetryDelay, isOffline, SAVE_RETRY_DELAYS} from '../../extensions/cms/util/saveRetry.mjs'

describe('saveRetry', () => {

    it('retries failures without an answer of the server', () => {
        // shapes as rejected by finalFetch in client/middleware/graphql.js
        expect(isRetryableSaveError({error: new TypeError('Failed to fetch'), loading: false, networkStatus: 8})).toBe(true)
        expect(isRetryableSaveError({error: {message: 'Bad Gateway'}, loading: false, networkStatus: 8})).toBe(true)
    })

    it('does not retry graphql errors, aborts or unknown values', () => {
        expect(isRetryableSaveError({error: {key: 'cms_page_conflict'}, networkStatus: 7})).toBe(false)
        expect(isRetryableSaveError({error: {message: 'no permission'}, networkStatus: 7})).toBe(false)
        expect(isRetryableSaveError({error: {}, networkStatus: 8, aborted: true})).toBe(false)
        expect(isRetryableSaveError(null)).toBe(false)
        expect(isRetryableSaveError('x')).toBe(false)
        expect(isRetryableSaveError(new Error('x'))).toBe(false)
    })

    it('backs off and repeats the last delay', () => {
        expect(getSaveRetryDelay(0)).toBe(SAVE_RETRY_DELAYS[0])
        expect(getSaveRetryDelay(1)).toBe(SAVE_RETRY_DELAYS[1])
        expect(getSaveRetryDelay(99)).toBe(SAVE_RETRY_DELAYS[SAVE_RETRY_DELAYS.length - 1])
        expect(getSaveRetryDelay(-1)).toBe(SAVE_RETRY_DELAYS[0])
    })

    it('detects offline only when the browser says so', () => {
        const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
        try {
            Object.defineProperty(globalThis, 'navigator', {value: {onLine: false}, configurable: true})
            expect(isOffline()).toBe(true)
            Object.defineProperty(globalThis, 'navigator', {value: {onLine: true}, configurable: true})
            expect(isOffline()).toBe(false)
            // node >= 21 has a navigator without onLine
            Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true})
            expect(isOffline()).toBe(false)
        } finally {
            if (desc) Object.defineProperty(globalThis, 'navigator', desc)
            else delete globalThis.navigator
        }
    })
})
