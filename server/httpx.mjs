import {HEADER_TIMEOUT} from '../api/constants/index.mjs'

import net from 'net'
import http from 'http'
import http2 from 'http2'


const TLS_HANDSHAKE_BYTE = 0x16; // Decimal 22

/**
 * Creates a single server instance that routes connections to either
 * a standard HTTP/1.1 server or a secure HTTP/2 server.
 *
 * @param {object} tlsOpts - Options for the HTTP/2 server, MUST include key and cert.
 * @param {function} handler - The standard (req, res) request handler function.
 * @returns {net.Server} The combined network server instance.
 */
const createServer = (tlsOpts, handler) => {
    // 1. Create the dedicated HTTP/1.1 and HTTP/2 servers

    // HTTP/1.1 Cleartext Server
    const httpServer = http.createServer(handler);

    // HTTP/2 Secure Server (Handles TLS handshake and ALPN negotiation for 'h2')
    // This server must be provided with the key and cert.
    const http2Server = http2.createSecureServer(tlsOpts, handler);

    // Configure server timeouts
    httpServer.headersTimeout = HEADER_TIMEOUT;
    http2Server.headersTimeout = HEADER_TIMEOUT;
    httpServer.requestTimeout = 0;
    http2Server.requestTimeout = 0;

    // 2. Create the main NET server for connection routing
    const unifiedServer = net.createServer(socket => {
        // Only peek at the first byte to check for a TLS handshake marker
        socket.once('data', buffer => {
            // Pause the socket immediately after reading the first chunk
            socket.pause()

            const isTlsHandshake = buffer[0] === TLS_HANDSHAKE_BYTE

            // Push the initial data buffer back onto the front of the data stream
            socket.unshift(buffer)

            if (isTlsHandshake) {
                // Connection starts with 0x16 (TLS Handshake) -> Route to HTTP/2 Server

                // ⚠️ CRITICAL STEP: The socket must be handed directly to the
                // http2 server's internal listener, which wraps it in a TLSSocket
                // and handles ALPN/handshake before proceeding with HTTP/2.
                http2Server.emit('connection', socket)

            } else {
                // Connection does NOT start with 0x16 -> Route to HTTP/1.1 Server

                // Emit the original socket to the HTTP/1.1 server
                httpServer.emit('connection', socket)
            }

            // Resume the original socket in the next I/O cycle.
            // The receiving server (httpServer or http2Server) is now responsible
            // for processing the rest of the stream.
            setImmediate(() => {
                socket.resume()
            })
        })

        // Add essential error handling for the raw connection
        socket.on('error', (err) => {
            console.error('Unified Server Socket Error:', err.message)
            socket.destroy()
        })
    })

    // 3. Attach the dedicated servers for external access
    unifiedServer.http = httpServer
    unifiedServer.https = http2Server // Note: Renamed to avoid confusion with the module name

    return unifiedServer
}


/*const createServer = (opts, handler) => {

    let server = net.createServer(socket => {
        socket.once('data', buffer => {
            // Pause the socket
            socket.pause()
            // Determine if this is an HTTP(s) request
            let proxy
            const byte = buffer[0]
            if (byte === 22) {
                proxy = server.https
            } else if (32 < byte && byte < 127) {
                proxy = server.http
            }

            if(proxy) {
                // Push the buffer back onto the front of the data stream
                socket.unshift(buffer)

                // Emit the socket to the HTTP(s) server
                proxy.emit('connection', socket)
            }

            // As of NodeJS 10.x the socket must be
            // resumed asynchronously or the socket
            // connection hangs, potentially crashing
            // the process. Prior to NodeJS 10.x
            // the socket may be resumed synchronously.
            process.nextTick(() => {
                socket.resume()
            })
        })

        socket.once('end', (e) => {
            //console.log('server socket end')
        })

        socket.on('error', (err) => {
                console.log('Net Server: Caught httpx server socket error: ')
                console.log(err.stack)
                //socket.destroy()
            }
        )

       /* socket.on('timeout', () => {
            console.log('Net Server: Socket timeout')
            //socket.destroy();
        })*/
/*
    })


    server.http = http.createServer(handler)
    server.https = http2.createSecureServer(opts, handler)

    server.http.headersTimeout = HEADER_TIMEOUT
    server.https.headersTimeout = HEADER_TIMEOUT
    server.http.requestTimeout = 0
    server.https.requestTimeout = 0

    server.on('error', err => {
        console.log('net err', err)
    })

    server.https.on('error', err => {
        console.log('https err', err)
    })
    return server
}*/


export default {createServer}
