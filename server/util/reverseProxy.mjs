import https from 'https'
import http from 'http'
import {HOSTRULE_HEADER} from '../../api/constants/index.mjs'



export function isUrlValidForPorxing(urlPathname, hostrule) {
    if(hostrule.reverseProxy){
        if(hostrule.reverseProxy.exceptions){
            for(const exception of hostrule.reverseProxy.exceptions){
                const regex = new RegExp(exception)
                if (regex.test(urlPathname)) {
                    // URL matches an exception pattern, skip validation
                    return false
                }
            }
        }
        return true
    }
    return false
}
export function actAsReverseProxy(req, res, {parsedUrl, hostrule, host}) {

    const isHttps = hostrule.reverseProxy.ssl===false?false:req.isHttps

    const filteredHeaders = Object.fromEntries(
        Object.entries(req.headers).filter(
            ([name]) => name && !name.startsWith(':')
        )
    )

    filteredHeaders[HOSTRULE_HEADER] = host

    const options = {
        hostname: hostrule.reverseProxy.ip,
        port: parsedUrl.port || '8080',
        path: req.url,
        method: req.method || 'GET',
        headers: filteredHeaders,
        rejectUnauthorized: false
    }

    const proxyReq = (isHttps?https:http).request(options, (proxyRes) => {
        // Forward response headers and status code

        const filteredProxyHeaders = Object.fromEntries(
            Object.entries(proxyRes.headers).filter(
                ([name]) => name && !name.toLowerCase().startsWith('keep-alive')
            )
        )

        res.writeHead(proxyRes.statusCode, filteredProxyHeaders)
        // Pipe the response data
        proxyRes.pipe(res, { end: true })
    })

    // Pipe the request body
    req.pipe(proxyReq, { end: true })

    // Handle errors
    proxyReq.on('error', (err) => {
        console.log('Proxy error',err)
        res.writeHead(502)
        res.end('Proxy error')
    })
}