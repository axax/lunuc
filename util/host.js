/*
Util to extract hostname from http headers
 */

export const getHostFromHeaders= (headers) => {
    let host
    if (headers) {
        if( headers['x-track-host']){
            host = headers['x-track-host'].split(':')[0]
        }else if( headers[':authority']){
            //http2
            host = headers[':authority'].split(':')[0]
        }else if (headers.forwarded) {
            // if request comes from proxy server
            const aHost = headers.forwarded.split(';').filter(e => e.startsWith('host='))
            if (aHost.length > 0) {
                host = aHost[0].substring(5).split(':')[0]
            }
        }

        if (!host) {
            if (headers.host) {
                host = headers.host.split(':')[0]
            } else {
                console.log(headers)
                host = ''
            }
        }
    }
    return host
}


/* returns the IP from a request */
export const clientAddress = (req) => {
    if(req.headers) {
        if (req.headers['x-track-ip']) {
            return req.headers['x-track-ip'].split(',')[0]
        } else if (req.headers['x-forwarded-for']) {
            return req.headers['x-forwarded-for'].split(',')[0]
        }
    }
    return req.connection.remoteAddress
}
