// util/gatewayIp.mjs
//
// Resolves and caches the server's public ip.
//
// Fixes over the previous version:
//   - errors are no longer cached forever: a lookup failure at startup
//     used to pin GATEWAY_IP to '127.0.0.1' until the next restart,
//     silently disabling the gateway exemption in the request pipeline.
//     Failures now return the fallback WITHOUT caching it and retry on
//     the next call (with a short backoff so a dead ip service cannot
//     be hammered on every request).
//   - concurrent first calls share one in-flight lookup instead of each
//     starting their own external request.
//   - successful values refresh softly after a ttl (public ip changes
//     are rare on a vps with a static ip, but the refresh is free).

import network from 'network'

const SUCCESS_TTL_MS = 3600000  // re-check once per hour
const FAILURE_BACKOFF_MS = 30000 // retry failed lookups after 30s at most

let cachedIp = null
let cacheExpires = 0
let failedUntil = 0
let inFlight = null

const getPublicIpAsPromise = () => {
    return new Promise((resolve) => {
        network.get_public_ip(function (error, ip) {
            resolve({error, ip})
        })
    })
}

export const getGatewayIp = async (forced) => {

    const now = Date.now()

    if (!forced && cachedIp && now < cacheExpires) {
        return cachedIp
    }

    // failure backoff: do not hit the external service on every request
    // while it is down - keep serving the last known ip (or the fallback)
    if (!forced && now < failedUntil) {
        return cachedIp || '127.0.0.1'
    }

    // deduplicate concurrent lookups (e.g. request burst at startup)
    if (!inFlight) {
        inFlight = (async () => {
            try {
                const response = await getPublicIpAsPromise()
                if (!response.error && response.ip) {
                    cachedIp = response.ip
                    cacheExpires = Date.now() + SUCCESS_TTL_MS
                    failedUntil = 0
                } else {
                    // do NOT cache the failure as a value - keep the previous
                    // ip if we ever had one, retry after the backoff
                    console.warn('gatewayIp: public ip lookup failed', response.error?.message || response.error)
                    failedUntil = Date.now() + FAILURE_BACKOFF_MS
                }
            } catch (e) {
                console.warn('gatewayIp: public ip lookup threw', e.message)
                failedUntil = Date.now() + FAILURE_BACKOFF_MS
            } finally {
                inFlight = null
            }
        })()
    }

    await inFlight

    return cachedIp || '127.0.0.1'
}