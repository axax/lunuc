import {HEADER_TIMEOUT} from '../api/constants/index.mjs'

import net from 'net'
import http from 'http'
import http2 from 'http2'

const createServer = (opts, handler) => {

    let server = net.createServer(socket => {
        socket.once('data', buffer => {
            // Pause the socket
            socket.pause()
            // Determine if this is an HTTP(s) request
            let proxy

            if (buffer[0] === 22) {
                proxy = server.https
            } else /*if (32 < byte && byte < 127)*/ {
                proxy = server.http
            }

            // Push the buffer back onto the front of the data stream
            socket.unshift(buffer)

            // Emit the socket to the HTTP(s) server
            proxy.emit('connection', socket)

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
                console.log('Caught httpx server socket error: ')
                console.log(err.stack)
                //socket.destroy()
            }
        )

    })


    server.http = http.createServer(handler)
    server.https = http2.createSecureServer(opts, handler)

    server.http.headersTimeout = HEADER_TIMEOUT
    server.https.headersTimeout = HEADER_TIMEOUT


    server.on('error', err => {
        console.log('net err', err)
    })

    server.https.on('error', err => {
        console.log('https err', err)
    })
    return server
}

export default {createServer}
