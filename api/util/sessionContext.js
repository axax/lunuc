import {
    AUTH_EXPIRES_IN_COOKIE,
    AUTH_HEADER,
    AUTH_SCHEME,
    CONTENT_LANGUAGE_HEADER,
    SESSION_HEADER,
    USE_COOKIES
} from '../constants'
import {parseCookies} from './parseCookies'
import {decodeToken} from './jwt'
import crypto from 'crypto'
import config from 'gen/config'
const {DEFAULT_LANGUAGE} = config

export const setAuthCookies = (userData,res) =>{

    res.cookie('auth', AUTH_SCHEME + ' '+userData.token, {
        httpOnly: true,
        expires: true,
        maxAge: AUTH_EXPIRES_IN_COOKIE
    })
    res.cookie('authRole', userData.user.role.name, {
        httpOnly: false,
        expires: true,
        maxAge: AUTH_EXPIRES_IN_COOKIE
    })
}
export const removeAuthCookies = (res) =>{

    res.cookie('auth', null, {
        httpOnly: true,
        expires: new Date(0),
        maxAge: 0
    })
    res.cookie('authRole', null, {
        httpOnly: true,
        expires: new Date(0),
        maxAge: 0
    })
}

export const contextByRequest = (req, res) => {
    let context

    const lang = req.headers[CONTENT_LANGUAGE_HEADER]

    if (USE_COOKIES) {

        const cookies = parseCookies(req)
        context = decodeToken(cookies.auth)
        context.session = cookies.session || crypto.randomBytes(16).toString("hex")

        if(!cookies.session && res) {
            // Set cookies
            res.cookie('session', context.session, {
                httpOnly: true,
                expires: false // only for session
            })
        }
    } else {

        // now if auth is needed we can check if the context is available
        context = decodeToken(req.headers[AUTH_HEADER])

        context.session = req.headers[SESSION_HEADER] || crypto.randomBytes(16).toString("hex")

        if(!req.headers[SESSION_HEADER] && res) {
            res.header(SESSION_HEADER, context.session)
        }
    }


    // add the requested language to the context
    context.lang = lang || DEFAULT_LANGUAGE

    return context
}