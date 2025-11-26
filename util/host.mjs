/*
Util to extract hostname from http headers
 */

import {FORWARDED_FOF_HEADER, HOSTRULE_HEADER, TRACK_IP_HEADER} from '../api/constants/index.mjs'

export const getHostFromHeaders= (headers) => {
    let host=''
    if (headers) {
        if( headers[HOSTRULE_HEADER]) {
            host = headers[HOSTRULE_HEADER].split(':')[0]
        }else if( headers['x-forwarded-host']){
            host = headers['x-forwarded-host'].split(':')[0]
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

        if (!host && headers.host) {
            host = headers.host.split(':')[0]
        }
    }
    return host
}


/* returns the IP from a request */
export const clientAddress = (req) => {
    let ip = ''
    if(req.headers) {
        if (req.headers[TRACK_IP_HEADER]) {
            ip = req.headers[TRACK_IP_HEADER].split(',')[0]
        } else if (req.headers[FORWARDED_FOF_HEADER]) {
            ip = req.headers[FORWARDED_FOF_HEADER].split(',')[0]
        }
    }
    if(!ip) {
        ip = req.connection.remoteAddress
    }

    return ip?ip.replace('::ffff:', ''):null
}
