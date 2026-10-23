import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import {AUTH_SCHEME,SECRET_KEY} from '../constants/index.mjs'


export const decodeToken = (token) => {
    let result = {}
    if (token) {
        const matches = token.match(/(\S+)\s+(\S+)/)
        if (matches && matches.length > 1 && matches[1] === AUTH_SCHEME) {
            // verify a token symmetric - synchronous
            jwt.verify(matches[2], SECRET_KEY, (err, decoded) => {
                if (!err) {
                    result = decoded
                } else {
                    console.error('decodeToken verify error', err)
                }
            })
        }
        result.auth = token
    }
    return result
}


/*
 * Secrets at rest (API keys in settings): AES-256-GCM, "enc:v1:<iv>:<tag>:<data>".
 * Key derived from SECRET_KEY (the installation's own secret) - it must be the
 * same on every server that reads the values. LUNUC_ENCRYPTION_KEY can set a
 * separate one; changing the key makes stored values unreadable.
 */
const ENC_PREFIX = 'enc:v1:'
let _encKey = null, _encKeySource = null
const encryptionKey = () => {
    const source = process.env.LUNUC_ENCRYPTION_KEY || SECRET_KEY || ''
    if (!source) return null
    if (source !== _encKeySource) {
        _encKey = crypto.createHash('sha256').update('lunuc-secret:' + source).digest()
        _encKeySource = source
    }
    return _encKey
}

export const canEncryptSecrets = () => !!encryptionKey()

export const isEncryptedSecret = value => typeof value === 'string' && value.startsWith(ENC_PREFIX)

// returns the value unchanged when no key is configured
export const encryptSecret = (plain) => {
    if (plain === undefined || plain === null || plain === '' || isEncryptedSecret(plain)) return plain
    const key = encryptionKey()
    if (!key) return plain
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
    return ENC_PREFIX + [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join(':')
}

// Anything that is not encrypted passes through unchanged. A value that cannot
// be decrypted (key missing or changed) yields '' - never the cipher text.
let _decryptWarned = false
export const decryptSecret = (value) => {
    if (!isEncryptedSecret(value)) return value
    try {
        const key = encryptionKey()
        if (!key) throw new Error('no encryption key')
        const [iv, tag, data] = value.slice(ENC_PREFIX.length).split(':').map(s => Buffer.from(s, 'base64'))
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    } catch (e) {
        if (!_decryptWarned) {
            _decryptWarned = true
            console.warn('decryptSecret: cannot decrypt a value:', e.message)
        }
        return ''
    }
}

// "••••1a2b" - for displaying that a secret is set
export const maskSecret = (value) => {
    const plain = decryptSecret(value)
    if (!plain) return ''
    return '••••' + (plain.length > 8 ? plain.slice(-4) : '')
}
