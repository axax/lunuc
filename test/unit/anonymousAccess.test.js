/*
 * Visitors without login must not share an identity: no read access to data created without
 * login, no login as the user "anonymous", and the old default password gets replaced.
 */
import assert from 'node:assert'
import {ObjectId} from 'mongodb'
import Util from '../../api/util/index.mjs'
import {createMatchForCurrentUser} from '../../api/util/dbquery.mjs'
import {auth} from '../../api/auth.mjs'
import {secureDefaultUsers} from '../../api/data/initialData.mjs'
import {contextByRequest} from '../../api/util/sessionContext.mjs'
import jwt from 'jsonwebtoken'
import {SECRET_KEY} from '../../api/constants/index.mjs'

const roleId = new ObjectId()
const makeDb = (users) => ({
  collection: name => ({
    findOne: async q => name==='UserRole' ? {_id: roleId, name:'subscriber', capabilities:[]} : users.find(u => Object.keys(q).every(k => String(u[k])===String(q[k]))) || null,
    findOneAndUpdate: async q => users.find(u => (q.$or||[]).some(c => Object.keys(c).some(k => u[k]===c[k][Object.keys(c[k])[0]]?.[0] || u[k]===c[k]))) || null,
    updateOne: async (q, upd) => { const u = users.find(u => String(u._id)===String(q._id)); Object.assign(u, upd.$set) }
  })
})

describe('anonymous hardening', () => {
  it('userAndJuniorIds is empty without login', async () => {
    assert.deepStrictEqual(await Util.userAndJuniorIds({}, undefined), [])
  })
  it('read match for Log without login matches nothing', async () => {
    const m = await createMatchForCurrentUser({typeName: 'Log', db: {}, context: {lang:'en'}})
    assert.deepStrictEqual(m, {createdBy: {$in: []}})
  })
  it('login as anonymous is refused', async () => {
    const hash = await Util.hashPasswordAsync('password')
    const db = makeDb([{_id: new ObjectId(), username:'anonymous', password: hash, role: roleId}])
    const r = await auth.createToken({username:'anonymous', password:'password', db, context:{lang:'en'}})
    assert.strictEqual(r.token, null)
  })
  it('normal token still works', async () => {
    const token = jwt.sign({username:'user1', id:'0123456789abcdef01234567'}, SECRET_KEY)
    const ctx = contextByRequest({headers:{cookie:'auth=JWT%20'+token+'; session=abc'}}, null)
    assert.strictEqual(ctx.username, 'user1')
  })
  it('default password of anonymous is replaced', async () => {
    const hash = await Util.hashPasswordAsync('password')
    const users = [{_id: new ObjectId(), username:'anonymous', password: hash}, {_id: new ObjectId(), username:'admin', password: hash}]
    await secureDefaultUsers(makeDb(users))
    assert.strictEqual(await Util.compareWithHashedPasswordAsync('password', users[0].password), false)
    assert.strictEqual(await Util.compareWithHashedPasswordAsync('password', users[1].password), true)
  })
})
