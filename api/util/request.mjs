import https from 'https'
import http from 'http'

const MAX_REDIRECTS = 10
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308]

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