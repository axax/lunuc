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

// Connect timeout for the websocket proxy target. Without it a hanging
// API server (port open but not accepting) would stall the client forever.
const WS_CONNECT_TIMEOUT_MS = 5000

// Whether to verify TLS certificates when proxying to a secure (https)
// server node during failover. Defaults to secure (true). Only disable
// this via env var if you fully understand the risk: without cert
// validation, anyone able to intercept traffic between this proxy and an
// alternative node (e.g. on a shared network) can MITM inter-node traffic
// undetected. Previously this was hardcoded to false for all secure
// proxy requests.
const REJECT_UNAUTHORIZED_TLS = process.env.LUNUC_PROXY_ALLOW_INSECURE_TLS !== 'true'

// Hop-by-hop headers must not be forwarded to the next hop (RFC 7230 6.1).
// A leaked 'connection: close' would also sabotage the keep-alive agent pool.
const HOP_BY_HOP_HEADERS = new Set([
    'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding',
    'upgrade', 'te', 'trailer', 'proxy-authenticate', 'proxy-authorization'
])

// Headers that carry internal trust signals set by THIS proxy (client
// address, which hostrule/server this request was routed through, etc).
// Their names are public (this is an open source project), so a client
// could simply send these header names themselves. They must always be
// stripped from the incoming request before we (re)assign the trusted
// values ourselves - otherwise a client-supplied value would pass straight
// through to the API server on the first attempt (tries === 0), since it
// was previously only overwritten on retries.
const INTERNAL_ONLY_HEADERS = [
    FORWARDED_FOF_HEADER.toLowerCase(),
    HOSTRULE_HEADER.toLowerCase(),
    'x-forwarded-server',
    'x-forwarded-proto',
    'x-forwarded-host'
]

const stripInternalHeaders = (headers) => {
    for (const key of Object.keys(headers)) {
        if (INTERNAL_ONLY_HEADERS.includes(key.toLowerCase())) {
            delete headers[key]
        }
    }
    return headers
}

/**
 * Filters HTTP/2 pseudo headers (:path, :authority, ...) and hop-by-hop
 * headers from an incoming header object so it can be safely forwarded.
 * For websocket upgrades, 'upgrade' and 'connection' must be kept - use
 * keepUpgrade for that case.
 */
const filterForwardableHeaders = (headers, {keepUpgrade = false} = {}) => {
    return Object.fromEntries(
        Object.entries(headers).filter(([key]) => {
            if (/^:/.test(key)) {
                return false
            }
            const lower = key.toLowerCase()
            if (keepUpgrade && (lower === 'upgrade' || lower === 'connection')) {
                return true
            }
            return !HOP_BY_HOP_HEADERS.has(lower)
        })
    )
}

/**
 * True when the client response can no longer be used for a retry or an
 * error message (already answered, ended, or torn down).
 */
const isResponseUnusable = (res) => {
    return res.headersSent || res.writableEnded || res.destroyed
}

/**
 * Rejects any string containing raw CR or LF characters. Used as a
 * defense-in-depth guard before manually constructing raw HTTP/1.1 request
 * text for the websocket upgrade path (see proxyWsToApiServer). Node's own
 * http.request() validates header values against this automatically, but
 * the websocket path writes raw bytes to a plain socket instead, bypassing
 * that built-in protection - so we replicate the check here explicitly.
 */
const containsCrlf = (value) => /[\r\n]/.test(String(value))

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

    const state = {proxyReq: null, clientGone: false}

    req.on('aborted', () => {
        console.warn('Client aborted request.')
        state.clientGone = true
        if (state.proxyReq) {
            state.proxyReq.destroy()
        }
    })

    req.on('error', (err) => {
        console.error('Client request error:', err.message)
        state.clientGone = true
        if (state.proxyReq) {
            state.proxyReq.destroy()
        }
    })

    // Initial call starts with tries=0
    executeProxyRequest(req, res, {...options, tries: 0}, state)
}


