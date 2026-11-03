import https from 'https'
import http from 'http'
import dns from 'dns'
import net from 'net'

const MAX_REDIRECTS = 10
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308]

// SSRF protection (opt-in via option `blockPrivateNetworks: true`):
// rejects loopback, private, link-local (cloud metadata 169.254.x.x), CGNAT (100.64/10, alibaba metadata) etc.
const isPrivateIp = (ip) => {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number)
        return a === 0 || a === 10 || a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            a >= 224
    }
    if (net.isIPv6(ip)) {
        const l = ip.toLowerCase()
        if (l === '::' || l === '::1') return true
        const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
        if (mapped) return isPrivateIp(mapped[1])
        return l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb')
    }
    return true
}

// checked at connect time (no DNS rebinding) and on every redirect hop
const safeLookup = (hostname, opts, cb) => {
    dns.lookup(hostname, opts, (err, address, family) => {
        if (err) return cb(err)
        const list = Array.isArray(address) ? address : [{address, family}]
        const bad = list.find(a => isPrivateIp(a.address))
        if (bad) return cb(new Error(`Blocked request to private address (${hostname})`))
        cb(null, address, family)
    })
}

export const request = (options) => {

    const finalOptions = Object.assign({timeout: 60000}, options)

    // don't mutate the caller's headers object
    finalOptions.headers = Object.assign({}, options.headers)

    // HTTP methods are case-sensitive on the wire - "post" instead of "POST"
    // can lead to connection resets on strict servers / gateways
    if (finalOptions.method) {
        finalOptions.method = finalOptions.method.toUpperCase()
    }

    let httpx = https
    if (finalOptions.url) {
        const parsedUrl = new URL(finalOptions.url)

        finalOptions.hostname = parsedUrl.host.split(':')[0]
        finalOptions.protocol = parsedUrl.protocol
        finalOptions.port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)
        finalOptions.path = parsedUrl.pathname + parsedUrl.search

        if (parsedUrl.protocol === 'http:') {
            httpx = http
        }
    }

    // serialize body if a plain object was passed
    if (finalOptions.body && typeof finalOptions.body === 'object' && !Buffer.isBuffer(finalOptions.body)) {
        finalOptions.body = JSON.stringify(finalOptions.body)
        if (!finalOptions.headers['Content-Type']) {
            finalOptions.headers['Content-Type'] = 'application/json'
        }
    }

    if (finalOptions.body && !finalOptions.headers['Content-Length']) {
        finalOptions.headers['Content-Length'] = Buffer.byteLength(finalOptions.body)
    }

    if (finalOptions.blockPrivateNetworks) {
        if (finalOptions.protocol !== 'http:' && finalOptions.protocol !== 'https:') {
            return Promise.reject(new Error(`Protocol "${finalOptions.protocol}" not allowed`))
        }
        // ip literals skip dns lookup, so check them directly
        const host = String(finalOptions.hostname || '').replace(/^\[|\]$/g, '')
        if (net.isIP(host) && isPrivateIp(host)) {
            return Promise.reject(new Error(`Blocked request to private address (${host})`))
        }
        finalOptions.lookup = safeLookup
    }

    return new Promise((resolve, reject) => {
        const req = httpx.request(finalOptions, res => {

            // handle redirects
            if (finalOptions.followAllRedirects && REDIRECT_STATUS_CODES.includes(res.statusCode) && res.headers.location) {

                res.resume() // discard body so the socket is released

                finalOptions.redirectCount = (finalOptions.redirectCount || 0) + 1
                if (finalOptions.redirectCount >= MAX_REDIRECTS) {
                    reject(new Error('Too many redirects'))
                    return
                }

                // resolves absolute, relative and protocol-relative locations
                finalOptions.url = new URL(res.headers.location, finalOptions.url).href

                // per spec 301/302/303 downgrade to GET, 307/308 keep the method
                if ([301, 302, 303].includes(res.statusCode) && finalOptions.method && finalOptions.method !== 'GET') {
                    finalOptions.method = 'GET'
                    delete finalOptions.body
                    delete finalOptions.headers['Content-Length']
                    delete finalOptions.headers['Content-Type']
                }

                request(finalOptions).then(resolve).catch(reject)
                return
            }

            if (finalOptions.headerOnly) {
                resolve(res)
                req.destroy()
                return
            }

            const chunks = []

            res.on('data', (chunk) => {
                chunks.push(chunk)
            })

            res.on('end', () => {
                const data = Buffer.concat(chunks).toString(finalOptions.encoding || 'utf8')

                if (finalOptions.raw) {
                    res.body = data
                    res.finalUrl = finalOptions.url
                    res.finalRemoteIp = req.socket && req.socket.remoteAddress
                    resolve(res)
                } else if (finalOptions.json) {
                    let json
                    try {
                        json = JSON.parse(data)
                    } catch (e) {
                        // keep raw payload instead of silently swallowing it
                        json = {parseError: true, raw: data}
                    }
                    // expose status code without breaking existing callers
                    if (json && typeof json === 'object' && !Array.isArray(json)) {
                        Object.defineProperty(json, '_statusCode', {
                            value: res.statusCode,
                            enumerable: false
                        })
                    }
                    resolve(json)
                } else {
                    resolve(data)
                }
            })

            res.on('error', (error) => {
                reject(error)
            })

        })

        req.on('error', error => {
            reject(error)
        })

        // without this listener the timeout option has no effect
        req.on('timeout', () => {
            req.destroy(new Error(`Request timeout after ${finalOptions.timeout}ms to ${finalOptions.url || finalOptions.hostname}`))
        })

        if (finalOptions.body) {
            req.write(finalOptions.body)
        }
        req.end()

    })
}

export default request