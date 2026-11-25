import crypto from 'crypto'

// without 0/o, 1/l/i - easier to type from a printout
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const CODE_LENGTH = 12 // ~59 bit per code
export const RECOVERY_CODE_COUNT = 10

export const normalize = code => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// codes are random with high entropy - a plain sha256 is enough (no slow password hash needed)
export const hashRecoveryCode = code => crypto.createHash('sha256').update(normalize(code)).digest('hex')

// returns the plain codes (shown once) and the entries to store
export const generateRecoveryCodes = () => {
    const codes = [], entries = []
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        let raw = ''
        for (let j = 0; j < CODE_LENGTH; j++) {
            raw += ALPHABET[crypto.randomInt(ALPHABET.length)]
        }
        const code = raw.match(/.{4}/g).join('-')
        codes.push(code)
        entries.push({hash: hashRecoveryCode(code)})
    }
    return {codes, entries}
}

export const countUnusedRecoveryCodes = user =>
    (user?.twoFactorRecoveryCodes || []).reduce((n, c) => c.usedAt ? n : n + 1, 0)

// marks the code as used - atomic, so a code works only once even with parallel requests
export const consumeRecoveryCode = async (db, userId, code) => {
    if (normalize(code).length !== CODE_LENGTH) {
        return false
    }
    const result = await db.collection('User').updateOne(
        {_id: userId, twoFactorRecoveryCodes: {$elemMatch: {hash: hashRecoveryCode(code), usedAt: null}}},
        {$set: {'twoFactorRecoveryCodes.$.usedAt': new Date().getTime()}}
    )
    return result.modifiedCount === 1
}
