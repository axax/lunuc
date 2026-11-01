import Util from './index.mjs'
import {ObjectId} from 'mongodb'

/*
 A login token (JWT) is valid for a long time (AUTH_EXPIRES_IN). Blocking a user, deleting a user
 or changing the password must end existing logins right away, so every request with a login is
 checked against the user:
 - the user must still exist and must not be blocked
 - the tokenVersion in the token must match the one of the user (it is increased on password change)

 With the user cache (Util.userById) this costs well below a microsecond per request.
 */

// fields of the context that come from the login token
const LOGIN_FIELDS = ['id', 'username', 'role', 'domain', 'group', 'junior', 'tokenVersion',
    'accessScope', 'oauth', 'groupName', 'exp', 'iat', 'auth']

export const isLoginStillValid = (user, context) =>
    !!user && !user.blocked && (user.tokenVersion || 0) === (context.tokenVersion || 0)

/**
 * Returns the context unchanged if its login is still valid, otherwise a copy without the login
 * (the request then counts as not logged in).
 * @param noCache read the user from the db instead of the cache - for processes that don't get
 *                the cache invalidation of the api (e.g. the web server)
 */
export const validateContextUser = async (db, context, {noCache = false} = {}) => {
    if (!context || !context.id || !db) {
        return context
    }
    const withoutLogin = () => {
        const result = {...context}
        LOGIN_FIELDS.forEach(key => delete result[key])
        return result
    }

    if (!ObjectId.isValid(context.id)) {
        return {...withoutLogin(), loginRevoked: true}
    }

    let user
    try {
        if (noCache) {
            user = await db.collection('User').findOne({_id: new ObjectId(context.id)},
                {projection: {blocked: 1, tokenVersion: 1}})
        } else {
            user = await Util.userById(db, context.id)
        }
    } catch (e) {
        // db not reachable: this request runs without login, but the login itself is not
        // revoked (no loginRevoked) - otherwise a short db outage would log out everybody
        console.warn('validateContextUser: could not load user', e.message)
        return withoutLogin()
    }
    if (isLoginStillValid(user, context)) {
        return context
    }
    if (!noCache) {
        // The cache of this process may be outdated: a password change or an unblock on another
        // api process / node only clears the cache there. Check the db before rejecting, so a
        // valid login is never thrown out (only happens for rejected logins, so it is rare).
        try {
            const fresh = await db.collection('User').findOne({_id: new ObjectId(context.id)})
            if (isLoginStillValid(fresh, context)) {
                Util.clearUserCache(context.id)
                return context
            }
        } catch (e) {
            console.warn('validateContextUser: could not load user', e.message)
            return withoutLogin()
        }
    }
    // blocked, deleted or password changed - the auth cookie can be removed
    return {...withoutLogin(), loginRevoked: true}
}
