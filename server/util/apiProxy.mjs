import http from 'http'
import https from 'https'
import {sendError} from './file.mjs'
import {Socket} from 'net'
import {clientAddress} from '../../util/host.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'
import {FORWARDED_FOF_HEADER, HOSTRULE_HEADER} from '../../api/constants/index.mjs'

const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)
const API_HOST = 'localhost'
const LUNUC_SERVER_NODES = process.env.LUNUC_SERVER_NODES || ''

/**
 * Main entry point function for the proxy.
 *
 * The request body is streamed straight through to the API server (no
 * buffering) so that arbitrarily large uploads work without exhausting memory.
 * Client-side abort/error listeners are attached once here and always target
 * the currently active proxy request via the shared `state` holder, so retries
 * do not stack listeners on the original request.
 */
export const proxyToApiServer = (req, res, options) => {

    const state = {proxyReq: null}

    req.on('aborted', () => {
        console.warn('Client aborted request.')
        if (state.proxyReq) {
            state.proxyReq.destroy()
        }
    })

    req.on('error', (err) => {
        console.error('Client request error:', err.message)
        if (state.proxyReq) {
            state.proxyReq.destroy()
        }
    })

    // Initial call starts with tries=0
    executeProxyRequest(req, res, {...options, tries: 0}, state)
}


export const proxyWsToApiServer = (req, socket, head) => {

    console.log(`Proxying WebSocket connection to ${API_HOST}:${API_PORT}`)

    // Create connection to target server
    const targetSocket = new Socket()

    // Tear down both sockets exactly once. On a clean close we end() so any
    // pending bytes are flushed before sending FIN; on an error we destroy()
    // immediately to release the connection.
    let cleanedUp = false
    const cleanup = (err) => {
        if (cleanedUp) {
            return
        }
        cleanedUp = true
        if (err) {
            console.error('Proxy socket error:', err)
            socket.destroy()
            targetSocket.destroy()
        } else {
            // graceful: flush pending bytes, then FIN
            socket.end()
            targetSocket.end()
        }
    }

    // Register listeners before connect() so an early failure can't slip
    // through. 'close' passes a hadError boolean - forward it so a reset that
    // arrives without a preceding 'error' is still treated as a hard failure.
    socket.on('error', cleanup)
    targetSocket.on('error', cleanup)
    socket.on('close', (hadError) => cleanup(hadError ? new Error('client socket closed with error') : undefined))
    targetSocket.on('close', (hadError) => cleanup(hadError ? new Error('target socket closed with error') : undefined))

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

        // Pipe both directions; errors are handled by the listeners above
        socket.pipe(targetSocket)
        targetSocket.pipe(socket)
    })
}

/**
 * Executes a single proxy attempt. The body of `originalReq` is only piped once
 * the outgoing socket has actually connected. This is what makes the
 * ECONNREFUSED failover safe: if the connection is refused, no bytes have been
 * read from `originalReq` yet, so the next attempt can pipe the untouched body
 * to a different node. A connection that fails *after* data started flowing
 * cannot be retried (the body stream is already partially consumed) and results
 * in a 502/destroy instead.
 */
const executeProxyRequest = (originalReq, originalRes, options, state) => {
    const {host, path, server, port, secure, tries} = options

    const newHeaders = Object.fromEntries(
        Object.entries(originalReq.headers).filter(([key]) => !/^:/.test(key))
    )

    newHeaders[FORWARDED_FOF_HEADER] = clientAddress(originalReq)
    newHeaders['x-forwarded-proto'] = originalReq.isHttps ? 'https' : 'http'
    newHeaders['x-forwarded-host'] = host
    if (tries > 0) {
        newHeaders[HOSTRULE_HEADER] = host
        newHeaders['x-forwarded-server'] = server
    }

    // Create the outgoing request stream
    const proxyReq = (secure ? https : http).request({
        hostname: server || API_HOST,
        port: port || API_PORT,
        path: path,
        method: originalReq.method,
        headers: newHeaders,
        rejectUnauthorized: false,
        timeout: 7200000 /* 2h socket inactivity timeout */
    }, (proxyRes) => {
        delete proxyRes.headers['keep-alive']
        delete proxyRes.headers['transfer-encoding']

        originalRes.writeHead(proxyRes.statusCode, proxyRes.headers)
        proxyRes.pipe(originalRes)

        proxyRes.on('aborted', () => {
            console.warn('Proxy response aborted')
            originalRes.destroy()
        })
    })

    // remember the active proxy request so the client-side abort/error
    // listeners (attached once in proxyToApiServer) can destroy it
    state.proxyReq = proxyReq

    // Only start streaming the body after the connection is established.
    // Guard so it runs exactly once (covers both fresh and reused sockets).
    let piping = false
    const startPiping = () => {
        if (piping) {
            return
        }
        piping = true
        originalReq.pipe(proxyReq)
    }

    proxyReq.on('socket', (socket) => {
        if (socket.connecting) {
            socket.once('connect', startPiping)
        } else {
            // socket was reused from the agent pool and is already connected
            startPiping()
        }
    })

    // Retry logic on connection failure
    proxyReq.on('error', async (err) => {
        // ECONNREFUSED fires during connect, i.e. before startPiping ran, so the
        // body of originalReq is still intact and can be replayed to another node
        if (err.code === 'ECONNREFUSED' && LUNUC_SERVER_NODES) {

            console.log('Proxy ECONNREFUSED -> attempting retry with alternative server.')

            const remoteAdr = clientAddress(originalReq)
            const gatewayIp = await getGatewayIp()
            const servers = LUNUC_SERVER_NODES.split(',')

            // Walk the eligible servers and pick the (tries)-th one, so each
            // successive retry targets the next untried node.
            let eligibleIndex = 0
            for (const s of servers) {
                // skip servers that point back at the client or the gateway
                if (s.indexOf(remoteAdr) < 0 && s.indexOf(gatewayIp) < 0) {

                    if (eligibleIndex < tries) {
                        eligibleIndex++
                        continue
                    }

                    const urlObj = new URL(s)
                    console.log(`Retrying on server: ${urlObj.hostname} (attempt=${tries} server=${urlObj.hostname} port=${urlObj.port} protocol=${urlObj.protocol} path=${path})`)

                    // Recursively call the function for the retry
                    executeProxyRequest(originalReq, originalRes, {
                        host,
                        path,
                        server: urlObj.hostname,
                        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                        secure: urlObj.protocol === 'https:',
                        tries: tries + 1
                    }, state)
                    return
                }
            }
        }

        // Final error handling if no more retries or a different error
        console.error(`Proxy error connecting to API (Attempt ${tries}):`, err.message)
        if (!originalRes.headersSent) {
            sendError(originalRes, 502, `Bad Gateway: Could not connect to API server. ${err.message}`)
        } else {
            originalRes.destroy()
        }
        proxyReq.destroy()
    })

    // Handle socket inactivity timeout from the API server connection
    proxyReq.on('timeout', () => {
        console.error(`Proxy request timeout (Attempt ${tries})`)
        proxyReq.destroy()
        if (!originalRes.headersSent) {
            sendError(originalRes, 504, 'Gateway Timeout: API server did not respond in time.')
        } else {
            originalRes.destroy()
        }
    })
}