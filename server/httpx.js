'use strict'
let net = require('net')
let http = require('http')
let https = require('spdy')


/* TEMP FIX --> Remove once it is fixed */
var uv = process.binding('uv')
var sw = process.binding('stream_wrap')

https.handle.prototype._flow = function flow () {
    var self = this
    this._stream.on('data', function (chunk) {
        self.onread(chunk.length, chunk)
    })

    this._stream.on('end', function () {

        sw.streamBaseState[sw.kReadBytesOrError] = uv.UV_EOF
        self.onread(uv.UV_EOF, Buffer.alloc(0))
    })

    this._stream.on('close', function () {
        setImmediate(function () {
            if (self._reading) {
                self.onread(uv.UV_ECONNRESET, Buffer.alloc(0))
            }
        })
    })
}


exports.createServer = (opts, handler) => {

    let server = net.createServer(socket => {
        socket.once('data', buffer => {
            // Pause the socket
            socket.pause()

            // Determine if this is an HTTP(s) request
            let byte = buffer[0]
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
            process.nextTick(() => socket.resume())
        })
    })

    server.http = http.createServer(handler)
    server.https = https.createServer(opts, handler)
    return server
}
