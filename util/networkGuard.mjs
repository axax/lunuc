import dns from 'dns'
import net from 'net'
import {getBestMatchingHostRule} from './hostrules.mjs'

/*
 Protection against SSRF: decides whether a url may be opened by the server (e.g. in the headless
 browser) when the url comes from a request. Only http / https to public addresses are allowed -
 no file:, no localhost, no private / link-local networks (internal services, cloud metadata).

 Host names are resolved with the system resolver; the decision is cached per host name, so
 a page with many sub requests costs one lookup per host.

 Own domains (exact match of a hostrule, or www. of it) are always allowed: with hairpin NAT
 (dns extension) or /etc/hosts they resolve to 127.0.0.1 on the server itself, but they are
 the public sites of this installation.
 */

const isOwnHost = (host) => {
    if (!host || net.isIP(host)) {
        return false
    }
    try {
        const {hostrule, host: ruleHost, _exactMatch} = getBestMatchingHostRule(host, false)
        // exact match only - not every sub domain of an own domain
        return !!(hostrule && _exactMatch && ruleHost !== 'general')
    } catch (e) {
        return false
    }
}

const HOST_CACHE_TTL_MS = 60 * 1000
const HOST_CACHE_MAX = 1000
const hostCache = new Map()

const ipv4ToInt = ip => ip.split('.').reduce((n, part) => (n << 8) + parseInt(part, 10), 0) >>> 0

// [network, prefix length]
const PRIVATE_V4 = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['224.0.0.0', 4], ['240.0.0.0', 4]
].map(([network, bits]) => [ipv4ToInt(network), (~0 << (32 - bits)) >>> 0])

export const isPrivateAddress = (ip) => {
    const version = net.isIP(ip)
    if (version === 4) {
        const n = ipv4ToInt(ip)
        return PRIVATE_V4.some(([network, mask]) => ((n & mask) >>> 0) === network)
    }
    if (version === 6) {
        const lower = ip.toLowerCase()
        // ipv4 mapped (::ffff:127.0.0.1)
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
        if (mapped) {
            return isPrivateAddress(mapped[1])
        }
        return lower === '::' || lower === '::1' ||
            lower.startsWith('fc') || lower.startsWith('fd') || // unique local
            /^fe[89ab]/.test(lower) || // link local
            lower.startsWith('ff') || // multicast
            lower.startsWith('::ffff:') // other mapped forms
    }
    // not an ip
    return true
}

const isLocalName = host => !host || host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal')

/**
 * Synchronous check of a host name without dns lookup: local names and private ip addresses.
 * A name that resolves to a private address is only detected by isPublicHttpUrl.
 */
export const isPrivateHostname = (hostname) => {
    const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
    if (isLocalName(host)) {
        return true
    }
    return net.isIP(host) ? isPrivateAddress(host) : false
}

const lookupHostIsPublic = async (hostname) => {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (isLocalName(host)) {
        return false
    }
    if (net.isIP(host)) {
        return !isPrivateAddress(host)
    }
    try {
        const addresses = await dns.promises.lookup(host, {all: true, verbatim: true})
        return addresses.length > 0 && addresses.every(({address}) => !isPrivateAddress(address))
    } catch (e) {
        return false
    }
}

/**
 * true if the url is http(s) and its host only resolves to public addresses
 */
export const isPublicHttpUrl = async (url) => {
    let parsed
    try {
        parsed = new URL(url)
    } catch (e) {
        return false
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false
    }
    const now = Date.now()
    const cached = hostCache.get(parsed.hostname)
    if (cached && cached.expires > now) {
        return cached.isPublic
    }
    const isPublic = isOwnHost(parsed.hostname.toLowerCase()) || await lookupHostIsPublic(parsed.hostname)
    if (hostCache.size >= HOST_CACHE_MAX) {
        hostCache.delete(hostCache.keys().next().value)
    }
    hostCache.set(parsed.hostname, {isPublic, expires: now + HOST_CACHE_TTL_MS})
    return isPublic
}