export const proxyWsToApiServer = (req, socket, head) => {

    // Reject CRLF in the request line before doing anything else - this
    // request line is written to a raw socket further down, bypassing
    // Node's built-in header/url validation that http.request() would
    // normally provide.
    if (containsCrlf(req.url)) {
        console.warn('proxyWsToApiServer: rejecting request with CRLF in url')
        socket.destroy()
        return
    }

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
            console.error('Proxy socket error:', err.message || err)
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

    // Connect timeout: if the target doesn't accept within the window,
    // tear down instead of stalling the client indefinitely. Once connected
    // the timeout is disabled again - websocket connections are long-lived
    // and idle periods are normal.
    targetSocket.setTimeout(WS_CONNECT_TIMEOUT_MS, () => {
        cleanup(new Error(`websocket target connect timeout after ${WS_CONNECT_TIMEOUT_MS}ms`))
    })

    targetSocket.connect(API_PORT, API_HOST, () => {
        // connected - disable the connect timeout for the long-lived phase
        targetSocket.setTimeout(0)

        // Forward only clean HTTP/1.1 headers: no :pseudo headers, no
        // hop-by-hop headers except the upgrade/connection pair which the
        // websocket handshake requires. Internal-only headers are stripped
        // so a client can't spoof them (see INTERNAL_ONLY_HEADERS).
        const forwardHeaders = stripInternalHeaders(
            filterForwardableHeaders(req.headers, {keepUpgrade: true})
        )
        forwardHeaders[FORWARDED_FOF_HEADER] = clientAddress(req)

        // Defense in depth: header values could in principle contain CRLF
        // depending on the incoming protocol (see containsCrlf comment
        // above) - reject the whole upgrade rather than write malformed
        // data to a raw socket.
        for (const [key, value] of Object.entries(forwardHeaders)) {
            if (containsCrlf(key) || containsCrlf(value)) {
                console.warn(`proxyWsToApiServer: rejecting request with CRLF in header "${key}"`)
                cleanup(new Error('invalid header value'))
                return
            }
        }

        // Write the HTTP upgrade request to the target server
        targetSocket.write([
            `${req.method} ${req.url} HTTP/1.1`,
            ...Object.keys(forwardHeaders).map(key => `${key}: ${forwardHeaders[key]}`),
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
 * to a different node. Whether the body has started flowing is tracked
 * explicitly (bodyStarted) instead of assumed - a connection that fails after
 * data started flowing is never retried and results in a 502/destroy instead.
 */
const executeProxyRequest = (originalReq, originalRes, options, state) => {
    const {host, path, server, port, secure, tries} = options

    // Strip any client-supplied values for internal-trust headers BEFORE we
    // (re)assign the values this proxy actually trusts. Previously
    // HOSTRULE_HEADER/x-forwarded-server were only overwritten when
    // tries > 0, so a client sending these header names themselves (the
    // names are public - this is an open source project) had their value
    // forwarded unmodified to the API server on the first attempt.
    const newHeaders = stripInternalHeaders(filterForwardableHeaders(originalReq.headers))

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
        // See REJECT_UNAUTHORIZED_TLS above: only insecure if explicitly
        // opted into via LUNUC_PROXY_ALLOW_INSECURE_TLS=true. Previously
        // hardcoded to false (never verify), which allowed undetected MITM
        // on https connections to alternative server nodes during failover.
        rejectUnauthorized: REJECT_UNAUTHORIZED_TLS,
        timeout: 7200000 /* 2h socket inactivity timeout */
    }, (proxyRes) => {
        delete proxyRes.headers['keep-alive']
        delete proxyRes.headers['transfer-encoding']

        originalRes.writeHead(proxyRes.statusCode, proxyRes.headers)
        // push headers out immediately - matters for SSE / streaming responses
        // where the client should receive the head before the first event
        if (typeof originalRes.flushHeaders === 'function') {
            originalRes.flushHeaders()
        }
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
    // bodyStarted is the explicit signal for the retry logic: once true,
    // the body stream is (partially) consumed and MUST NOT be replayed.
    let piping = false
    let bodyStarted = false
    const startPiping = () => {
        if (piping) {
            return
        }
        piping = true
        bodyStarted = true
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

    const finalizeWithError = (code, msg) => {
        if (!isResponseUnusable(originalRes)) {
            sendError(originalRes, code, msg)
        } else if (!originalRes.destroyed) {
            originalRes.destroy()
        }
        proxyReq.destroy()
    }

    // Retry logic on connection failure
    proxyReq.on('error', async (err) => {
        try {
            // Retry conditions (ALL must hold):
            // - ECONNREFUSED: the failure happened during connect
            // - !bodyStarted: not a single body byte has been consumed, so the
            //   request can be replayed losslessly to another node
            // - !state.clientGone: the client is still there
            // - response still usable: nothing has been written to the client
            if (err.code === 'ECONNREFUSED' && !bodyStarted && !state.clientGone &&
                !isResponseUnusable(originalRes) && LUNUC_SERVER_NODES) {

                console.log('Proxy ECONNREFUSED -> attempting retry with alternative server.')

                // defensive: make sure nothing is piped into the dead request
                originalReq.unpipe(proxyReq)

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
            finalizeWithError(502, `Bad Gateway: Could not connect to API server. ${err.message}`)

        } catch (retryErr) {
            // getGatewayIp / URL parsing may throw inside this async handler -
            // without this catch it would surface as an unhandled rejection
            // and the client would never get a response
            console.error('Proxy retry failed:', retryErr)
            finalizeWithError(502, 'Bad Gateway')
        }
    })

    // Handle socket inactivity timeout from the API server connection
    proxyReq.on('timeout', () => {
        console.error(`Proxy request timeout (Attempt ${tries})`)
        proxyReq.destroy()
        if (!isResponseUnusable(originalRes)) {
            sendError(originalRes, 504, 'Gateway Timeout: API server did not respond in time.')
        } else if (!originalRes.destroyed) {
            originalRes.destroy()
        }
    })
}