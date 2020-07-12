import proxy from 'http2-proxy'
import httpx from './httpx'
import http from 'http'
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
import sharp from 'sharp'
import Util from '../client/util'
import {loadAllHostrules} from '../util/hostrules'

const {UPLOAD_DIR, UPLOAD_URL, BACKUP_DIR, BACKUP_URL, API_PREFIX, WEBROOT_ABSPATH} = config
const ABS_UPLOAD_DIR = path.join(__dirname, '../' + UPLOAD_DIR)

const hostrules = loadAllHostrules(true)


// Use Httpx
const USE_HTTPX = process.env.LUNUC_HTTPX === 'false' ? false : true

// Port to listen to
const PORT = (process.env.PORT || process.env.LUNUC_PORT || 8080)
const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)

// Build dir
const BUILD_DIR = path.join(__dirname, '../build')
const STATIC_DIR = path.join(__dirname, '../' + config.STATIC_DIR)
const STATIC_TEMPLATE_DIR = path.join(__dirname, '../' + config.STATIC_TEMPLATE_DIR)
const CERT_DIR = process.env.LUNUC_CERT_DIR || __dirname
const PKEY_FILE_DIR = path.join(CERT_DIR, './privkey.pem')
const CERT_FILE_DIR = path.join(CERT_DIR, './cert.pem')
let pkey, cert
if (fs.existsSync(PKEY_FILE_DIR)) {
    pkey = fs.readFileSync(PKEY_FILE_DIR)
}
if (fs.existsSync(CERT_FILE_DIR)) {
    cert = fs.readFileSync(CERT_FILE_DIR)
}

const options = {
    key: pkey,
    cert,
    allowHTTP1: true,
    SNICallback: (domain, cb) => {

        if (domain.startsWith('www.')) {
            domain = domain.substring(4)
        }
        if (hostrules[domain] && hostrules[domain].certContext) {
            cb(null, hostrules[domain].certContext)
        } else {
            cb()
        }
    }
}

if (fs.existsSync(path.join(CERT_DIR, './chain.pem'))) {
    options.ca = fs.readFileSync(path.join(CERT_DIR, './chain.pem'))
}


