import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import {ObjectId} from 'mongodb'
import {
    checkClientParams, checkOidcAuthorizeParams, clientCredentials, createOidcTokenResponse,
    isOidcClient, oidcCodeData, oidcDiscovery, oidcJwks, oidcUserInfo, resetSigningKeyCache, verifyPkce
} from '../../extensions/oauth/oidc.mjs'

const b64url = b => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())

const existingClient = {clientId: 'office', allowedScopes: 'user:read', allowedRedirectUris: ''}
const existingClientWl = {clientId: 'blnd', allowedScopes: 'user:read', allowedRedirectUris: 'https://a.ch/cb\nhttps://b.ch/cb'}
const oidcClient = {_id: new ObjectId(), clientId: 'online-pokerraum', allowedScopes: 'openid profile', allowedRedirectUris: 'https://online.pokerraum.ch/auth/pokerraum/callback'}

const userId = new ObjectId()
const pictureId = new ObjectId()
const users = {
    [userId.toString()]: {_id: userId, username: 'spieler1', picture: pictureId, meta: {virtualId: '10409', addresses: [{firstname: 'Max', lastname: 'Muster'}]}}
}
const kv = {}
const fakeDb = {
    collection: name => ({
        findOne: async q => name === 'User' ? (users[q._id.toString()] || null) : (kv[q.key] || null),
        updateOne: async (q, u) => {
            if (!kv[q.key]) kv[q.key] = {...u.$setOnInsert}
        }
    })
}
const fakeReq = (headers = {}, body) => ({headers: {host: 'pokerraum.ch', ...headers}, body})
const fakeRes = () => {
    const r = {statusCode: 200, headers: {}}
    r.set = (k, v) => { Object.assign(r.headers, typeof k === 'object' ? k : {[k]: v}); return r }
    r.status = c => { r.statusCode = c; return r }
    r.json = b => { r.body = b; return r }
    return r
}

