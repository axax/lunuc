import {HEADER_TIMEOUT} from '../api/constants/index.mjs'

import net from 'net'
import http from 'http'
import http2 from 'http2'


const TLS_HANDSHAKE_BYTE = 0x16 // Decimal 22 -> TLS record content type "handshake"

// HTTP/2 flow control tuning.
// Node's default initialWindowSize is 64KB which caps per-stream throughput
// at roughly windowSize / RTT (e.g. ~1MB/s at 66ms RTT). Larger windows let
// big static assets (JS bundles, images) stream without waiting for
// WINDOW_UPDATE frames on every 64KB.
const H2_STREAM_WINDOW_SIZE = 1024 * 1024 // 1MB per stream
const H2_SESSION_WINDOW_SIZE = 2 * 1024 * 1024 // 2MB per connection
const H2_MAX_SESSION_MEMORY = 32 // MB, default is 10 - give headroom for larger windows

// Keepalive for idle connections.
// Firewalls / NAT / VPNs drop idle TCP state silently (no FIN/RST reaches the
// browser). Chrome then pings the dead HTTP/2 session, waits 10s for the ack
// and only afterwards opens a new connection -> requests "stalled" for 10s.
// TCP keepalive + H2 PING keep that state alive, and sessions without any
// stream activity are closed cleanly (GOAWAY) so the browser reconnects
// immediately instead of reusing a dead connection.
const TCP_KEEPALIVE_MS = 30 * 1000
const H2_PING_INTERVAL_MS = 30 * 1000
const H2_IDLE_CLOSE_MS = 5 * 60 * 1000

/**
 * Creates a single server instance that routes connections to either
 * a cleartext HTTP/1.1 server or a secure HTTP/2 server, based on whether
 * the first byte of the connection looks like a TLS handshake.
 *
 * @param {import('tls').SecureContextOptions} tlsOpts
 *   Options for the HTTP/2 secure server. MUST include `key` and `cert`.
 *   `allowHTTP1` defaults to `true` so that TLS clients which negotiate
 *   `http/1.1` via ALPN (instead of `h2`) are not rejected. Pass
 *   `allowHTTP1: false` explicitly to force HTTP/2-only over TLS.
 * @param {function} handler - The standard (req, res) request handler.
 * @returns {net.Server} The combined network server instance.
 */
