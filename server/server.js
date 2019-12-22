import proxy from 'http2-proxy'
import httpx from './httpx'
import url from 'url'
import path from 'path'
import net from 'net'
import fs from 'fs'
import zlib from 'zlib'
import config from 'gen/config'
import MimeType from '../util/mime'
import {getHostFromHeaders} from 'util/host'
import finalhandler from 'finalhandler'


const defaultWebHandler = (err, req, res) => {
    if (err) {
        console.error('proxy error', err)
        finalhandler(req, res)(err)
    }else{
        res.end()
    }
}

const defaultWSHandler = (err, req, socket, head) => {
    if (err) {
        console.error('proxy error ws ', err)
        socket.destroy()
    }
}


const {UPLOAD_DIR, UPLOAD_URL, BACKUP_DIR, BACKUP_URL, API_PREFIX} = config


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
const PORT = (process.env.LUNUC_PORT || process.env.PORT || 8080)
const API_PORT = (process.env.LUNUC_API_PORT || process.env.API_PORT || 3000)

// Build dir
const BUILD_DIR = path.join(__dirname, '../build')
const STATIC_DIR = path.join(__dirname, '../' + config.STATIC_DIR)
const CERT_DIR = process.env.LUNUC_CERT_DIR || __dirname


const options = {
    key: fs.readFileSync(path.join(CERT_DIR, './privkey.pem')),
    cert: fs.readFileSync(path.join(CERT_DIR, './cert.pem')),
    allowHTTP1: true
}

if( fs.existsSync(path.join(CERT_DIR, './chain.pem'))){
    options.ca = fs.readFileSync(path.join(CERT_DIR, './chain.pem'))
}


// Initialize http api
const app = httpx.createServer(options, function (req, res) {

    const host = getHostFromHeaders(req.headers)

    if (host !== 'localhost' && !net.isIP(host)) {

        // force www
        let newhost = host
        if (!newhost.startsWith('www.')) {
            const hostrule = hostrules[host]
            if( hostrule && hostrule.forceWWW) {
                newhost = 'www.' + newhost
            }
        }

        if (!config.DEV_MODE && this.constructor.name === 'Server') {
            if (process.env.LUNUC_FORCE_HTTPS) {

                console.log(`${req.connection.remoteAddress}: Redirect to https ${newhost}`)

                res.writeHead(301, {"Location": "https://" + newhost + req.url})
                res.end()
                return
            }
        }

        if (newhost != host) {
            console.log(`${req.connection.remoteAddress}: Redirect to ${newhost}`)
            res.writeHead(301, {"Location": (this.constructor.name === 'Server' ? 'http' : 'https') + "://" + newhost + req.url})
            res.end()
            return
        }
    }

    const uri = url.parse(req.url).pathname

    console.log(`${req.connection.remoteAddress}: ${uri}`)

    if (uri.startsWith('/graphql') || uri.startsWith('/' + API_PREFIX)) {
        // there is also /graphql/upload
        return proxy.web(req, res, {
            hostname: 'localhost',
            port: API_PORT,
            path: uri
        }, defaultWebHandler)

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
            const filename = path.join(upload_dir, uri.substring(UPLOAD_URL.length + 1).replace(/\.\.\//g, ''))


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

            // check with and without www
            const hostrule = hostrules[host] || hostrules[host.substring(4)]


            let staticFile

            if (hostrule && hostrule.fileMapping && hostrule.fileMapping[uri]) {
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

                        if (hostrule && hostrule.fileMapping && hostrule.fileMapping['/index.html']) {
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



//app.https.on('error', (err) => console.error(err));

/*app.https.on('stream', (stream, headers) => {
    // stream is a Duplex
    stream.respond({
        'content-type': 'text/html',
        ':status': 200
    });
    stream.end('<h1>Hello World</h1>');
});*/



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
    }, defaultWSHandler)
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
