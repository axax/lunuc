// OpenID Connect on top of the existing OAuth code flow (separate from the existing clients)
//
// A client becomes an OIDC client when its allowedScopes contain "openid". Only for those clients:
// - PKCE (S256) is required, the redirect uris must be whitelisted, nonce is passed into the id token
// - the token endpoint returns an RS256 id token and a short-lived RS256 access token instead of a
//   Lunuc session token. The access token is only accepted by /oauth/userinfo (the Lunuc api only
//   accepts HS256 tokens signed with SECRET_KEY).
// Clients without "openid" in allowedScopes (e.g. BLND, Pokerhelden Office) behave exactly as before.
import crypto from 'crypto'
import {promisify} from 'node:util'
import jwt from 'jsonwebtoken'
import {ObjectId} from 'mongodb'

export const OIDC_SCOPE = 'openid'
const KEY_NAME = 'OAuthOidcSigningKey'
const TOKEN_TTL_S = 3600
const generateKeyPair = promisify(crypto.generateKeyPair)
const ACCESS_TOKEN_TYPE = 'oidc_access'

export const splitScopes = s => s ? s.split(/[\s,]+/).filter(Boolean) : []
// same parsing as before the oidc extension (keeps the behavior for existing clients identical)
const splitUris = s => s ? s.split(/[,\n]+/).map(u => u.trim()) : []

export const isOidcClient = clientData => !!clientData && splitScopes(clientData.allowedScopes).includes(OIDC_SCOPE)

// redirect_uri and scope check - shared by /oauth/authorize and the login hook
export const checkClientParams = (clientData, {redirect_uri, scope}) => {
    if (!clientData || clientData.isActive === false) {
        return 'invalid_client'
    }
    const allowedUris = splitUris(clientData.allowedRedirectUris)
    // existing clients: an empty whitelist allows every uri (unchanged) - oidc clients need a whitelist
    if ((allowedUris.length > 0 || isOidcClient(clientData)) && (!redirect_uri || !allowedUris.includes(redirect_uri))) {
        return 'invalid_redirect_uri'
    }
    if (scope && clientData.allowedScopes) {
        const allowed = clientData.allowedScopes.split(/[\s,]+/).map(s => s.trim())
        if (scope.split(' ').some(s => !allowed.includes(s))) {
            return 'invalid_scope'
        }
    }
    return null
}

// additional checks for oidc clients on the authorize request
export const checkOidcAuthorizeParams = ({scope, code_challenge, code_challenge_method}) => {
    if (!splitScopes(scope).includes(OIDC_SCOPE)) {
        return 'invalid_scope'
    }
    if (!code_challenge || code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) {
        return 'invalid_request'
    }
    return null
}

// the oidc specific values that are stored with the code
export const oidcCodeData = ({code_challenge, code_challenge_method, nonce}) => {
    const data = {}
    if (code_challenge) {
        data.codeChallenge = code_challenge
        data.codeChallengeMethod = code_challenge_method
    }
    if (nonce) {
        data.nonce = String(nonce).substring(0, 512)
    }
    return data
}

const base64url = buf => buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

