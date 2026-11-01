import {
    AUTH_EXPIRES_IN,
    AUTH_EXPIRES_IN_COOKIE,
    AUTH_HEADER,
    AUTH_SCHEME, CLIENT_ID_HEADER,
    CONTENT_LANGUAGE_HEADER, SECRET_KEY,
    SESSION_HEADER,
    USE_COOKIES
} from '../constants/index.mjs'
import {parseCookies} from './parseCookies.mjs'
import {decodeToken} from './jwt.mjs'
import crypto from 'crypto'
import config from '../../gensrc/config.mjs'
import jwt from 'jsonwebtoken'
import {getHostFromHeaders} from '../../util/host.mjs'
import {getBestMatchingHostRule} from '../../util/hostrules.mjs'

const {DEFAULT_LANGUAGE} = config

export const setAuthCookies = (userData, req, res) => {

    const {hostrule} = getBestMatchingHostRule(getHostFromHeaders(req.headers))
    // only sent over https (if the request came in over https - local development over http still works)
    const secure = !!req.isHttps
    res.cookie('auth', AUTH_SCHEME + ' ' + userData.token, {
        domain: hostrule?.authCookieDomain,
        secure,
        httpOnly: true,
        expires: true,
        maxAge: AUTH_EXPIRES_IN_COOKIE,
        sameSite:'Strict'
    })
    if (userData.user) {
        res.cookie('authRole', userData.user.role.name, {
            domain: hostrule?.authCookieDomain,
            secure,
            httpOnly: false,
            expires: true,
            maxAge: AUTH_EXPIRES_IN_COOKIE,
            sameSite:'Strict'
        })
    }
}
export const removeAuthCookies = (req, res) => {
    const {hostrule} = getBestMatchingHostRule(getHostFromHeaders(req.headers))
    // without domain and - if configured - with the cookie domain of the hostrule
    const domains = hostrule?.authCookieDomain ? [undefined, hostrule.authCookieDomain] : [undefined]
    for (const domain of domains) {
        for (const name of ['auth', 'authRole']) {
            res.cookie(name, null, {
                ...(domain ? {domain} : {}),
                httpOnly: true,
                expires: new Date(0),
                maxAge: 0,
                sameSite: 'Strict'
            })
        }
    }
}

/**
 * true if the request carries a valid (signed, not expired) login token. Only the signature is
 * checked here - used to choose the body size limit before the body is read.
 */
export const hasLoginToken = (req) => {
    const token = USE_COOKIES ? parseCookies(req).auth : req.headers[AUTH_HEADER]
    if (!token) {
        return false
    }
    // silent - contextByRequest decodes (and logs) an invalid token right after
    const decoded = decodeToken(token, {silent: true})
    // contextByRequest reuses a valid result instead of verifying the signature again
    req._decodedLoginToken = {token, decoded}
    return !!decoded.id
}

// a valid token already decoded by hasLoginToken (same request) is not verified again
const decodeTokenOfRequest = (req, token) => {
    const cached = req._decodedLoginToken
    if (cached && cached.token === token && cached.decoded.id) {
        return {...cached.decoded}
    }
    return decodeToken(token)
}

export const contextByRequest = (req, res) => {
    let context

    const lang = req.headers[CONTENT_LANGUAGE_HEADER]

    if (USE_COOKIES) {

        const cookies = parseCookies(req)
        context = decodeTokenOfRequest(req, cookies.auth)

        if (context.exp) {
            const exp = new Date(context.exp * 1000)

            if (exp - new Date() - AUTH_EXPIRES_IN_COOKIE / 2 < 0) {
                // renew token & cookie
                const payload = {...context}
                delete payload.exp
                delete payload.iat
                delete payload.auth
                const token = jwt.sign(payload, SECRET_KEY, {expiresIn: AUTH_EXPIRES_IN})

                console.log('renew token')
                setAuthCookies({token}, req, res)

            }
        }


        context.session = cookies.session || crypto.randomBytes(16).toString('hex')

        if (!cookies.session && res) {
            // Set cookies
            res.cookie('session', context.session, {
                httpOnly: true,
                expires: false // only for session
            })
        }
    } else {

        // now if auth is needed we can check if the context is available
        context = decodeTokenOfRequest(req, req.headers[AUTH_HEADER])

        context.session = req.headers[SESSION_HEADER] || crypto.randomBytes(16).toString('hex')

        if (!req.headers[SESSION_HEADER] && res) {
            res.header(SESSION_HEADER, context.session)
        }
    }


    // add the requested language to the context
    context.lang = lang || DEFAULT_LANGUAGE
    context.clientId = req.headers[CLIENT_ID_HEADER]
    return context
}
