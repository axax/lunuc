import jwt from 'jsonwebtoken'
import Util from './util/index.mjs'
import {_t} from '../util/i18nServer.mjs'
import {SECRET_KEY,AUTH_EXPIRES_IN} from './constants/index.mjs'
import {contextByRequest, removeAuthCookies, setAuthCookies} from './util/sessionContext.mjs'
import {validateContextUser} from './util/userSession.mjs'
import {USE_COOKIES} from './constants/index.mjs'
import {ObjectId} from 'mongodb'
import crypto from 'crypto'
import HookAsync from '../util/hookAsync.mjs'

/*
 Two-factor authentication: after a correct password, users with "twoFactor" only get a short
 lived pending token. The real login token is issued after the second factor (passkey or
 recovery code - see extensions/webauthn). The pending token is signed with its own key, so it
 can never be used as a login token.
 */
const TWO_FACTOR_SECRET = crypto.createHash('sha256').update('lunuc-2fa:' + SECRET_KEY).digest()
const TWO_FACTOR_EXPIRES_IN = '5m'

export const auth = {
    createToken: async ({username, password, domain, db, context}) => {

        // lastLogin is only written after a successful login (before: on every attempt, also with a
        // wrong password). The returned user is the document before the update, as before.
        const user = await db.collection('User').findOne({domain: domain?{ $in: [ domain, "$ALL" ] }:{ $in: [ null, "", "$ALL" ] }, $or: [{'email': username}, {'username': username}]})


        // "anonymous" is the shared identity of all visitors that are not logged in - never a login
        if (!user || !password || user.username === 'anonymous') {
            return {error: _t('core.login.invalid', context.lang), token: null, user: null}
        }else if(user.blocked){
            return {error: _t('core.login.blocked', context.lang), token: null, user: null}
        } else if (await Util.compareWithHashedPasswordAsync(password, user.password)) {
            if (user.twoFactor) {
                // second factor still missing - no login yet
                return {twoFactorToken: auth.createTwoFactorToken(user), token: null, user: null}
            }
            await db.collection('User').updateOne({_id: user._id}, {$set: {lastLogin: new Date().getTime()}})
            return await auth.signPayload(db, user)
        } else {
            // knownUser: the account exists, only the password was wrong - the login resolver
            // counts per-username attempts only for existing accounts (never sent to the client)
            return {error: _t('core.login.invalid', context.lang), token: null, user: null, knownUser: true}
        }
    },
    signPayload: async (db, user, payload) => {
        if(user && ObjectId.isValid(user)){
            user = await Util.userById(db, user)
        }

        user.role = await Util.getUserRoles(db, user.role)
        // from now on we'll identify the user by the id and the id is the only personalized value that goes into our token
        const fullPayload = {
            username: user.username,
            id: user._id,
            role: user.role.name,
            domain: user.domain,
            group: user.group,
            junior: user.junior,
            // increased on password change - older tokens are no longer accepted (see userSession.mjs)
            tokenVersion: user.tokenVersion || 0,
        ...payload}
        const token = jwt.sign(fullPayload, SECRET_KEY, {expiresIn: AUTH_EXPIRES_IN})
        return {token: token, user}

    },
    createTwoFactorToken: (user) => {
        return jwt.sign({uid: String(user._id), tv: user.tokenVersion || 0}, TWO_FACTOR_SECRET, {expiresIn: TWO_FACTOR_EXPIRES_IN})
    },
    // returns the user of a valid pending token or null
    verifyTwoFactorToken: async (db, twoFactorToken) => {
        let decoded
        try {
            decoded = jwt.verify(twoFactorToken, TWO_FACTOR_SECRET)
        } catch (e) {
            return null
        }
        if (!decoded || !ObjectId.isValid(decoded.uid)) {
            return null
        }
        const user = await db.collection('User').findOne({_id: new ObjectId(decoded.uid)})
        // password changed or 2fa disabled in the meantime
        if (!user || user.blocked || !user.twoFactor || (user.tokenVersion || 0) !== decoded.tv) {
            return null
        }
        return user
    },
    /*
     Everything after a successful login (password, password + second factor or passkey):
     cookies, forced password change and the login hook.
     */
    completeLogin: async ({db, req, result, metaObj = {}}) => {
        const {context} = req
        if (USE_COOKIES && !metaObj.oauth) {
            setAuthCookies(result, req, req.res)
            // delete token because it is handled by cookies
            delete result.token
        }

        if (result.user.requestNewPassword) {
            // generate reset token
            const resetToken = crypto.randomBytes(16).toString('hex')
            await db.collection('User').updateOne({_id: new ObjectId(result.user._id)}, {
                $set: {
                    passwordReset: new Date().getTime(),
                    resetToken
                }
            })
            result.resetToken = resetToken
        }

        await HookAsync.call('login', {req, result, context, db, user: result.user, metaObj})
        return result
    },
    initialize: (app, db) => {

        app.use(async (req, res, next) => {
            try {
                req.isHttps = req.headers['x-forwarded-proto'] === 'https'

                const context = contextByRequest(req, res)

                // blocked / deleted user or password changed since the token was issued
                req.context = await validateContextUser(db, context)
                if (req.context.loginRevoked && USE_COOKIES) {
                    removeAuthCookies(req, res)
                }
                next()
            } catch (e) {
                next(e)
            }
        })
    }
}
