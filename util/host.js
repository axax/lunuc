/*
Util to extract hostname from http headers
 */

export const getHostFromHeaders= (headers) => {
    let host
    if (headers) {
        if( headers[':authority']){
            //http2
            host = headers[':authority'].split(':')[0]
        }else if (headers.forwarded) {
            // if request comes from proxy server
            const aHost = headers.forwarded.split(';').filter(e => e.startsWith('host='))
            if (aHost.length>0) {
                host = aHost[0].substring(5)
            }
        }

        if (!host) {
            host = headers.host.split(':')[0]
        }
    }
    console.log(host, headers)
    return host
}


/* returns the IP from a request */
export const clientAddress = (req) => {
    return (req.headers['x-forwarded-for'] || '').split(',')[0]
        || req.connection.remoteAddress
}
