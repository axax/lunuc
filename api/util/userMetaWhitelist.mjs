/*
 Keys of user.meta a user may set himself (mutations updateMe and signUp - the data comes from the
 browser). Every other key keeps the value from the db (updateMe) or is dropped (signUp), so keys that
 only the server writes can't be faked: e.g. virtualId, mobileVerified, newsletterConsent.
 Admins (updateUser), hooks and server scripts are not restricted.

 Default: all keys the pages currently write. Can be replaced in the KeyValueGlobal
 "UserMetaWhitelist": {"default": [...], "<user domain>": [...]} (a domain list replaces the default).
 */
import Util from './index.mjs'
import Cache from '../../util/cache.mjs'

export const DEFAULT_USER_META_WHITELIST = [
    // account pages, address book, checkout
    'addresses', 'address', 'mobile', 'selectedBillingAdr', 'selectedDeliveryAdr',
    // settings
    'newsletter', 'benachrichtigungen', 'description', 'bgimage',
    'hideDescription', 'hideHistory', 'hidePayout', 'hideName',
    // documents (ibtpersonal)
    'cv', 'docs',
    // sign up (newsletter, newsletterList, newsletterLocation: extension newsletter, verlosung: lixs)
    'origin', 'terms', 'newsletterOptIn', 'newsletterAsked', 'newsletterList', 'newsletterLocation', 'verlosung'
]

// cleared with the KeyValueGlobal cache of the key (setKeyValueGlobal / admin changes)
const CACHE_KEY = 'KeyValueGlobal_UserMetaWhitelist#resolved'

export const getUserMetaWhitelist = async (db, domain) => {
    let conf = Cache.get(CACHE_KEY)
    if (conf === undefined) {
        // stored as object, also when there is no KeyValueGlobal (no db query on every call)
        conf = {value: await Util.getKeyValueGlobal(db, null, 'UserMetaWhitelist', true) || null}
        Cache.set(CACHE_KEY, conf, 3600000)
    }
    const value = conf.value
    if (value && value.constructor === Object) {
        if (domain && Array.isArray(value[domain])) return value[domain]
        if (Array.isArray(value.default)) return value.default
    }
    return DEFAULT_USER_META_WHITELIST
}

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * @param newMeta     meta sent by the browser
 * @param currentMeta meta in the db (null for a new user)
 * @returns {meta, ignored: keys that were sent with another value but are not allowed}
 */
export const applyUserMetaWhitelist = (newMeta, currentMeta, whitelist) => {
    const current = currentMeta && currentMeta.constructor === Object ? currentMeta : {}
    // start with the db: not allowed keys always keep their value, allowed keys that were not sent too
    // (pages send the meta from page load - a key set in the meantime e.g. by the server is kept;
    // to remove a value a page sends null)
    const meta = Object.assign({}, current)
    const ignored = []
    for (const k of Object.keys(newMeta || {})) {
        if (whitelist.includes(k)) {
            meta[k] = newMeta[k]
        } else if (!same(newMeta[k], current[k])) {
            ignored.push(k)
        }
    }
    // a changed value (e.g. mobile) is not verified anymore (<key>Verified is set by the server)
    for (const k of whitelist) {
        if (current[k + 'Verified'] !== undefined && !whitelist.includes(k + 'Verified') && !same(meta[k], current[k])) {
            meta[k + 'Verified'] = false
        }
    }
    return {meta, ignored}
}
