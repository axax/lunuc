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
import {AUTH_HEADER} from 'api/constants'
import {decodeToken} from 'api/util/jwt'
import puppeteer from 'puppeteer'

const defaultWebHandler = (err, req, res) => {
    if (err) {
        console.error('proxy error', err)
        finalhandler(req, res)(err)
    } else {
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

if (fs.existsSync(path.join(CERT_DIR, './chain.pem'))) {
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
            if (hostrule && hostrule.forceWWW) {
                newhost = 'www.' + newhost
            }
        }

        if (!config.DEV_MODE && this.constructor.name === 'Server') {
            if (process.env.LUNUC_FORCE_HTTPS) {

                const agent = req.headers['user-agent'], agentParts = agent?agent.split(' '):[]

                let browser, version
                if (agentParts.length > 2) {

                    const browserPart = agentParts[agentParts.length - 1].split('/'),
                        versionPart = agentParts[agentParts.length - 2].split('/')

                    browser = browserPart[0].trim().toLowerCase()
                    if (versionPart.length > 1) {
                        version = parseInt(versionPart[1])
                    }

                }


                console.log(`${req.connection.remoteAddress}: Redirect to https ${newhost} / user-agent: ${agent} / browser=${browser} / version=${version}`)

                if (browser === 'safari' && version < 6) {
                    // only a little test as safari version small 6 doesn't support tls 1.2
                } else {
                    res.writeHead(301, {"Location": "https://" + newhost + req.url})
                    res.end()
                    return
                }
            }
        }

        if (newhost != host) {
            console.log(`${req.connection.remoteAddress}: Redirect to ${newhost}`)
            res.writeHead(301, {"Location": (this.constructor.name === 'Server' ? 'http' : 'https') + "://" + newhost + req.url})
            res.end()
            return
        }
    }

    const parsedUrl = url.parse(req.url, true), uri = parsedUrl.pathname

    if (uri.indexOf('..') >= 0) {
        sendError(res, 403)
        return
    }

    console.log(`${req.connection.remoteAddress}: ${uri}`)

    if (uri.startsWith('/graphql') || uri.startsWith('/' + API_PREFIX)) {
        // there is also /graphql/upload
        return proxy.web(req, res, {
            hostname: 'localhost',
            port: API_PORT,
            path: req.url,
            onReq: (req, {headers}) => {
                headers['x-forwarded-for'] = req.socket.remoteAddress
                headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http'
                headers['x-forwarded-host'] = host
            }
        }, defaultWebHandler)

    } else {

        if (uri.startsWith(BACKUP_URL + '/')) {

            const context = decodeToken(req.headers[AUTH_HEADER])

            if (context.id) {
                // only allow download if valid jwt token is set
                const backup_dir = path.join(__dirname, '../' + BACKUP_DIR)
                const filename = path.join(backup_dir, uri.substring(BACKUP_URL.length))
                fs.exists(filename, (exists) => {
                    if (exists) {
                        const fileStream = fs.createReadStream(filename)
                        const headerExtra = {}
                        res.writeHead(200, {...headerExtra})
                        fileStream.pipe(res)
                    } else {
                        console.log('not exists: ' + filename)
                        sendError(res, 404)
                    }
                })
            } else {
                sendError(res, 403)
            }


        } else if (uri.startsWith(UPLOAD_URL + '/')) {
            const upload_dir = path.join(__dirname, '../' + UPLOAD_DIR)
            // uploads

            const pos = uri.indexOf('/' + config.PRETTYURL_SEPERATOR + '/')
            let modUri
            if (pos >= 0) {
                modUri = uri.substring(0, pos)
            }else{
                modUri = uri
            }


            const filename = path.join(upload_dir, modUri.substring(UPLOAD_URL.length + 1).replace(/\.\.\//g, ''))


            fs.exists(filename, (exists) => {
                if (exists) {
                    const stat = fs.statSync(filename)

                    const headerExtra = {
                        'Vary': 'Accept-Encoding',
                        'Last-Modified': stat.mtime.toUTCString(),
                        'Connection': 'Keep-Alive',
                        'Cache-Control': 'public, max-age=31536000',
                        'Content-Length': stat.size
                    }
                    let code = 200, streamOption

                    let ext = parsedUrl.query.ext

                    if (!ext) {
                        const pos = filename.lastIndexOf('.')
                        if (pos >= 0) {
                            ext = filename.substring(pos + 1).toLocaleLowerCase()
                        }
                    }
                    if (ext) {
                        const mimeType = MimeType.detectByExtension(ext)

                        headerExtra['Content-Type'] = mimeType

                        if (ext === 'mp3' || ext === 'mp4') {

                            delete headerExtra['Cache-Control']
                            headerExtra['Accept-Ranges'] = 'bytes'

                            const range = req.headers.range

                            if (req.headers.range) {
                                const parts = range.replace(/bytes=/, "").split("-"),
                                    partialstart = parts[0],
                                    partialend = parts[1],
                                    start = parseInt(partialstart, 10),
                                    end = partialend ? parseInt(partialend, 10) : stat.size - 1,
                                    chunksize = (end - start) + 1

                                code = 206
                                streamOption = {start, end}
                                headerExtra['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size
                                headerExtra['Content-Length'] = chunksize

                            }
                        }
                    }

                    const fileStream = fs.createReadStream(filename, streamOption)
                    res.writeHead(code, {...headerExtra})
                    fileStream.pipe(res)
                } else {
                    console.log('not exists: ' + filename)
                    sendError(res, 404)
                }
            })


        } else {

            // check with and without www
            const hostRuleHost = req.headers['x-host-rule']?req.headers['x-host-rule'].split(':')[0]:host
            const hostrule = {...hostrules.general, ...(hostrules[hostRuleHost] || hostrules[hostRuleHost.substring(4)])}


            let staticFile

            if (hostrule.fileMapping && hostrule.fileMapping[uri]) {
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
                                sendIndexFile(req, res, uri, hostrule, host)
                            } else {
                                const mimeType = MimeType.detectByExtension(ext),
                                    headerExtra = {
                                        'Cache-Control': 'public, max-age=31536000',
                                        'Content-Type': mimeType,
                                        'Last-Modified': stats.mtime.toUTCString(),
                                        ...hostrule.headers[uri]
                                    }
                                sendFile(req, res, headerExtra, filename);
                            }
                        })
                    } else {
                        sendIndexFile(req, res, uri, hostrule, host)
                    }
                } else {
                    // static file
                    const ext = path.extname(staticFile).split('.')[1]
                    const mimeType = MimeType.detectByExtension(ext),
                        headerExtra = {
                            'Cache-Control': 'public, max-age=31536000',
                            'Content-Type': mimeType,
                            'Last-Modified': staticStats.mtime.toUTCString(),
                            ...hostrule.headers[uri]
                        }
                    sendFile(req, res, headerExtra, staticFile);
                }
            })
        }
    }
})