const defaultWebHandler = (err, req, res) => {
    if (err) {
        console.log(req.url)
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

const webSocket = function (req, socket, head) {
    if (req.url === '/ws') {
        proxy.ws(req, socket, head, {
            hostname: 'localhost',
            port: API_PORT,
            path: '/ws'
        }, defaultWSHandler)
    }
}

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


const sendFileFromDir = async (req, res, filePath, headers, parsedUrl) => {
    let stats
    filePath = await resizeImage(parsedUrl, req, filePath)

    try {
        stats = fs.statSync(filePath)
    } catch (e) {
        return false
    }
    if (stats.isFile()) {

        // static file
        const ext = path.extname(filePath).substring(1).trim().toLowerCase().split('@')[0]
        const mimeType = MimeType.detectByExtension(ext),
            headerExtra = {
                'Cache-Control': 'public, max-age=31536000',
                'Content-Type': mimeType,
                'Last-Modified': stats.mtime.toUTCString(),
                ...headers
            }
        sendFile(req, res, headerExtra, filePath)

        return true
    }
    return false
}

const writeStreamFile = function (fileName) {
    const writeStream = fs.createWriteStream(fileName)
    return writeStream
}

const sendFile = function (req, res, headerExtra, filename, ext) {
    let acceptEncoding = req.headers['accept-encoding'], neverCompress = false

    // TODO make it configurable
    if( headerExtra['Content-Type'] && (headerExtra['Content-Type'].indexOf('image/')===0 || headerExtra['Content-Type'].indexOf('video/')===0)){
        neverCompress = true
    }

    if (!acceptEncoding) {
        acceptEncoding = ''
    }
    if (!neverCompress && acceptEncoding.match(/\bbr\b/)) {
        res.writeHead(200, {...headerExtra, 'content-encoding': 'br'})

        if (fs.existsSync(filename + '.br')) {
            // if br version is available send this instead
            const fileStream = fs.createReadStream(filename + '.br')
            fileStream.pipe(res)
        } else {
            const fileStream = fs.createReadStream(filename)
            const fileStreamCom = fileStream.pipe(zlib.createBrotliCompress())

            fileStreamCom.pipe(res)
            fileStreamCom.pipe(writeStreamFile(filename + '.br'))
        }

    } else if (!neverCompress && acceptEncoding.match(/\bgzip\b/)) {
        res.writeHead(200, {...headerExtra, 'content-encoding': 'gzip'})

        if (fs.existsSync(filename + '.gz')) {
            // if gz version is available send this instead
            const fileStream = fs.createReadStream(filename + '.gz')
            fileStream.pipe(res)
        } else {
            const fileStream = fs.createReadStream(filename)
            const fileStreamCom = fileStream.pipe(zlib.createGzip())
            fileStreamCom.pipe(res)
            fileStreamCom.pipe(writeStreamFile(filename + '.gz'))
        }

    } else if (!neverCompress && acceptEncoding.match(/\bdeflate\b/)) {
        res.writeHead(200, {...headerExtra, 'content-encoding': 'deflate'})

        const fileStream = fs.createReadStream(filename)
        fileStream.pipe(zlib.createDeflate()).pipe(res)
    } else {
        res.writeHead(200, {...headerExtra})

        const fileStream = fs.createReadStream(filename)
        fileStream.pipe(res)
    }
}


const parseWebsite = async (urlToFetch, host) => {
    const puppeteer = require('puppeteer')

    console.log(`fetch ${urlToFetch}`)
    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
    const page = await browser.newPage()

    await page.setRequestInterception(true)
    await page.setExtraHTTPHeaders({'x-host-rule': host})

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


const doScreenCapture = async (url, filename, options) => {
    const puppeteer = require('puppeteer')

    console.log(`take screenshot ${url}`)

    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
    const page = await browser.newPage()
    await page.goto(url, {waitUntil: 'domcontentloaded'})

    await page.setViewport({width: 1280, height: 800, ...options})
    if(options.delay) {
        await page.waitFor(options.delay)
    }
console.log(options)
    if (options.padding) {
        options.clip = {
            x: options.padding,
            y: options.padding,
            width:options.width - options.padding * 2,
            height:options.height - options.padding * 2
        }
    }


    await page.screenshot({
        fullPage: false,
        path: filename,
        ...options
    })
    await browser.close()
}

const sendIndexFile = async (req, res, uri, hostrule, host) => {
    const headers = {
        'Cache-Control': 'public, max-age=60',
        'Content-Type': MimeType.detectByExtension('html'),
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000',
        /*'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval'",*/
        ...hostrule.headers.common,
        ...hostrule.headers[uri]
    }

    const agent = req.headers['user-agent']
    if (agent && (agent.indexOf('bingbot') > -1 || agent.indexOf('msnbot') > -1)) {

        // return rentered html for bing as they are not able to render js properly
        //const html = await parseWebsite(`${req.secure ? 'https' : 'http'}://${host}${host === 'localhost' ? ':' + PORT : ''}${uri}`)
        const baseUrl = `http://localhost:${PORT}`
        let html = await parseWebsite(baseUrl + uri, host)
        const re = new RegExp(baseUrl, 'g')
        html = html.replace(re, `https://${host}`)


        res.writeHead(200, headers)
        res.write(html)
        res.end()

    } else {
        let indexfile

        if (hostrule.fileMapping && hostrule.fileMapping['/index.html']) {
            indexfile = path.join(hostrule.basedir, hostrule.fileMapping['/index.html'])
        } else {
            // default index
            indexfile = path.join(BUILD_DIR, '/index.min.html')
        }
        sendFile(req, res, headers, indexfile);
    }
}


function hasHttpsWwwRedirect(host, req, res) {
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
            if (process.env.LUNUC_FORCE_HTTPS === 'true') {

                const agent = req.headers['user-agent'], agentParts = agent ? agent.split(' ') : []

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
                    return true
                }
            }
        }

        if (newhost != host) {
            console.log(`${req.connection.remoteAddress}: Redirect to ${newhost}`)
            res.writeHead(301, {"Location": (this.constructor.name === 'Server' ? 'http' : 'https') + "://" + newhost + req.url})
            res.end()
            return true
        }
    }
    return false
}