const createServer = (tlsOpts, handler) => {
    // 1. Create the dedicated HTTP/1.1 and HTTP/2 servers

    // HTTP/1.1 cleartext server
    const httpServer = http.createServer(handler)

    // HTTP/2 secure server (handles the TLS handshake and ALPN negotiation).
    // allowHTTP1: true lets TLS clients that don't speak h2 fall back to
    // HTTP/1.1 over TLS instead of getting a connection error.
    const http2Server = http2.createSecureServer(
        {
            allowHTTP1: true,
            ciphers: "DEFAULT:@SECLEVEL=0",
            maxSessionMemory: H2_MAX_SESSION_MEMORY,
            settings: {
                initialWindowSize: H2_STREAM_WINDOW_SIZE
            },
            ...tlsOpts
        },
        handler
    )

    // Raise the connection-level flow control window as well
    // (separate from the per-stream window configured above).
    http2Server.on('session', session => {
        try {
            session.setLocalWindowSize(H2_SESSION_WINDOW_SIZE)
        } catch (e) {
            // session may already be closed/destroyed - safe to ignore
        }

        // Track stream activity ourselves: session.setTimeout() would never
        // fire because our own PING frames count as activity.
        let openStreams = 0
        let lastStreamActivity = Date.now()
        session.on('stream', stream => {
            openStreams++
            lastStreamActivity = Date.now()
            stream.once('close', () => {
                openStreams--
                lastStreamActivity = Date.now()
            })
        })

        const pingTimer = setInterval(() => {
            if (session.destroyed || session.closed) {
                clearInterval(pingTimer)
                return
            }
            if (openStreams <= 0 && Date.now() - lastStreamActivity > H2_IDLE_CLOSE_MS) {
                // idle for too long -> GOAWAY, browser opens a fresh connection next time
                clearInterval(pingTimer)
                try {
                    session.close()
                } catch (e) {
                    // ignore
                }
                return
            }
            try {
                session.ping(() => {
                    // no ack within the socket timeout is handled by node/tcp - nothing to do
                })
            } catch (e) {
                // session closing or too many outstanding pings - ignore
            }
        }, H2_PING_INTERVAL_MS)
        if (pingTimer.unref) {
            pingTimer.unref()
        }
        session.once('close', () => clearInterval(pingTimer))
    })

    // TLS handshake failures (port scans, ancient clients, aborted handshakes)
    // are normal noise on a public server. Destroy quietly instead of
    // logging full stacks or letting them bubble up.
    http2Server.on('tlsClientError', (err, tlsSocket) => {
        if (tlsSocket && !tlsSocket.destroyed) {
            tlsSocket.destroy()
        }
    })

    // Timeouts.
    // headersTimeout / requestTimeout are HTTP/1.1 (http.Server) properties only;
    // setting them on the HTTP/2 server would be a no-op, so they're applied
    // to httpServer alone. HTTP/2 has its own timeout model (server.timeout,
    // session.setTimeout(), maxSessionMemory) if you need it later.
    httpServer.headersTimeout = HEADER_TIMEOUT
    httpServer.requestTimeout = 0 // 0 = disabled. Intentional for long-lived/streaming

    http2Server.timeout = 2 * 60 * 1000 * 60 // 2h

    // 2. Create the main NET server for connection routing
    const unifiedServer = net.createServer(socket => {

        // Disable Nagle's algorithm so small packets (TLS handshake records,
        // HTTP/2 frames) are sent immediately instead of being buffered.
        socket.setNoDelay(true)

        // TCP keepalive keeps NAT / firewall state of idle connections alive
        // (also applies to the TLS socket that later wraps this socket)
        socket.setKeepAlive(true, TCP_KEEPALIVE_MS)

        // Detection-phase handlers. These only guard the brief window before we
        // hand the socket off; afterwards the chosen server owns the socket.
        const onError = err => {
            // ECONNRESET from scans/dropped clients is expected noise
            if (err.code !== 'ECONNRESET') {
                console.error('Unified Server Socket Error:', err.message)
            }
            socket.destroy()
        }
        const onTimeout = () => {
            // Client connected but never sent the first byte -> close it so a
            // stalled connection can't tie up resources (slowloris-style).
            socket.destroy()
        }

        socket.on('error', onError)
        socket.setTimeout(HEADER_TIMEOUT, onTimeout)

        // Peek at the first chunk to decide which protocol this is.
        socket.once('data', buffer => {
            // Pause and detach the detection-phase guards; the downstream
            // server sets up its own timeout/error handling from here on.
            socket.pause()
            socket.setTimeout(0)
            socket.removeListener('timeout', onTimeout)
            // Instead of just removeListener('error', onError): replace the
            // detection-phase handler with a silent no-op. The downstream
            // server (http2Server / httpServer) attaches its own error
            // handling, but if the raw socket fires an 'error' right before
            // or during this handoff (especially during the TLS handshake)
            // and nobody is listening yet, it becomes an uncaughtException.
            // An empty listener keeps EventEmitter satisfied without
            // interfering with the downstream handling.
            socket.removeListener('error', onError)
            socket.on('error', () => {})

            // Defensive: the 'data' event normally carries >= 1 byte, but guard
            // against an empty buffer just in case.
            if (!buffer || buffer.length === 0) {
                socket.destroy()
                return
            }

            const isTlsHandshake = buffer[0] === TLS_HANDSHAKE_BYTE

            // Put the peeked bytes back at the front of the stream so the
            // downstream TLS layer / HTTP parser sees the full data.
            socket.unshift(buffer)

            // 0x16 -> TLS handshake -> HTTP/2 secure server (wraps the raw
            //         socket in a TLSSocket and runs ALPN/handshake).
            // otherwise -> cleartext HTTP/1.1 server.
            const target = isTlsHandshake ? http2Server : httpServer
            target.emit('connection', socket)

            // Resume on the next tick, once the receiving server has attached
            // its own readable handlers during the synchronous emit above.
            process.nextTick(() => socket.resume())
        })
    })

    // 3. Attach the dedicated servers for external access
    unifiedServer.http = httpServer
    unifiedServer.https = http2Server

    return unifiedServer
}


export default {createServer}