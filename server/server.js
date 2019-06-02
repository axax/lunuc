import proxy from 'http2-proxy'
import httpx from './httpx'
import url from 'url'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import config from 'gen/config'
import MimeType from '../util/mime'
import {getHostFromHeaders} from 'util/host'
const {UPLOAD_DIR, UPLOAD_URL, BACKUP_DIR, BACKUP_URL} = config

// Port to listen to
const PORT = (process.env.PORT || 8080)
const API_PORT = (process.env.API_PORT || 3000)

// Build dir
const BUILD_DIR = path.join(__dirname, '../build')


const options = {
    key: fs.readFileSync(path.join(__dirname, './server.key')),
    cert: fs.readFileSync(path.join(__dirname, './server.cert'))
}
// Initialize http api
const app = httpx.createServer(options, function (req, res) {
    if (!config.DEV_MODE && req.headers.host !== 'localhost:' + PORT && req.headers['x-forwarded-proto'] !== 'https') {
        if( process.env.APP_FORCE_HTTPS ) {
            console.log('Redirect to https' + req.headers.host)
            res.writeHead(301, {"Location": "https://" + req.headers.host + req.url})
            res.end()
        }
    }

    const uri = url.parse(req.url).pathname
    if (uri.startsWith('/graphql')) {
        // there is also /graphql/upload
        return proxy.web(req, res, {
            hostname: 'localhost',
            port: API_PORT,
            path: uri
        })

    } else {

        if (uri.startsWith(BACKUP_URL + '/')) {
            const backup_dir = path.join(__dirname, '../' + BACKUP_DIR)
            const filename = path.join(backup_dir, path.basename(uri))

            fs.exists(filename, (exists) => {
                if (exists) {
                    const fileStream = fs.createReadStream(filename)
                    const headerExtra = {}
                    res.writeHead(200, {...headerExtra})
                    fileStream.pipe(res)
                } else {
                    console.log('not exists: ' + filename)
                    res.writeHead(404, {'Content-Type': 'text/plain'})
                    res.write('404 Not Found\n')
                    res.end()
                }
            })


        } else if (uri.startsWith(UPLOAD_URL + '/')) {
            const upload_dir = path.join(__dirname, '../' + UPLOAD_DIR)
            // uploads
            const filename = path.join(upload_dir, uri.substring(UPLOAD_DIR.length +  1))

            fs.exists(filename, (exists) => {
                if (exists) {
                    const fileStream = fs.createReadStream(filename)
                    const headerExtra = {'Cache-Control': 'public, max-age=31536000'}
                    res.writeHead(200, {...headerExtra})
                    fileStream.pipe(res)
                } else {
                    console.log('not exists: ' + filename)
                    res.writeHead(404, {'Content-Type': 'text/plain'})
                    res.write('404 Not Found\n')
                    res.end()
                }
            })


        } else {
            const filename = path.join(BUILD_DIR, uri),
                ext = path.extname(filename).split('.')[1]


            if (ext) {


                fs.stat(filename, function (err, stats) {
                    if (err) {
                        console.log('not exists: ' + filename)
                        res.writeHead(404, {'Content-Type': 'text/plain'})
                        res.write('404 Not Found\n')
                        res.end()
                    } else {
                        const mimeType = MimeType.detectByExtension(ext),
                            headerExtra = {'Cache-Control': 'public, max-age=31536000', 'content-type': mimeType}
                        sendFile(req, res, headerExtra, filename);
                    }
                })
            } else {
                const headers = {
                    'Cache-Control': 'public, max-age=60',
                    'content-type': MimeType.detectByExtension('html')
                }

                let indexfile

                // TODO: resolve data in advance if possible

                // TODO: host rule to load host specific index files
                const host = getHostFromHeaders(req.headers)
                console.log(host, uri)
                if( host === 'www.onyou.ch'){
                    indexfile = path.join(BUILD_DIR, '/index.min.html')
                }else{
                    indexfile = path.join(BUILD_DIR, '/index.min.html')
                }

                sendFile(req, res, headers, indexfile);
            }
        }
    }
})


let sendFile = function (req, res, headerExtra, filename) {
    let acceptEncoding = req.headers['accept-encoding']
    if (!acceptEncoding) {
        acceptEncoding = ''
    }

    if (acceptEncoding.match(/\bgzip\b/)) {
        res.writeHead(200, {...headerExtra, 'content-encoding': 'gzip'})

        if (fs.existsSync(filename + '.gz')) {
            // if gz version is available send this instead
            const fileStream = fs.createReadStream(filename + '.gz')
            fileStream.pipe(res)
        } else {
            const fileStream = fs.createReadStream(filename)
            fileStream.pipe(zlib.createGzip()).pipe(res)
        }

    } else if (acceptEncoding.match(/\bdeflate\b/)) {
        res.writeHead(200, {...headerExtra, 'content-encoding': 'deflate'})

        const fileStream = fs.createReadStream(filename)
        fileStream.pipe(zlib.createDeflate()).pipe(res)
    } else {
        res.writeHead(200, {...headerExtra})

        const fileStream = fs.createReadStream(filename)
        fileStream.pipe(res)
    }
}

const webSocket = function (req, socket, head) {
    proxy.ws(req, socket, head, {
        hostname: 'localhost',
        port: API_PORT,
        path: '/ws'})
}

//
// Listen to the `upgrade` event and proxy the
// WebSocket requests as well.
//
app.http.on('upgrade', webSocket)
app.https.on('upgrade', webSocket)

// Start server
app.listen(PORT, () => console.log(
    `Listening at localhost:${PORT}`
))
