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

        // Check if the response stream from the server closed normally
        proxyRes.on('end', () => {
            // Ensure the client response stream is closed as well if not already
            if (!res.finished) {
                res.end()
            }
        })

        res.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(res)
    })

    req.pipe(proxyReq)

    // a) Handle errors from the **API Server** connection (DNS, connection refused, timeout)
    proxyReq.on('error', (err) => {
        console.error('Proxy error connecting to API:', err.message);
        // Clean up the client response if headers haven't been sent
        if (!res.headersSent) {
            sendError(res, 502, `Bad Gateway: Could not connect to API server. ${err.message}`)
        } else {
            // If data was already streaming, just destroy the connection
            res.destroy()
        }
        // Destroy the request stream to stop sending data
        proxyReq.destroy()
    })

    // b) Handle timeouts from the **API Server** connection
    proxyReq.on('timeout', () => {
        console.error('Proxy request timeout')
        proxyReq.destroy() // Destroy the connection
        if (!res.headersSent) {
            sendError(res, 504, 'Gateway Timeout: API server did not respond in time.')
        } else {
            res.destroy()
        }
    })

    // c) Handle client request closure/error **before** piping is complete (client disconnects early)
    req.on('aborted', () => {
        console.warn('Client aborted request.')
        proxyReq.destroy() // Abort the proxy request as well
    })

    req.on('error', (err) => {
        console.error('Client request error:', err.message)
        proxyReq.destroy() // Abort the proxy request
    })

    // d) Handle client response closure/error **during** piping (client closes connection mid-stream)
    res.on('close', () => {
        //console.warn('Client connection closed.')
        proxyReq.destroy() // Abort the proxy request
    })

    res.on('error', (err) => {
        console.error('Client response error:', err.message)
        proxyReq.destroy() // Abort the proxy request
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