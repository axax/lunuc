import {HEADER_TIMEOUT} from '../api/constants/index.mjs'

import net from 'net'
import http from 'http'
import http2 from 'http2'


const TLS_HANDSHAKE_BYTE = 0x16 // Decimal 22 -> TLS record content type "handshake"

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
        {allowHTTP1: true, ...tlsOpts},
        handler
    )

    // Timeouts.
    // headersTimeout / requestTimeout are HTTP/1.1 (http.Server) properties only;
    // setting them on the HTTP/2 server would be a no-op, so they're applied
    // to httpServer alone. HTTP/2 has its own timeout model (server.timeout,
    // session.setTimeout(), maxSessionMemory) if you need it later.
    httpServer.headersTimeout = HEADER_TIMEOUT
    httpServer.requestTimeout = 0 // 0 = disabled. Intentional for long-lived/streaming
                                  // requests; set a finite value if that's not required.

    // 2. Create the main NET server for connection routing
    const unifiedServer = net.createServer(socket => {
        // Detection-phase handlers. These only guard the brief window before we
        // hand the socket off; afterwards the chosen server owns the socket.
        const onError = err => {
            console.error('Unified Server Socket Error:', err.message)
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
            socket.removeListener('error', onError)

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
