/*
 * Passkey login must log in the owner of the credential - never a fixed user (it used to be "admin"),
 * and the generic createWebAuthnCredential must not be usable by anonymous users.
 */
import crypto from 'crypto'
import {ObjectId} from 'mongodb'
import webauthnResolver from '../../extensions/webauthn/resolver/index.js'
import {auth} from '../../api/auth.mjs'
import Util from '../../api/util/index.mjs'
import {decodeToken} from '../../api/util/jwt.mjs'
import {generateRecoveryCodes, hashRecoveryCode} from '../../extensions/webauthn/util/recoveryCodes.mjs'

const HOST = 'example.com'
const sha256 = data => crypto.createHash('sha256').update(data).digest()

const adminId = new ObjectId(), userId = new ObjectId(), blockedId = new ObjectId(), roleId = new ObjectId(), tfaId = new ObjectId()

const createDb = (credentials, extraUsers = []) => {
    const users = [
        {_id: adminId, username: 'admin', role: roleId},
        {_id: userId, username: 'user1', role: roleId},
        {_id: blockedId, username: 'blocked1', role: roleId, blocked: true},
        {_id: tfaId, username: 'tfa1', role: roleId, twoFactor: true},
        ...extraUsers
    ]
    const matches = (doc, q) => Object.keys(q).every(k => String(doc[k]) === String(q[k]))
    return {
            collection: name => ({
            findOne: async q => {
                if (name === 'WebAuthnCredential') return credentials.find(c => matches(c, q)) || null
                if (name === 'UserRole') return {_id: roleId, name: 'subscriber', capabilities: []}
                return users.find(u => matches(u, q)) || null
            },
            findOneAndUpdate: async q => users.find(u => matches(u, q)) || null,
            updateOne: async () => ({modifiedCount: 1}),
            countDocuments: async () => credentials.length,
            insertOne: async doc => {
                credentials.push(doc)
                return {insertedId: new ObjectId()}
            }
        })
    }
}

const createAssertion = async (resolver, session, privateKey, credId, userHandle, flags = 1) => {
    const {challenge} = await resolver.Query.getWebAuthnChallenge({}, {context: {session}})
    const clientData = JSON.stringify({type: 'webauthn.get', challenge: btoa(challenge), origin: 'https://' + HOST})
    const authData = Buffer.concat([sha256(HOST), Buffer.from([flags]), Buffer.from([0, 0, 0, 1])])
    const signer = crypto.createSign('sha256')
    signer.update(authData)
    signer.update(sha256(clientData))
    return {
        id: credId,
        clientData,
        userHandle: Buffer.from(userHandle).toString('base64'),
        authenticatorData: authData.toString('base64'),
        signature: signer.sign(privateKey).toString('base64')
    }
}

const createReq = session => ({
    context: {session, lang: 'en'},
    headers: {'x-forwarded-host': HOST},
    res: {cookie: () => {}}
})

