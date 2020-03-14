'use strict'
let net = require('net')
let http = require('http')
let http2 = require('http2')

exports.createServer = (opts, handler) => {

    let server = net.createServer(socket => {
        socket.once('data', buffer => {
            // Pause the socket
            socket.pause()

            // Determine if this is an HTTP(s) request
            let byte = buffer[0]
            console.log(byte)
            let protocol
            if (byte === 22) {
                protocol = 'https'
            } else if (32 < byte && byte < 127) {
                protocol = 'http'
            }

            let proxy = server[protocol]
            if (proxy) {
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
            process.nextTick(() =>{
                console.log("socket is paused:"+socket.isPaused())
                socket.resume()
            })
        })

        socket.once('end', (e) => {
            console.log('server socket end')
        })

    })


    server.http = http.createServer(handler)
    server.https = http2.createSecureServer(opts, handler)


    server.on('error',err=>{
        console.log('net err', err)
    })

    server.https.on('error',err=>{
        console.log('https err', err)
    })
    return server
}
