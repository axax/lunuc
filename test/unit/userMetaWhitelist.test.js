import {applyUserMetaWhitelist, DEFAULT_USER_META_WHITELIST as W} from '../../api/util/userMetaWhitelist.mjs'

describe('applyUserMetaWhitelist', () => {
    const db = {virtualId: '123', mobile: '0791', mobileVerified: true, newsletterConsent: {status: 'unsubscribed'}, newsletterAsked: true, addresses: [{firstname: 'A'}]}

    it('keeps keys the server writes, takes allowed keys from the browser', () => {
        const r = applyUserMetaWhitelist({virtualId: '999', mobileVerified: true, newsletterConsent: {status: 'subscribed'}, addresses: [{firstname: 'B'}], mobile: '0791'}, db, W)
        expect(r.meta.virtualId).toBe('123')
        expect(r.meta.newsletterConsent).toEqual({status: 'unsubscribed'})
        expect(r.meta.addresses).toEqual([{firstname: 'B'}])
        expect(r.ignored.sort()).toEqual(['newsletterConsent', 'virtualId'])
    })

    it('resets <key>Verified when the value changes', () => {
        const r = applyUserMetaWhitelist({mobile: '0792', mobileVerified: true}, db, W)
        expect(r.meta.mobile).toBe('0792')
        expect(r.meta.mobileVerified).toBe(false)
    })

    it('keeps allowed keys that were not sent, null removes a value', () => {
        const r = applyUserMetaWhitelist({cv: null}, db, W)
        expect(r.meta.newsletterAsked).toBe(true)
        expect(r.meta.cv).toBe(null)
    })

    it('drops not allowed keys on sign up', () => {
        const r = applyUserMetaWhitelist({origin: 'x', newsletterOptIn: true, virtualId: 'x', mobileVerified: true}, null, W)
        expect(r.meta).toEqual({origin: 'x', newsletterOptIn: true})
    })
})
