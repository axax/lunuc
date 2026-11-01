import jwt from 'jsonwebtoken'
import Util from './util/index.mjs'
import {_t} from '../util/i18nServer.mjs'
import {SECRET_KEY,AUTH_EXPIRES_IN} from './constants/index.mjs'
import {contextByRequest, removeAuthCookies} from './util/sessionContext.mjs'
import {validateContextUser} from './util/userSession.mjs'
import {USE_COOKIES} from './constants/index.mjs'
import {ObjectId} from 'mongodb'

export const auth = {
    createToken: async ({username, password, domain, db, context}) => {

        const user = await db.collection('User').findOneAndUpdate({domain: domain?{ $in: [ domain, "$ALL" ] }:{ $in: [ null, "", "$ALL" ] }, $or: [{'email': username}, {'username': username}]}, {$set: {lastLogin: new Date().getTime()}})


        // "anonymous" is the shared identity of all visitors that are not logged in - never a login
        if (!user || !password || user.username === 'anonymous') {
            return {error: _t('core.login.invalid', context.lang), token: null, user: null}
        }else if(user.blocked){
            return {error: _t('core.login.blocked', context.lang), token: null, user: null}
        } else if (await Util.compareWithHashedPasswordAsync(password, user.password)) {
            return await auth.signPayload(db, user)
        } else {
            return {error: _t('core.login.invalid', context.lang), token: null, user: null}
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
