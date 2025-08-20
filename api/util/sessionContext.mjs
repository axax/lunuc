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
    res.cookie('auth', AUTH_SCHEME + ' ' + userData.token, {
        domain: hostrule?.authCookieDomain,
        httpOnly: true,
        expires: true,
        maxAge: AUTH_EXPIRES_IN_COOKIE,
        sameSite:'Strict'
    })
    if (userData.user) {
        res.cookie('authRole', userData.user.role.name, {
            domain: hostrule?.authCookieDomain,
            httpOnly: false,
            expires: true,
            maxAge: AUTH_EXPIRES_IN_COOKIE,
            sameSite:'Strict'
        })
    }
}
export const removeAuthCookies = (req, res) => {
    const {hostrule} = getBestMatchingHostRule(getHostFromHeaders(req.headers))
    res.cookie('auth', null, {
        httpOnly: true,
        expires: new Date(0),
        maxAge: 0,
        sameSite: 'Strict'
    })
    res.cookie('authRole', null, {
        httpOnly: true,
        expires: new Date(0),
        maxAge: 0,
        sameSite: 'Strict'
    })
    if(hostrule?.authCookieDomain) {
        res.cookie('auth', null, {
            domain: hostrule.authCookieDomain,
            httpOnly: true,
            expires: new Date(0),
            maxAge: 0,
            sameSite: 'Strict'
        })
        res.cookie('authRole', null, {
            domain: hostrule.authCookieDomain,
            httpOnly: true,
            expires: new Date(0),
            maxAge: 0,
            sameSite: 'Strict'
        })
    }
}

export const contextByRequest = (req, res) => {
    let context

    const lang = req.headers[CONTENT_LANGUAGE_HEADER]

    if (USE_COOKIES) {

        const cookies = parseCookies(req)
        context = decodeToken(cookies.auth)

        if (context.exp) {
            const exp = new Date(context.exp * 1000)

            if (exp - new Date() - AUTH_EXPIRES_IN_COOKIE / 2 < 0) {
                // renew token & cookie
                const payload = {username: context.username, id: context.id, role: context.role, group: context.group}
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
        context = decodeToken(req.headers[AUTH_HEADER])

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