const sendIndexFile = async (req, res, uri, hostrule, host) => {
    const headers = {
        'Cache-Control': 'public, max-age=60',
        'content-type': MimeType.detectByExtension('html'),
        ...hostrule.headers[uri]
    }

    const agent = req.headers['user-agent']
    if(agent && agent.indexOf('bingbot')>-1 || agent.indexOf('msnbot')>-1) {

        // return rentered html for bing as they are not able to render js properly
        //const html = await parseWebsite(`${req.secure ? 'https' : 'http'}://${host}${host === 'localhost' ? ':' + PORT : ''}${uri}`)
        const baseUrl = `http://localhost:${PORT}`
        let html = await parseWebsite(baseUrl+uri, host)
        const re = new RegExp(baseUrl, 'g')
        html = html.replace(re,`https://${host}`)


        res.writeHead(200, headers)
        res.write(html)
        res.end()

    }else {
        let indexfile

        if (hostrule.fileMapping && hostrule.fileMapping['/index.html']) {
            indexfile = path.join(__dirname, '../' + hostrule.fileMapping['/index.html'])
        } else {
            // default index
            indexfile = path.join(BUILD_DIR, '/index.min.html')
        }
        sendFile(req, res, headers, indexfile);
    }
}

const parseWebsite = async (urlToFetch, host) => {
    console.log(`fetch ${urlToFetch}`)
    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
    const page = await browser.newPage()

    await page.setRequestInterception(true)
    await page.setExtraHTTPHeaders({ 'x-host-rule': host })

    page.on('request', (request) => {
        if (['image', 'stylesheet', 'font'].indexOf(request.resourceType()) !== -1) {
            request.abort()
        } else {
            request.continue()
        }
    })

    await page.goto(urlToFetch, {waitUntil: 'networkidle2'})

    const html = await page.content()




    await browser.close()

    return html
}

//app.https.on('error', (err) => console.error(err));

/*app.https.on('stream', (stream, headers) => {
    // stream is a Duplex
    stream.respond({
        'content-type': 'text/html',
        ':status': 200
    });
    stream.end('<h1>Hello World</h1>');
});*/


const sendError = (res, code) => {
    let msg = ''
    if (code === 404) {
        msg = 'Not Found'
    } else if (code === 403) {
        msg = 'Not Allowed'
    }


    res.writeHead(code, {'Content-Type': 'text/plain'})
    res.write(`${code} ${msg}\n`)
    res.end()
}

const sendFile = function (req, res, headerExtra, filename) {
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