function transcodeVideo(parsedUrl, headerExtra, res, code, fileStream) {
    // make sure ffmpeg is install on your device
    // brew install ffmpeg
    //sudo apt install ffmpeg

    let options = {"audioQuality": 1, "videoBitrate": 300, "fps": 15, "size": "640x?", "crf": 0}

    try {
        Object.assign(options, JSON.parse(parsedUrl.query.transcode))
    } catch (e) {
        console.log(e)
    }
    const ffprobePath = require('@ffprobe-installer/ffprobe').path,
        ffmpeg = require('fluent-ffmpeg')

    ffmpeg.setFfprobePath(ffprobePath)

    delete headerExtra['Content-Length']
    res.writeHead(code, {...headerExtra})

    const outputOptions = ['-movflags isml+frag_keyframe+empty_moov+faststart']
    if (options.crf) {
        outputOptions.push('-crf ' + options.crf)
    }
    ffmpeg(fileStream)
        .audioCodec('libmp3lame')
        .audioQuality(options.audioQuality)
        .videoCodec('libx264')
        .videoBitrate(options.videoBitrate)
        .fps(options.fps)
        .outputOptions(outputOptions)
        .format('mp4')
        .size(options.size)
        .on('start', console.log)
        .on('error', console.error)
        .pipe(res, {end: true})
}

async function resizeImage(parsedUrl, req, filename) {
    // resize image file
    if (parsedUrl.query.width || parsedUrl.query.height || parsedUrl.query.format) {
        const width = parseInt(parsedUrl.query.width),
            height = parseInt(parsedUrl.query.height)

        let format = parsedUrl.query.format
        if (format === 'webp' && req.headers['accept'] && req.headers['accept'].indexOf('image/webp') < 0) {
            format = false
        }


        if (!isNaN(width) || !isNaN(height) || format) {

            const resizeOptions = {fit: sharp.fit.cover}

            if (!isNaN(width)) {
                resizeOptions.width = width
            }

            if (!isNaN(height)) {
                resizeOptions.height = height
            }

            let quality = parseInt(parsedUrl.query.quality)
            if (isNaN(quality)) {
                quality = 80
            }

            let modfilename = `${filename}@${width}x${height}-${quality}${format ? '-' + format : ''}`

            if (!fs.existsSync(modfilename)) {
                console.log(`modify file ${filename} to ${modfilename}`)
                //resize image
                try {
                    const resizedFile = await sharp(filename).resize(resizeOptions)

                    if (format === 'webp') {
                        await resizedFile.webp({
                            quality,
                            alphaQuality: quality,
                            lossless: false,
                            force: true
                        }).toFile(modfilename)
                    } else {
                        await resizedFile.jpeg({
                            quality,
                            chromaSubsampling: '4:2:0',
                            force: false
                        }).toFile(modfilename)
                    }
                    filename = modfilename
                } catch (e) {
                    console.error(e)
                }
            } else {
                filename = modfilename
            }
        }
    }
    return filename
}

