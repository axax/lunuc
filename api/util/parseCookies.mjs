
/*
 Cookies of a request as {name: value}.
 - parsed once per request (several places read them: body limit, session context, ...)
 - a cookie with an invalid %-sequence (e.g. set by a third party script) is taken as it is -
   before, decodeURI threw and the whole request failed
 */
export const parseCookies = req => {
    if (req._parsedCookies && req._parsedCookiesSource === req.headers.cookie) {
        return req._parsedCookies
    }
    const list = {},
        rc = req.headers.cookie

    rc && rc.split(';').forEach(function (cookie) {
        const parts = cookie.split('=')
        const name = parts.shift().trim()
        const value = parts.join('=')
        try {
            list[name] = decodeURI(value)
        } catch (e) {
            list[name] = value
        }
    })

    req._parsedCookies = list
    req._parsedCookiesSource = rc
    return list
}
