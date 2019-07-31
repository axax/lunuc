/*
Util to extract hostname from http headers
 */

export const getHostFromHeaders= (headers) => {
    let host
    if (headers) {
        if (headers.forwarded) {
            // if request comes from proxy server
            const match = headers.forwarded.match(/(?<=(^|; )host=).*(?=(;|$))/)
            if (match) {
                host = match[0].split(':')[0]
            }
        }

        if (!host) {
            host = headers.host.split(':')[0]
        }
    }

    return host
}


/* returns the IP from a request */
export const clientAddress = (req) => {
    return (req.headers['x-forwarded-for'] || '').split(',')[0]
        || req.connection.remoteAddress
}
