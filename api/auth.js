import jwt from 'jsonwebtoken'
import Util from './util'
import config from 'gen/config'
import {_t} from 'util/i18nServer'
import {SECRET_KEY,AUTH_EXPIRES_IN} from './constants'
import {contextByRequest} from './util/sessionContext'
const {DEFAULT_LANGUAGE} = config

export const auth = {
    createToken: async ({username, password, domain, db, context}) => {

        const userCollection = db.collection('User')
        const result = await userCollection.findOneAndUpdate({domain: domain?domain:undefined, $or: [{'email': username}, {'username': username}]}, {$set: {lastLogin: new Date().getTime()}})

        const user = result.value

        if (!user) {
            return {error: _t('core.login.invalid', context.lang), token: null, user: null}
        } else if (Util.compareWithHashedPassword(password, user.password)) {
            user.role = await Util.getUserRoles(db, user.role)

            // from now on we'll identify the user by the id and the id is the only personalized value that goes into our token
            const payload = {username: user.username, id: user._id, role: user.role.name, group: user.group}
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
