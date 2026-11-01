/*
 * Existing logins end when a user is blocked, deleted or changes the password (tokenVersion),
 * and the JSON body size depends on the login.
 */
import assert from 'node:assert'
import zlib from 'zlib'
import {ObjectId} from 'mongodb'
import jwt from 'jsonwebtoken'
import Cache from '../../util/cache.mjs'
import {SECRET_KEY} from '../../api/constants/index.mjs'
import {validateContextUser} from '../../api/util/userSession.mjs'
import {hasLoginToken, contextByRequest} from '../../api/util/sessionContext.mjs'
import {gunzipJsonBody} from '../../api/util/unzip.mjs'
import {userResolver} from '../../api/resolver/user.mjs'

const roleId = new ObjectId()
const createDb = (users) => {
    const updates = []
    return {
        updates,
        collection: name => ({
            findOne: async q => {
                if (name === 'UserRole') return {_id: roleId, name: 'subscriber', capabilities: []}
                if (q._id) return users.find(u => String(u._id) === String(q._id)) || null
                return null
            },
            findOneAndUpdate: async (q, update) => {
                updates.push(update)
                const u = users.find(u => String(u._id) === String(q._id))
                if (u) {
                    Object.assign(u, update.$set)
                    if (update.$inc) u.tokenVersion = (u.tokenVersion || 0) + update.$inc.tokenVersion
                }
                return {ok: 1, value: u}
            }
        })
    }
}
const newUser = (props = {}) => ({_id: new ObjectId(), username: 'u' + Math.random(), role: roleId, ...props})
const contextFor = (user, tokenVersion) => ({id: user._id.toString(), username: user.username, role: 'subscriber', tokenVersion, session: 's1', lang: 'en'})

describe('login validation', () => {

    beforeEach(() => Cache.clearAll())

    it('keeps a valid login', async () => {
        const user = newUser()
        const ctx = contextFor(user)
        assert.strictEqual(await validateContextUser(createDb([user]), ctx), ctx)
    })

    it('tokens without tokenVersion stay valid as long as the password was not changed', async () => {
        const user = newUser()
        const ctx = contextFor(user, undefined)
        assert.strictEqual((await validateContextUser(createDb([user]), ctx)).id, ctx.id)
    })

    it('ends the login of a blocked user', async () => {
        const user = newUser({blocked: true})
        const result = await validateContextUser(createDb([user]), contextFor(user))
        assert.strictEqual(result.id, undefined)
        assert.strictEqual(result.username, undefined)
        assert.strictEqual(result.session, 's1')
        assert.strictEqual(result.lang, 'en')
    })

    it('ends the login of a deleted user', async () => {
        const user = newUser()
        const result = await validateContextUser(createDb([]), contextFor(user))
        assert.strictEqual(result.id, undefined)
    })

    it('ends the login after a password change', async () => {
        const user = newUser({tokenVersion: 1})
        const result = await validateContextUser(createDb([user]), contextFor(user, 0))
        assert.strictEqual(result.id, undefined)
    })

    it('an outdated cache entry (e.g. unblocked on another node) does not end a valid login', async () => {
        const user = newUser()
        const db = createDb([user])
        Cache.set('User' + user._id, {...user, blocked: true})
        assert.strictEqual((await validateContextUser(db, contextFor(user))).id, user._id.toString())
    })

    it('noCache reads the user from the db', async () => {
        const user = newUser()
        const db = createDb([user])
        await validateContextUser(db, contextFor(user)) // now cached
        user.blocked = true
        assert.strictEqual((await validateContextUser(db, contextFor(user), {noCache: true})).id, undefined)
    })

    it('updateMe with a new password ends other logins and renews the own one', async () => {
        const user = newUser({tokenVersion: 0})
        const db = createDb([user])
        const cookies = []
        const req = {
            context: contextFor(user, 0),
            headers: {},
            res: {cookie: (name, value) => cookies.push({name, value})}
        }
        await userResolver(db).Mutation.updateMe({password: 'newPassword123', passwordConfirm: 'newPassword123'}, req)

        assert.deepStrictEqual(db.updates[0].$inc, {tokenVersion: 1})
        // old token no longer valid
        assert.strictEqual((await validateContextUser(db, contextFor(user, 0))).id, undefined)
        // the new cookie carries the new version
        const authCookie = cookies.find(c => c.name === 'auth')
        assert.ok(authCookie)
        const decoded = jwt.verify(authCookie.value.split(' ')[1], SECRET_KEY)
        assert.strictEqual(decoded.tokenVersion, 1)
        assert.strictEqual((await validateContextUser(db, {...decoded, session: 's1'})).id, user._id.toString())
    })
})