export const verifyPkce = (codeData, codeVerifier) => {
    if (!codeData.codeChallenge) {
        return true
    }
    if (!codeVerifier || codeData.codeChallengeMethod !== 'S256' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
        return false
    }
    const expected = Buffer.from(codeData.codeChallenge)
    const actual = Buffer.from(base64url(crypto.createHash('sha256').update(codeVerifier).digest()))
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

// client_secret_post (as before) or client_secret_basic
export const clientCredentials = req => {
    const body = req.body || {}
    if (body.client_id && body.client_secret) {
        return {client_id: body.client_id, client_secret: body.client_secret}
    }
    const header = req.headers.authorization
    if (header && header.startsWith('Basic ')) {
        const decoded = Buffer.from(header.substring(6), 'base64').toString('utf8')
        const i = decoded.indexOf(':')
        if (i > 0) {
            return {
                client_id: decodeURIComponent(decoded.substring(0, i)),
                client_secret: decodeURIComponent(decoded.substring(i + 1))
            }
        }
    }
    return {client_id: body.client_id, client_secret: body.client_secret}
}

export const issuerFromRequest = req => {
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
    return `${local ? 'http' : 'https'}://${host}/oauth`
}

// ---- signing key (env LUNUC_OIDC_PRIVATE_KEY or generated once and stored in KeyValueGlobal) ----
let keyPromise

const buildKey = privatePem => {
    const privateKey = crypto.createPrivateKey(privatePem)
    const publicKey = crypto.createPublicKey(privateKey)
    const jwk = publicKey.export({format: 'jwk'})
    // RFC 7638 thumbprint as kid
    const kid = base64url(crypto.createHash('sha256').update(JSON.stringify({e: jwk.e, kty: jwk.kty, n: jwk.n})).digest())
    return {privateKey, publicKey, kid, jwk: {...jwk, kid, use: 'sig', alg: 'RS256'}}
}

export const getSigningKey = db => {
    if (!keyPromise) {
        keyPromise = (async () => {
            if (process.env.LUNUC_OIDC_PRIVATE_KEY) {
                return buildKey(process.env.LUNUC_OIDC_PRIVATE_KEY.replace(/\\n/g, '\n'))
            }
            const stored = await db.collection('KeyValueGlobal').findOne({key: KEY_NAME}, {projection: {value: 1}})
            if (stored) {
                return buildKey(stored.value)
            }
            // only once per installation - async so the event loop is not blocked
            const {privateKey} = await generateKeyPair('rsa', {modulusLength: 2048})
            const pem = privateKey.export({type: 'pkcs8', format: 'pem'})
            // $setOnInsert: with several processes the first stored key wins
            await db.collection('KeyValueGlobal').updateOne(
                {key: KEY_NAME},
                {$setOnInsert: {key: KEY_NAME, value: pem, ispublic: false}},
                {upsert: true})
            const winner = await db.collection('KeyValueGlobal').findOne({key: KEY_NAME}, {projection: {value: 1}})
            return buildKey(winner.value)
        })().catch(e => {
            keyPromise = null
            throw e
        })
    }
    return keyPromise
}

export const resetSigningKeyCache = () => {
    keyPromise = null
}

// ---- claims ----
export const userClaims = (user, scopes, issuer) => {
    const claims = {sub: user._id.toString()}
    if (scopes.includes('profile')) {
        const meta = user.meta || {}
        const adr = meta.addresses && meta.addresses[0]
        const realName = adr && [adr.firstname, adr.lastname].filter(Boolean).join(' ').trim()
        claims.preferred_username = user.username
        // the real name only if the player didn't hide it (same rule as on pokerraum.ch)
        claims.name = (!meta.hideName && realName) || user.username
        if (user.picture) {
            claims.picture = `${issuer.slice(0, -'/oauth'.length)}/uploads/${user.picture.toString()}`
        }
        if (meta.virtualId) {
            claims.virtualId = String(meta.virtualId)
        }
    }
    return claims
}

const USER_PROJECTION = {username: 1, picture: 1, blocked: 1, 'meta.addresses': 1, 'meta.hideName': 1, 'meta.virtualId': 1}

const loadUser = async (db, id) => {
    if (!id || !ObjectId.isValid(id)) {
        return null
    }
    const user = await db.collection('User').findOne({_id: new ObjectId(id)}, {projection: USER_PROJECTION})
    return user && !user.blocked ? user : null
}

// token response for oidc clients (no Lunuc session token is handed out)
export const createOidcTokenResponse = async (db, req, {clientData, codeData}) => {
    const user = await loadUser(db, codeData.createdBy)
    if (!user) {
        return {status: 400, body: {error: 'invalid_grant', hint: 'invalid_user'}}
    }
    const key = await getSigningKey(db)
    const issuer = issuerFromRequest(req)
    const scopes = splitScopes(codeData.scope)
    const signOptions = {algorithm: 'RS256', keyid: key.kid, issuer, expiresIn: TOKEN_TTL_S}

    const idToken = jwt.sign({
        ...userClaims(user, scopes, issuer),
        azp: clientData.clientId,
        ...(codeData.nonce ? {nonce: codeData.nonce} : {})
    }, key.privateKey, {...signOptions, audience: clientData.clientId})

    const accessToken = jwt.sign({
        sub: user._id.toString(),
        client_id: clientData.clientId,
        scope: scopes.join(' '),
        token_use: ACCESS_TOKEN_TYPE
    }, key.privateKey, {...signOptions, audience: issuer + '/userinfo', jwtid: crypto.randomBytes(16).toString('hex')})

    return {
        status: 200,
        body: {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: TOKEN_TTL_S,
            id_token: idToken,
            scope: scopes.join(' ')
        }
    }
}

const sendJson = (res, status, body, headers) => {
    res.set({'Cache-Control': 'no-store', Pragma: 'no-cache', ...headers})
    res.status(status).json(body)
}

export async function oidcUserInfo(db, req, res) {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.substring(7).trim() : (req.body && req.body.access_token)
    const unauthorized = () => sendJson(res, 401, {error: 'invalid_token'}, {'WWW-Authenticate': 'Bearer error="invalid_token"'})
    if (!token) {
        return unauthorized()
    }
    try {
        const key = await getSigningKey(db)
        const issuer = issuerFromRequest(req)
        const payload = jwt.verify(token, key.publicKey, {
            algorithms: ['RS256'], issuer, audience: issuer + '/userinfo'
        })
        if (payload.token_use !== ACCESS_TOKEN_TYPE) {
            return unauthorized()
        }
        const user = await loadUser(db, payload.sub)
        if (!user) {
            return unauthorized()
        }
        return sendJson(res, 200, userClaims(user, splitScopes(payload.scope), issuer))
    } catch (e) {
        return unauthorized()
    }
}

export async function oidcJwks(db, req, res) {
    const key = await getSigningKey(db)
    res.set('Cache-Control', 'public, max-age=3600')
    res.json({keys: [key.jwk]})
}

export function oidcDiscovery(req, res) {
    const issuer = issuerFromRequest(req)
    res.set('Cache-Control', 'public, max-age=3600')
    res.json({
        issuer,
        authorization_endpoint: issuer + '/authorize',
        token_endpoint: issuer + '/token',
        userinfo_endpoint: issuer + '/userinfo',
        jwks_uri: issuer + '/jwks',
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['openid', 'profile'],
        claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce', 'azp', 'preferred_username', 'name', 'picture', 'virtualId'],
        prompt_values_supported: ['login']
    })
}
