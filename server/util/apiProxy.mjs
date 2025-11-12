import http from 'http'
import https from 'https'
import {sendError} from './file.mjs'
import {Socket} from 'net'
import {Readable} from 'stream'
import {clientAddress} from '../../util/host.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'

const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)
const API_HOST = 'localhost'
const LUNUC_SERVER_NODES = process.env.LUNUC_SERVER_NODES || ''

/**
 * Main entry point function for the proxy.
 */
export const proxyToApiServer = async (req, res, options) => {
    let bufferedBody = Buffer.alloc(0)

    // Only buffer if a body is expected
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        try {
            bufferedBody = await getBodyBuffer(req)
        } catch (err) {
            console.error('Error buffering client request:', err)
            return sendError(res, 400, 'Error reading request body.')
        }
    }

    // Now call the function that handles the proxy attempt and retries
    // Initial call starts with tries=0
    executeProxyRequest(req, res, { ...options, tries: 0 }, bufferedBody)
};

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


/**
 * Executes the proxy request using the provided buffer for the body.
 * NOTE: The original req and res are passed for metadata/response, but the body
 * is sourced from the bufferedBody.
 */
const executeProxyRequest = (originalReq, originalRes, options, bufferedBody) => {
    const { host, path, server, port, secure, tries } = options

    // 1. Prepare Headers (same as your original logic)
    const newHeaders = Object.fromEntries(
        Object.entries(originalReq.headers).filter(([key]) => !/^:/.test(key))
    )

    newHeaders['x-forwarded-for'] = originalReq.socket.remoteAddress
    newHeaders['x-forwarded-proto'] = originalReq.isHttps ? 'https' : 'http'
    newHeaders['x-forwarded-host'] = host


    // 2. Create the Outgoing Request Stream
    const proxyReq = (secure ? https : http).request({
        hostname: server || API_HOST,
        port: port || API_PORT,
        path: path,
        method: originalReq.method,
        headers: newHeaders,
        rejectUnauthorized: false,
        requestTimeout:2000,
        timeout: 7200000, /* 2h */
    }, (proxyRes) => {
        // ... (Response handling is the same)
        delete proxyRes.headers['keep-alive']
        delete proxyRes.headers['transfer-encoding']

        proxyRes.on('end', () => {
            if (!originalRes.finished) {
                originalRes.end()
            }
        })

        proxyRes.on('aborted', () => {
            console.warn('Proxy response aborted')
            originalRes.end()
            originalRes.destroy()
        })

        originalRes.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(originalRes)
    });

    // 3. Pipe the Buffered Body to the Outgoing Request
    // Create a NEW Readable stream from the buffer for this attempt
    Readable.from(bufferedBody).pipe(proxyReq)

    // 4. Set up Retry Logic on Failure
    proxyReq.on('error', async (err) => {
        if (err.code === 'ECONNREFUSED' && LUNUC_SERVER_NODES) {

            // --- YOUR SERVER SELECTION LOGIC ---
            console.log('Proxy ECONNREFUSED -> attempting retry with alternative server.');

            const remoteAdr = clientAddress(originalReq);
            const gatewayIp = await getGatewayIp();
            const servers = LUNUC_SERVER_NODES.split(',');

            let count = 0
            for (const s of servers) {
                // Check if the server does not match the client address or gateway IP
                // and if it's NOT the server we just tried (not explicitly checked here,
                // but implied by the logic below if 'server' is used as a filter).
                if (s.indexOf(remoteAdr) < 0 && s.indexOf(gatewayIp) < 0) {

                    if ( count < tries){
                        continue
                    }
                    const urlObj = new URL(s)
                    console.log(`Retrying on server: ${urlObj.hostname} (attempt=${tries} server=${urlObj.hostname} port=${urlObj.port} protocol=${urlObj.protocol} path=${path})`)

                    // Recursively call the function for the retry
                    executeProxyRequest(originalReq, originalRes, {
                        host,
                        path,
                        server: urlObj.hostname, // Use the new hostname
                        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80), // Use port from URL or default
                        secure: urlObj.protocol === 'https:',
                        tries: tries + 1 // Pass the incremented count
                    }, bufferedBody)
                    return

                }
            }
        }

        // Final error handling if no more retries or different error
        console.error(`Proxy error connecting to API (Attempt ${tries}):`, err.message)
        if (!originalRes.headersSent) {
            sendError(originalRes, 502, `Bad Gateway: Could not connect to API server. ${err.message}`)
        } else {
            originalRes.destroy()
        }
        proxyReq.destroy()
    })

    // ... (rest of the error/timeout/cleanup handlers)
    // d) Handle timeouts from the **API Server** connection
    proxyReq.on('timeout', () => {
        console.error(`Proxy request timeout (Attempt ${currentAttempt})`)
        proxyReq.destroy()
        if (!originalRes.headersSent) {
            sendError(originalRes, 504, 'Gateway Timeout: API server did not respond in time.')
        } else {
            originalRes.destroy()
        }
    })

    // e) Handle client request closure/error **before** piping is complete (client disconnects early)
    originalReq.on('aborted', () => {
        console.warn('Client aborted request.')
        proxyReq.destroy()
    })

    originalReq.on('error', (err) => {
        console.error('Client request error:', err.message)
        proxyReq.destroy()
    })
}

// Helper function to read the entire request body into a buffer
const getBodyBuffer = (req) => {
    return new Promise((resolve, reject) => {
        const chunks = []
        req.on('data', (chunk) => {
            chunks.push(chunk)
        })
        req.on('end', () => {
            resolve(Buffer.concat(chunks))
        })
        req.on('error', reject)
    })
}