async function resolveUploadedFile(uri, parsedUrl, req, res) {

    // remove pretty url part
    const pos = uri.indexOf('/' + config.PRETTYURL_SEPERATOR + '/')
    let modUri
    if (pos >= 0) {
        modUri = uri.substring(0, pos)
    } else {
        modUri = uri
    }


    let filename = path.join(ABS_UPLOAD_DIR, modUri.substring(UPLOAD_URL.length + 1)) //.replace(/\.\.\//g, ''))


    if (fs.existsSync(filename)) {


        filename = await resizeImage(parsedUrl, req, filename)


        const stat = fs.statSync(filename)

        if (!stat.isFile()) {
            sendError(res, 404)
            return
        }

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
            const pos = uri.lastIndexOf('.')
            if (pos >= 0) {
                ext = uri.substring(pos + 1).toLocaleLowerCase()
            }
        }
        if (ext) {
            const mimeType = MimeType.detectByExtension(ext)

            headerExtra['Content-Type'] = mimeType

            if ((ext === 'mp3' || ext === 'mp4' || ext === 'm4a') && !parsedUrl.query.transcode) {

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

        if (parsedUrl.query.transcode) {
            transcodeVideo(parsedUrl, headerExtra, res, code, fileStream)
        } else {
            res.writeHead(code, headerExtra)
            fileStream.pipe(res)
        }

    } else {
        console.log('not exists: ' + filename)
        sendError(res, 404)
    }
}

// Initialize http api
const app = (USE_HTTPX ? httpx : http).createServer(options, async function (req, res) {

    const host = getHostFromHeaders(req.headers)

    if (hasHttpsWwwRedirect.call(this, host, req, res)) {
        return
    }

    const parsedUrl = url.parse(req.url, true), uri = decodeURI(parsedUrl.pathname)

    //small security check
    if (uri.indexOf('../') >= 0) {
        sendError(res, 403)
        return
    }

    console.log(`${req.connection.remoteAddress}: ${uri}`)

    if (uri.startsWith('/graphql') || uri.startsWith('/' + API_PREFIX)) {
        // there is also /graphql/upload
        return proxy.web(req, res, {
            hostname: 'localhost',
            proxyTimeout: 1000 * 60 * 10,
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
            await resolveUploadedFile(uri, parsedUrl, req, res)
        } else {

            // check with and without www
            const hostRuleHost = req.headers['x-host-rule'] ? req.headers['x-host-rule'].split(':')[0] : host
            const hostrule = {...hostrules.general, ...(hostrules[hostRuleHost] || hostrules[hostRuleHost.substring(4)])}


            let staticFile

            if (hostrule.fileMapping && hostrule.fileMapping[uri]) {
                staticFile = path.join(hostrule.basedir, hostrule.fileMapping[uri])
            } else if (uri.length > 1 && fs.existsSync(STATIC_TEMPLATE_DIR + uri)) {

                fs.readFile(STATIC_TEMPLATE_DIR + uri, 'utf8', function (err, data) {
                    const ext = path.extname(uri).split('.')[1]
                    const mimeType = MimeType.detectByExtension(ext)

                    const headerExtra = {
                        'Cache-Control': 'public, max-age=31536000',
                        'Content-Type': mimeType,
                        'Last-Modified': new Date().toUTCString(),
                        ...hostrule.headers[uri]
                    }
                    res.writeHead(200, {'Content-Type': 'text/plain'})
                    res.write(Util.replacePlaceholders(data, {parsedUrl, host, config}))
                    res.end()
                })


                return
            } else {
                staticFile = path.join(STATIC_DIR, uri)
            }

            const headers = hostrule.headers[uri]

            if (!await sendFileFromDir(req, res, staticFile, headers, parsedUrl)) {

                if (!await sendFileFromDir(req, res, WEBROOT_ABSPATH + uri, headers, parsedUrl)) {
                    if (!await sendFileFromDir(req, res, BUILD_DIR + uri, headers, parsedUrl)) {


                        // special url
                        const pos = uri.indexOf('/' + config.PRETTYURL_SEPERATOR + '/' + config.PRETTYURL_SEPERATOR + '/')
                        if (pos >= 0) {
                            const decodedStr = decodeURIComponent(uri.substring(pos + 5))

                            try {
                                const data = JSON.parse(decodedStr)
                                if (data.screenshot) {
                                    //{"screenshot":{"url":"https:/stackoverflow.com/questions/4374822/remove-all-special-characters-with-regexp","options":{"height":300}}}
                                    //console.log(decodeURI(uri.substring(pos+5)))

                                    const filename = decodedStr.replace(/[^\w\s]/gi, '') + '.png'

                                    const absFilename = path.join(ABS_UPLOAD_DIR, 'screenshots', filename)

                                    if (!fs.existsSync(absFilename)) {
                                        let url = data.screenshot.url
                                        if (url.indexOf('/') === 0) {
                                            url = 'http://' + req.headers.host + url
                                        }
                                        await doScreenCapture(url, absFilename, data.screenshot.options)
                                    }

                                    await resolveUploadedFile(`${UPLOAD_URL}/screenshots/${filename}`, parsedUrl, req, res)


                                } else {
                                    sendError(res, 404)
                                }

                                // sendIndexFile(req, res, uri, hostrule, host)
                            } catch (e) {
                                console.log(decodedStr)


                                console.error(e)
                                sendError(res, 500)
                            }

                        } else {
                            console.log('not exists: ' + uri)
                            sendIndexFile(req, res, uri, hostrule, host)
                        }
                    }
                }
            }
        }
    }
})


let stream = require('./stream')

let ioHttp = require('socket.io')(app.http)
ioHttp.on('connection', stream)

let ioHttps = require('socket.io')(app.https)
ioHttps.on('connection', stream)


//
// Listen to the `upgrade` event and proxy the
// WebSocket requests as well.
//
if (USE_HTTPX) {
    app.http.on('upgrade', webSocket)
    app.https.on('upgrade', webSocket)
} else {
    app.on('upgrade', webSocket)
}
// Start server
app.listen(PORT, () => console.log(
    `Listening at localhost:${PORT}`
))