describe('json body limit', () => {

    it('hasLoginToken only for a valid signed token', () => {
        const token = jwt.sign({id: new ObjectId().toString(), username: 'x'}, SECRET_KEY)
        assert.strictEqual(hasLoginToken({headers: {cookie: 'auth=JWT%20' + token}}), true)
        assert.strictEqual(hasLoginToken({headers: {cookie: 'auth=JWT%20invalid.token.x'}}), false)
        assert.strictEqual(hasLoginToken({headers: {}}), false)
    })

    const runGunzip = (body, limit) => new Promise((resolve) => {
        const handlers = {}
        const req = {
            headers: {'content-encoding': 'gzip'},
            _jsonBodyLimit: limit,
            on: (event, fn) => { handlers[event] = fn },
            destroy: () => {}
        }
        const res = {headersSent: false, writeHead: (status) => resolve({status}), end: () => {}}
        gunzipJsonBody(req, res, () => resolve({status: 200, body: req.body}))
        handlers.data(zlib.gzipSync(Buffer.from(body)))
        handlers.end()
    })

    it('gzip body above the limit is refused', async () => {
        const big = JSON.stringify({query: 'x'.repeat(3 * 1024 * 1024)})
        assert.strictEqual((await runGunzip(big, 2 * 1024 * 1024)).status, 413)
        assert.strictEqual((await runGunzip(big, 200 * 1024 * 1024)).status, 200)
    })
})

describe('login validation when the db is not reachable', () => {
    it('runs the request without login but does not revoke the login', async () => {
        Cache.clearAll()
        const db = {collection: () => ({findOne: async () => { throw new Error('db down') }})}
        const result = await validateContextUser(db, {id: new ObjectId().toString(), username: 'x', session: 's1'})
        assert.strictEqual(result.id, undefined)
        assert.strictEqual(result.loginRevoked, undefined)
    })
})

describe('token is verified once per request', () => {
    it('contextByRequest reuses the result of hasLoginToken', () => {
        const id = new ObjectId().toString()
        const token = jwt.sign({id, username: 'x'}, SECRET_KEY)
        const req = {headers: {cookie: 'auth=JWT%20' + token + '; session=s1'}}
        assert.strictEqual(hasLoginToken(req), true)
        req._decodedLoginToken.decoded.username = 'from-cache'
        assert.strictEqual(contextByRequest(req, null).username, 'from-cache')
        // an other token is decoded again
        const other = {headers: {cookie: 'auth=JWT%20' + jwt.sign({id, username: 'y'}, SECRET_KEY) + '; session=s1'}, _decodedLoginToken: req._decodedLoginToken}
        assert.strictEqual(contextByRequest(other, null).username, 'y')
    })
})

describe('me', () => {
    it('writes lastActive at most once per minute', async () => {
        const user = newUser({lastActive: Date.now()})
        let writes = 0
        const db = {collection: () => ({
            findOne: async () => ({...user}),
            updateOne: async () => { writes++ }
        })}
        const me = userResolver(db).Query.me
        await me({}, {context: contextFor(user)}, {fieldNodes: []})
        assert.strictEqual(writes, 0)
        user.lastActive = Date.now() - 2 * 60 * 1000
        await me({}, {context: contextFor(user)}, {fieldNodes: []})
        assert.strictEqual(writes, 1)
    })
})
