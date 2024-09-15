import jwt from 'jsonwebtoken'
import Util from './util/index.mjs'
import {_t} from '../util/i18nServer.mjs'
import {SECRET_KEY,AUTH_EXPIRES_IN} from './constants/index.mjs'
import {contextByRequest} from './util/sessionContext.mjs'

export const auth = {
    createToken: async ({username, password, domain, db, context}) => {

        const user = await db.collection('User').findOneAndUpdate({domain: domain?{ $in: [ domain, "$ALL" ] }:{ $in: [ null, "", "$ALL" ] }, $or: [{'email': username}, {'username': username}]}, {$set: {lastLogin: new Date().getTime()}})


        if (!user || !password) {
            return {error: _t('core.login.invalid', context.lang), token: null, user: null}
        }else if(user.blocked){
            return {error: _t('core.login.blocked', context.lang), token: null, user: null}
        } else if (Util.compareWithHashedPassword(password, user.password)) {
            user.role = await Util.getUserRoles(db, user.role)

            // from now on we'll identify the user by the id and the id is the only personalized value that goes into our token
            const payload = {username: user.username, id: user._id, role: user.role.name, domain: user.domain, group: user.group}
            const token = jwt.sign(payload, SECRET_KEY, {expiresIn: AUTH_EXPIRES_IN})
            return {token: token, user}
        } else {
            return {error: _t('core.login.invalid', context.lang), token: null, user: null}
        }
    },
    initialize: (app, db) => {

        app.use((req, res, next) => {

            req.isHttps = req.headers['x-forwarded-proto']==='https'

            req.context = contextByRequest(req, res)

            next()
        })
    }
}
