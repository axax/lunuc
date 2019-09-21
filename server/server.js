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


// load hostrules
const HOSTRULES_DIR = path.join(__dirname, '../hostrules/')
const hostrules = {}

fs.readdir(HOSTRULES_DIR, (err, filenames) => {
    if (err) {
        return;
    }
    filenames.forEach((filename) => {
        if (filename.endsWith('.json')) {
            fs.readFile(HOSTRULES_DIR + filename, 'utf-8', function (err, content) {
                if (err) {
                    return
                }
                hostrules[filename.substring(0, filename.length - 5)] = JSON.parse(content)
            })
        }
    })
})


// Port to listen to
const PORT = (process.env.PORT || 8080)
const API_PORT = (process.env.API_PORT || 3000)

// Build dir
const BUILD_DIR = path.join(__dirname, '../build')
const STATIC_DIR = path.join(__dirname, '../' + config.STATIC_DIR)


const options = {
    key: fs.readFileSync(path.join(__dirname, './server.key')),
    cert: fs.readFileSync(path.join(__dirname, './server.cert'))
}
// Initialize http api
const app = httpx.createServer(options, function (req, res) {
    if (!config.DEV_MODE && req.headers.host !== 'localhost:' + PORT && req.headers['x-forwarded-proto'] !== 'https') {
        if (process.env.APP_FORCE_HTTPS) {
            console.log('Redirect to https' + req.headers.host)
            res.writeHead(301, {"Location": "https://" + req.headers.host + req.url})
            res.end()
        }
    }

    const uri = url.parse(req.url).pathname

    if (uri.startsWith('/graphql') || uri.startsWith('/api/')) {
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
            const filename = path.join(upload_dir, uri.substring(UPLOAD_DIR.length + 1).replace(/\.\.\//g, ''))


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
            const host = getHostFromHeaders(req.headers)

            // check with and without www
            const hostrule = hostrules[host] || hostrules[host.substring(4)]


            let staticFile

            if (hostrule && hostrule.fileMapping[uri]) {
                staticFile = path.join(__dirname, '../' + hostrule.fileMapping[uri])
            } else {
                staticFile = path.join(STATIC_DIR, uri)
            }


            fs.stat(staticFile, function (errStats, staticStats) {

                if (errStats || !staticStats.isFile()) {
                    // it is not a static file so check in build dir

                    const filename = path.join(BUILD_DIR, uri)
                    const ext = path.extname(filename).split('.')[1]
                    if (ext) {
                        fs.stat(filename, function (err, stats) {
                            if (err || !stats.isFile()) {
                                console.log('not exists: ' + filename)
                                res.writeHead(404, {'Content-Type': 'text/plain'})
                                res.write('404 Not Found\n')
                                res.end()
                            } else {
                                const mimeType = MimeType.detectByExtension(ext),
                                    headerExtra = {
                                        'Cache-Control': 'public, max-age=31536000',
                                        'Content-Type': mimeType,
                                        'Last-Modified': stats.mtime.toUTCString()
                                    }
                                sendFile(req, res, headerExtra, filename);
                            }
                        })
                    } else {
                        const headers = {
                            'Cache-Control': 'public, max-age=60',
                            'content-type': MimeType.detectByExtension('html')
                        }

                        let indexfile

                        if (hostrule && hostrule.fileMapping['/index.html']) {
                            indexfile = path.join(__dirname, '../' + hostrule.fileMapping['/index.html'])
                        } else {
                            // default index
                            indexfile = path.join(BUILD_DIR, '/index.min.html')
                        }

                        sendFile(req, res, headers, indexfile);
                    }
                } else {
                    // static file
                    const ext = path.extname(staticFile).split('.')[1]
                    const mimeType = MimeType.detectByExtension(ext),
                        headerExtra = {
                            'Cache-Control': 'public, max-age=31536000',
                            'Content-Type': mimeType,
                            'Last-Modified': staticStats.mtime.toUTCString()
                        }
                    sendFile(req, res, headerExtra, staticFile);
                }
            })
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
        path: '/ws'
    })
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