describe('oauth oidc', () => {
    beforeEach(() => resetSigningKeyCache())

    it('existing clients keep their behavior', () => {
        expect(isOidcClient(existingClient)).toBe(false)
        expect(checkClientParams(existingClient, {redirect_uri: 'https://anything/cb', scope: 'user:read'})).toBe(null)
        expect(checkClientParams(existingClientWl, {redirect_uri: 'https://b.ch/cb'})).toBe(null)
        expect(checkClientParams(existingClientWl, {redirect_uri: 'https://evil/cb'})).toBe('invalid_redirect_uri')
        expect(checkClientParams(existingClient, {redirect_uri: 'x', scope: 'admin'})).toBe('invalid_scope')
        expect(checkClientParams({...existingClient, isActive: false}, {redirect_uri: 'x'})).toBe('invalid_client')
        expect(verifyPkce({}, undefined)).toBe(true)
        expect(oidcCodeData({})).toEqual({})
    })

    it('oidc clients need whitelisted redirect uri and pkce S256', () => {
        expect(isOidcClient(oidcClient)).toBe(true)
        expect(checkClientParams(oidcClient, {redirect_uri: oidcClient.allowedRedirectUris, scope: 'openid profile'})).toBe(null)
        expect(checkClientParams(oidcClient, {redirect_uri: 'https://evil/cb', scope: 'openid'})).toBe('invalid_redirect_uri')
        expect(checkClientParams({...oidcClient, allowedRedirectUris: ''}, {redirect_uri: 'https://x/cb', scope: 'openid'})).toBe('invalid_redirect_uri')
        expect(checkOidcAuthorizeParams({scope: 'openid', code_challenge: challenge, code_challenge_method: 'S256'})).toBe(null)
        expect(checkOidcAuthorizeParams({scope: 'openid', code_challenge: challenge, code_challenge_method: 'plain'})).toBe('invalid_request')
        expect(checkOidcAuthorizeParams({scope: 'openid'})).toBe('invalid_request')
        expect(checkOidcAuthorizeParams({scope: 'profile', code_challenge: challenge, code_challenge_method: 'S256'})).toBe('invalid_scope')
    })

    it('verifies pkce', () => {
        const codeData = oidcCodeData({code_challenge: challenge, code_challenge_method: 'S256', nonce: 'n1'})
        expect(codeData.nonce).toBe('n1')
        expect(verifyPkce(codeData, verifier)).toBe(true)
        expect(verifyPkce(codeData, verifier.replace('d', 'e'))).toBe(false)
        expect(verifyPkce(codeData, undefined)).toBe(false)
    })

    it('reads client credentials from body or basic auth', () => {
        expect(clientCredentials(fakeReq({}, {client_id: 'a', client_secret: 'b'}))).toEqual({client_id: 'a', client_secret: 'b'})
        const basic = 'Basic ' + Buffer.from('online-pokerraum:s%3Acret').toString('base64')
        expect(clientCredentials(fakeReq({authorization: basic}, {}))).toEqual({client_id: 'online-pokerraum', client_secret: 's:cret'})
    })

    it('issues id token + access token and serves userinfo', async () => {
        const codeData = {_id: new ObjectId(), createdBy: userId, scope: 'openid profile', ...oidcCodeData({code_challenge: challenge, code_challenge_method: 'S256', nonce: 'abc'})}
        const {status, body} = await createOidcTokenResponse(fakeDb, fakeReq(), {clientData: oidcClient, codeData})
        expect(status).toBe(200)

        const jwksRes = fakeRes()
        await oidcJwks(fakeDb, fakeReq(), jwksRes)
        const jwk = jwksRes.body.keys[0]
        expect(jwk.d).toBeUndefined()
        const pub = crypto.createPublicKey({key: jwk, format: 'jwk'})

        const id = jwt.verify(body.id_token, pub, {algorithms: ['RS256'], issuer: 'https://pokerraum.ch/oauth', audience: 'online-pokerraum'})
        expect(jwt.decode(body.id_token, {complete: true}).header.kid).toBe(jwk.kid)
        expect(id).toMatchObject({sub: userId.toString(), nonce: 'abc', preferred_username: 'spieler1', name: 'Max Muster', virtualId: '10409', picture: `https://pokerraum.ch/uploads/${pictureId}`})

        // the access token is no Lunuc session token
        expect(() => jwt.verify(body.access_token, 'any-hs-secret')).toThrow()

        const res = fakeRes()
        await oidcUserInfo(fakeDb, fakeReq({authorization: 'Bearer ' + body.access_token}), res)
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({sub: userId.toString(), preferred_username: 'spieler1', name: 'Max Muster', picture: `https://pokerraum.ch/uploads/${pictureId}`, virtualId: '10409'})

        // the id token is not accepted at userinfo, neither is a token of another host
        const r2 = fakeRes()
        await oidcUserInfo(fakeDb, fakeReq({authorization: 'Bearer ' + body.id_token}), r2)
        expect(r2.statusCode).toBe(401)
        const r3 = fakeRes()
        await oidcUserInfo(fakeDb, fakeReq({authorization: 'Bearer ' + body.access_token, host: 'other.ch'}), r3)
        expect(r3.statusCode).toBe(401)
    })

    it('hides the real name if the player chose so and refuses blocked users', async () => {
        users[userId.toString()].meta.hideName = true
        const codeData = {_id: new ObjectId(), createdBy: userId, scope: 'openid profile'}
        const {body} = await createOidcTokenResponse(fakeDb, fakeReq(), {clientData: oidcClient, codeData})
        expect(jwt.decode(body.id_token).name).toBe('spieler1')
        expect(jwt.decode(body.id_token).nonce).toBeUndefined()

        users[userId.toString()].blocked = true
        const res = fakeRes()
        await oidcUserInfo(fakeDb, fakeReq({authorization: 'Bearer ' + body.access_token}), res)
        expect(res.statusCode).toBe(401)
        const r = await createOidcTokenResponse(fakeDb, fakeReq(), {clientData: oidcClient, codeData})
        expect(r.status).toBe(400)
        delete users[userId.toString()].blocked
    })

    it('openid scope only returns sub', async () => {
        const codeData = {_id: new ObjectId(), createdBy: userId, scope: 'openid'}
        const {body} = await createOidcTokenResponse(fakeDb, fakeReq(), {clientData: oidcClient, codeData})
        const res = fakeRes()
        await oidcUserInfo(fakeDb, fakeReq({authorization: 'Bearer ' + body.access_token}), res)
        expect(res.body).toEqual({sub: userId.toString()})
    })

    it('serves discovery', () => {
        const res = fakeRes()
        oidcDiscovery(fakeReq({host: 'localhost:8080'}), res)
        expect(res.body.issuer).toBe('http://localhost:8080/oauth')
        expect(res.body.code_challenge_methods_supported).toEqual(['S256'])
    })
})
