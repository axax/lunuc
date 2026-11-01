/*
 * Passkey login must log in the owner of the credential - never a fixed user (it used to be "admin"),
 * and the generic createWebAuthnCredential must not be usable by anonymous users.
 */
import crypto from 'crypto'
import {ObjectId} from 'mongodb'
import webauthnResolver from '../../extensions/webauthn/resolver/index.js'

const HOST = 'example.com'
const sha256 = data => crypto.createHash('sha256').update(data).digest()

const adminId = new ObjectId(), userId = new ObjectId(), blockedId = new ObjectId(), roleId = new ObjectId()

const createDb = (credentials) => {
    const users = [
        {_id: adminId, username: 'admin', role: roleId},
        {_id: userId, username: 'user1', role: roleId},
        {_id: blockedId, username: 'blocked1', role: roleId, blocked: true}
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
            insertOne: async doc => {
                credentials.push(doc)
                return {insertedId: new ObjectId()}
            }
        })
    }
}

const createAssertion = async (resolver, session, privateKey, credId, userHandle) => {
    const {challenge} = await resolver.Query.getWebAuthnChallenge({}, {context: {session}})
    const clientData = JSON.stringify({type: 'webauthn.get', challenge: btoa(challenge), origin: 'https://' + HOST})
    const authData = Buffer.concat([sha256(HOST), Buffer.from([1]), Buffer.from([0, 0, 0, 1])])
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
})
