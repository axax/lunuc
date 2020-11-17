
export const parseCookies = req => {
    const list = {},
        rc = req.headers.cookie

    rc && rc.split(';').forEach(function( cookie ) {
        const parts = cookie.split('=')
        list[parts.shift().trim()] = decodeURI(parts.join('='))
    })

    return list
}
