import http from 'http'
import {sendError} from './file.mjs'
import {Socket} from 'net'

const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)
const API_HOST = 'localhost'

export const proxyToApiServer = (req, res, {host, path})=> {

    const newHeaders = Object.fromEntries(
        Object.entries(req.headers).filter(
            ([key]) => !/^:/.test(key)
        )
    )

    newHeaders['x-forwarded-for'] = req.socket.remoteAddress
    newHeaders['x-forwarded-proto'] = req.isHttps ? 'https' : 'http'
    newHeaders['x-forwarded-host'] = host


    const proxyReq = http.request({
        hostname: API_HOST,
        port: API_PORT,
        path: path,
        method: req.method,
        headers: newHeaders,
        timeout: 3600000, /* 1h */
    }, (proxyRes) => {
        delete proxyRes.headers['keep-alive']
        delete proxyRes.headers['transfer-encoding']
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
    })

    req.pipe(proxyReq)

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err)
        sendError(res, 502)
    })
}

export const proxyWsToApiServer = (req, socket, head) => {

    console.log(`Proxying WebSocket connection to ${API_HOST}:${API_PORT}`)

    // Create connection to target server
    const targetSocket = new Socket()
    targetSocket.connect(API_PORT, API_HOST, () => {
        // Write the HTTP upgrade request to the target server
        targetSocket.write([
            `${req.method} ${req.url} HTTP/${req.httpVersion}`,
            ...Object.keys(req.headers).map(key => `${key}: ${req.headers[key]}`),
            '', // Empty line to separate headers from body
            ''
        ].join('\r\n'))
        // Forward the upgrade head if present
        if (head && head.length) {
            targetSocket.write(head)
        }
        // Pipe the sockets together
        socket.pipe(targetSocket)
        targetSocket.pipe(socket)
    })
    // Handle errors on both sockets
    socket.on('error', (err) => {
        console.error('Client socket error:', err)
        targetSocket.end()
    })
    targetSocket.on('error', (err) => {
        console.error('Target socket error:', err)
        socket.end()
    })
    // Clean up when either socket closes
    socket.on('close', () => {
        targetSocket.end()
    })
    targetSocket.on('close', () => {
        socket.end()
    })
}