describe('webauthn passkey login', () => {

    const {publicKey, privateKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'P-256'})
    const publicKeyJwk = publicKey.export({format: 'jwk'})

    it('logs in the owner of the credential, not admin', async () => {
        const db = createDb([{credId: 'cred1', publicKey: publicKeyJwk, createdBy: userId}])
        const resolver = webauthnResolver(db)
        const args = await createAssertion(resolver, 's1', privateKey, 'cred1', userId.toString())
        const result = await resolver.Query.loginWebAuthnPasskey(args, createReq('s1'))
        expect(result.user.username).toBe('user1')
        expect(result.user._id.toString()).toBe(userId.toString())
    })

    it('rejects credentials without owner', async () => {
        const db = createDb([{credId: 'cred2', publicKey: publicKeyJwk}])
        const resolver = webauthnResolver(db)
        const args = await createAssertion(resolver, 's2', privateKey, 'cred2', adminId.toString())
        await expect(resolver.Query.loginWebAuthnPasskey(args, createReq('s2'))).rejects.toThrow('Invalid credential')
    })

    it('rejects blocked users', async () => {
        const resolver = webauthnResolver(createDb([{credId: 'cred3', publicKey: publicKeyJwk, createdBy: blockedId}]))
        const args = await createAssertion(resolver, 's3', privateKey, 'cred3', blockedId.toString())
        await expect(resolver.Query.loginWebAuthnPasskey(args, createReq('s3'))).rejects.toThrow('Login not possible')
    })

    it('rejects a userHandle of another user', async () => {
        const db = createDb([{credId: 'cred4', publicKey: publicKeyJwk, createdBy: userId}])
        const resolver = webauthnResolver(db)
        const args = await createAssertion(resolver, 's4', privateKey, 'cred4', adminId.toString())
        await expect(resolver.Query.loginWebAuthnPasskey(args, createReq('s4'))).rejects.toThrow('Invalid user handle')
    })

    it('rejects a reused challenge', async () => {
        const db = createDb([{credId: 'cred5', publicKey: publicKeyJwk, createdBy: userId}])
        const resolver = webauthnResolver(db)
        const args = await createAssertion(resolver, 's5', privateKey, 'cred5', userId.toString())
        await resolver.Query.loginWebAuthnPasskey(args, createReq('s5'))
        await expect(resolver.Query.loginWebAuthnPasskey(args, createReq('s5'))).rejects.toThrow('Invalid challenge')
    })

    it('createWebAuthnCredential is not allowed for anonymous users', async () => {
        const credentials = []
        const resolver = webauthnResolver(createDb(credentials))
        await expect(resolver.Mutation.createWebAuthnCredential(
            {credId: 'x', publicKey: JSON.stringify(publicKeyJwk), userAgent: 'x'},
            {context: {lang: 'en', session: 's6'}}, {}
        )).rejects.toThrow()
        expect(credentials.length).toBe(0)
    })

    it('addWebAuthnPasskey is not allowed for anonymous users', async () => {
        const resolver = webauthnResolver(createDb([]))
        await expect(resolver.Query.addWebAuthnPasskey({id: 'x', clientData: '{}', attestation: ''},
            {context: {lang: 'en'}, headers: {}})).rejects.toThrow()
    })

    it('a 2fa user needs user verification for the passkey login', async () => {
        const db = createDb([{credId: 'cred7', publicKey: publicKeyJwk, createdBy: tfaId}])
        const resolver = webauthnResolver(db)
        let args = await createAssertion(resolver, 's7', privateKey, 'cred7', tfaId.toString())
        await expect(resolver.Query.loginWebAuthnPasskey(args, createReq('s7'))).rejects.toThrow('userVerificationRequired')
        // user present + user verified
        args = await createAssertion(resolver, 's7', privateKey, 'cred7', tfaId.toString(), 0b101)
        const result = await resolver.Query.loginWebAuthnPasskey(args, createReq('s7'))
        expect(result.user.username).toBe('tfa1')
    })

    it('second factor only accepts a passkey of the pending user', async () => {
        const db = createDb([{credId: 'cred8', publicKey: publicKeyJwk, createdBy: userId}, {credId: 'cred9', publicKey: publicKeyJwk, createdBy: tfaId}])
        const resolver = webauthnResolver(db)
        const twoFactorToken = auth.createTwoFactorToken({_id: tfaId})
        let args = await createAssertion(resolver, 's8', privateKey, 'cred8', userId.toString())
        await expect(resolver.Query.loginWebAuthnPasskey({...args, twoFactorToken}, createReq('s8'))).rejects.toThrow('Invalid credential')
        // without user verification - the password was the first factor
        args = await createAssertion(resolver, 's8', privateKey, 'cred9', tfaId.toString())
        const result = await resolver.Query.loginWebAuthnPasskey({...args, twoFactorToken}, createReq('s8'))
        expect(result.user.username).toBe('tfa1')
    })

    it('rejects an invalid pending token', async () => {
        const resolver = webauthnResolver(createDb([]))
        await expect(resolver.Query.loginTwoFactorRecoveryCode({twoFactorToken: 'x', code: 'abcd-efgh-jkmn'}, createReq('s9')))
            .rejects.toThrow('expired')
    })

    it('the pending token is no login token', () => {
        const decoded = decodeToken('JWT ' + auth.createTwoFactorToken({_id: tfaId}), {silent: true})
        expect(decoded.id).toBeUndefined()
    })

    it('recovery codes are unique and normalized', () => {
        const {codes, entries} = generateRecoveryCodes()
        expect(new Set(codes).size).toBe(codes.length)
        expect(codes[0]).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/)
        expect(hashRecoveryCode(codes[0].toUpperCase().replace(/-/g, ' '))).toBe(entries[0].hash)
    })

    it('2fa can only be enabled with a working passkey of the user', async () => {
        const ownId = new ObjectId()
        const password = await Util.hashPasswordAsync('secret123')
        const db = createDb([{credId: 'cred10', publicKey: publicKeyJwk, createdBy: userId}], [{_id: ownId, username: 'own', role: roleId, password}])
        const resolver = webauthnResolver(db)
        const req = {...createReq('s10'), context: {session: 's10', lang: 'en', id: ownId.toString(), username: 'own'}}
        await expect(resolver.Mutation.setTwoFactor({enabled: true, password: 'secret123'}, req)).rejects.toThrow('passkeyRequired')
        // passkey of another user
        const args = await createAssertion(resolver, 's10', privateKey, 'cred10', userId.toString())
        await expect(resolver.Mutation.setTwoFactor({enabled: true, password: 'secret123', passkey: JSON.stringify(args)}, req)).rejects.toThrow('Invalid credential')
    })

    it('asks for a single recovery code if the whole list is pasted', async () => {
        const resolver = webauthnResolver(createDb([]))
        const twoFactorToken = auth.createTwoFactorToken({_id: tfaId})
        await expect(resolver.Query.loginTwoFactorRecoveryCode({twoFactorToken, code: 'abcd-efgh-jkmn\nmnpq-rstu-vwxy'}, createReq('s11')))
            .rejects.toThrow('oneCodeOnly')
    })
})
