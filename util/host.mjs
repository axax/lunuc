/*
Util to extract hostname from http headers
 */

import {FORWARDED_FOF_HEADER, HOSTRULE_HEADER, TRACK_IP_HEADER} from '../api/constants/index.mjs'
import net from 'net'
import dns from 'dns'

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


/*
 Proxy headers (x-track-ip, x-forwarded-for) can be sent by any client. They are only
 trusted if the request comes from a trusted address:
 - loopback and private networks (own processes, e.g. web server -> api, headless browser)
 - the public ip of this server (requests to itself)
 - the nodes in LUNUC_SERVER_NODES (failover between servers)
 - addresses or ipv4 ranges (a.b.c.d/nn) in LUNUC_TRUSTED_PROXIES (comma separated)
 Otherwise anybody could fake his ip and bypass rate limits, login blocking, asn blocker...
 */
const normalizeIp = ip => ip ? String(ip).trim().replace(/^::ffff:/, '') : ''

const ipv4ToInt = ip => ip.split('.').reduce((acc, part) => (acc * 256) + (parseInt(part) & 255), 0)

const parseTrustedEntry = entry => {
    entry = entry.trim()
    if (!entry) return null
    const [ip, bits] = entry.split('/')
    if (bits !== undefined && net.isIPv4(ip)) {
        const maskBits = parseInt(bits)
        const mask = maskBits <= 0 ? 0 : (0xffffffff << (32 - Math.min(maskBits, 32))) >>> 0
        return {base: (ipv4ToInt(ip) & mask) >>> 0, mask}
    }
    return {ip: normalizeIp(ip)}
}

const trustedEntries = (process.env.LUNUC_TRUSTED_PROXIES || '').split(',').map(parseTrustedEntry).filter(Boolean)
const trustedNodeIps = new Set()

// server nodes are urls (can be host names) -> resolve them once
const serverNodes = (process.env.LUNUC_SERVER_NODES || '').split(',').map(s => s.trim()).filter(Boolean)
serverNodes.forEach(node => {
    let hostname = node
    try {
        hostname = new URL(node).hostname
    } catch (e) {
    }
    hostname = hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(hostname)) {
        trustedNodeIps.add(normalizeIp(hostname))
    } else if (hostname) {
        dns.lookup(hostname, {all: true}, (err, addresses) => {
            if (!err && addresses) {
                addresses.forEach(a => trustedNodeIps.add(normalizeIp(a.address)))
            }
        })
    }
})

let ownPublicIp = null, ownPublicIpLookup = false
const lookupOwnPublicIp = () => {
    if (ownPublicIpLookup) return
    ownPublicIpLookup = true
    import('./gatewayIp.mjs').then(({getGatewayIp}) => getGatewayIp()).then(ip => {
        if (ip && ip !== '127.0.0.1') {
            ownPublicIp = normalizeIp(ip)
        } else {
            // retry later
            setTimeout(() => {
                ownPublicIpLookup = false
            }, 60000).unref?.()
        }
    }).catch(() => {
        ownPublicIpLookup = false
    })
}

const isPrivateOrLoopback = ip => {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(n => parseInt(n))
        return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
            (a === 169 && b === 254) || a === 0
    }
    const lower = ip.toLowerCase()
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
}

export const isTrustedProxyAddress = (address) => {
    const ip = normalizeIp(address)
    if (!ip) return false
    if (isPrivateOrLoopback(ip) || trustedNodeIps.has(ip)) return true
    if (ownPublicIp) {
        if (ip === ownPublicIp) return true
    } else {
        lookupOwnPublicIp()
    }
    if (trustedEntries.length > 0) {
        const ipInt = net.isIPv4(ip) ? ipv4ToInt(ip) : null
        for (const entry of trustedEntries) {
            if (entry.ip !== undefined ? entry.ip === ip : (ipInt !== null && ((ipInt & entry.mask) >>> 0) === entry.base)) {
                return true
            }
        }
    }
    return false
}

const socketAddress = req => normalizeIp(req.socket?.remoteAddress || req.connection?.remoteAddress)

/* true if the proxy headers of this request can be trusted */
export const isFromTrustedProxy = (req) => {
    const remote = req ? socketAddress(req) : ''
    // no socket (e.g. internally created request objects) -> behave as before
    return !remote || isTrustedProxyAddress(remote)
}

/* Returns the IP from a request */
export const clientAddress = (req) => {
    let ip = ''
    if (req.headers && isFromTrustedProxy(req)) {
        if (req.headers[TRACK_IP_HEADER]) {
            ip = req.headers[TRACK_IP_HEADER].split(',')[0].trim()
        } else if (req.headers[FORWARDED_FOF_HEADER]) {
            ip = req.headers[FORWARDED_FOF_HEADER].split(',')[0].trim()
        }
    }
    if (!ip) {
        ip = req.socket?.remoteAddress || req.connection?.remoteAddress || ''
    }

    return ip ? ip.replace('::ffff:', '') : null
}
