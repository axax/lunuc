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
import sharp from 'sharp'
import Util from '../client/util'
import ApiUtil from '../api/util'
import {loadAllHostrules} from '../util/hostrules'
import {PassThrough} from 'stream'
import {contextByRequest} from '../api/util/sessionContext'
import {parseUserAgent} from '../util/userAgent'
import {USE_COOKIES} from "../api/constants";
import {parseCookies} from "../api/util/parseCookies";
import {decodeToken} from "../api/util/jwt";

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
        //if(req.secure) {
        proxy.ws(req, socket, head, {
            hostname: 'localhost',
            port: API_PORT,
            protocol: 'http',
            path: '/ws'
        }, defaultWSHandler)
        // }
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

    try {
        stats = fs.statSync(filePath)
    } catch (e) {
        return false
    }


    if (stats.isFile()) {
        const modImage = await resizeImage(parsedUrl, req, filePath)

        // static file
        let mimeType = modImage.mimeType
        if (!mimeType) {
            const ext = path.extname(modImage.filename).substring(1).trim().toLowerCase().split('@')[0]
            mimeType = MimeType.detectByExtension(ext)
        }
        const headerExtra = {
            'Cache-Control': 'public, max-age=31536000',
            'Content-Type': mimeType,
            'Last-Modified': stats.mtime.toUTCString(),
            ...headers
        }
        sendFile(req, res, {headers: headerExtra, filename: modImage.filename})

        return true
    }
    return false
}

const writeStreamFile = function (fileName) {
    const writeStream = fs.createWriteStream(fileName)
    return writeStream
}

function isFileNotNewer(filename, statsMainFile) {
    let isFile = fs.existsSync(filename)

    if (isFile) {
        const statsFile = fs.statSync(filename)

        // compare date
        if (statsMainFile.mtime > statsFile.mtime) {
            isFile = false
            console.log(filename + ' is older')
        }
    }
    return isFile
}

const sendFile = function (req, res, {headers, filename, statusCode = 200}) {
    let acceptEncoding = req.headers['accept-encoding'], neverCompress = false

    // TODO make it configurable
    if (headers['Content-Type'] && (headers['Content-Type'].indexOf('image/') === 0 || headers['Content-Type'].indexOf('video/') === 0)) {
        neverCompress = true
    }

    if (!acceptEncoding) {
        acceptEncoding = ''
    }

    let statsMainFile
    try {
        statsMainFile = fs.statSync(filename)

        if (!neverCompress && acceptEncoding.match(/\bbr\b/)) {
            res.writeHead(statusCode, {...headers, 'content-encoding': 'br'})

            if (isFileNotNewer(filename + '.br', statsMainFile)) {
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
            res.writeHead(statusCode, {...headers, 'content-encoding': 'gzip'})

            if (isFileNotNewer(filename + '.gz', statsMainFile)) {
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
            res.writeHead(statusCode, {...headers, 'content-encoding': 'deflate'})

            const fileStream = fs.createReadStream(filename)
            fileStream.pipe(zlib.createDeflate()).pipe(res)
        } else {
            res.writeHead(statusCode, {...headers})

            const fileStream = fs.createReadStream(filename)
            fileStream.pipe(res)
        }
    } catch (err) {
        console.error(err)
        console.log(filename + ' does not exist')
        sendError(res, 404)
    }
}


const parseWebsite = async (urlToFetch, host, agent, isBot, remoteAddress) => {

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
            const headers = request.headers()
            headers['x-track-ip'] = remoteAddress
            headers['x-track-host'] = host
            headers['x-track-is-bot'] = isBot
            headers['x-track-user-agent'] = agent
            request.continue({headers})
        }
    })

    let statusCode = 200
    page.on('response', response => {
        if (response.status() === 404 && response._request._resourceType === 'document' && response.url().endsWith('/404')) {

            statusCode = 404
        }
    })

    await page.goto(urlToFetch, {waitUntil: 'networkidle2'})

    let html = await page.content()
    html = html.replace('</head>', '<script>window.LUNUC_PREPARSED=true</script></head>')


    await page.close()
    await browser.close()

    return {html, statusCode}
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
    if (options.delay) {
        await page.waitFor(options.delay)
    }
    console.log(options)
    if (options.padding) {
        options.clip = {
            x: options.padding,
            y: options.padding,
            width: options.width - options.padding * 2,
            height: options.height - options.padding * 2
        }
    }


    await page.screenshot({
        fullPage: false,
        path: filename,
        ...options
    })
    await page.close()
    await browser.close()
}

const sendIndexFile = async ({req, res, urlPathname, hostrule, host, parsedUrl}) => {
    const headers = {
        'Cache-Control': 'public, max-age=60',
        'Content-Type': MimeType.detectByExtension('html'),
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000',
        /*'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval'",*/
        ...hostrule.headers.common,
        ...hostrule.headers[urlPathname]
    }

    const statusCode = (hostrule.statusCode && hostrule.statusCode[urlPathname] ? hostrule.statusCode[urlPathname] : 200)

    const agent = req.headers['user-agent']
    const {version, browser, isBot} = parseUserAgent(agent)

    if (isBot || (browser === 'firefox' && version <= 12) || (browser === 'msie' && version <= 6)) {

        // return rentered html for bing as they are not able to render js properly
        //const html = await parseWebsite(`${req.secure ? 'https' : 'http'}://${host}${host === 'localhost' ? ':' + PORT : ''}${urlPathname}`)
        const baseUrl = `http://localhost:${PORT}`
        const urlToFetch = baseUrl + urlPathname + (parsedUrl.search ? parsedUrl.search : '')

        const cacheFileDir = path.join(__dirname, 'cache', host.replace(/\W/g, ''))
        const cacheFileName = cacheFileDir+'/' + urlToFetch.replace(/\W/g, '')+'.html'


        let sentFromCache = false
        if (ApiUtil.ensureDirectoryExistence(cacheFileDir)) {


            let isFile = fs.existsSync(cacheFileName)

            if (isFile) {
                /*const statsFile = fs.statSync(cacheFileName)
                const now = new Date().getTime(),
                    modeTime = new Date(statsFile.mtime).getTime() + 86400000 * 5; // 5days in miliseconds
                if (modeTime > now) {*/
                    //from cache
                    console.log(`send from cache ${cacheFileName}`)

                    sendFile(req, res, {headers, filename: cacheFileName, statusCode: 200})
                    sentFromCache = true
               // }
            }
            // return isFile
        }

        const pageData = await parseWebsite(urlToFetch, host, agent, isBot, req.connection.remoteAddress)
        const re = new RegExp(baseUrl, 'g')
        pageData.html = pageData.html.replace(re, `https://${host}`)


        if(!sentFromCache){
            res.writeHead(pageData.statusCode === 404 ? 404 : statusCode, headers)
            res.write(pageData.html)
            res.end()
        }

        console.log(`update cache for ${cacheFileName}`)
        fs.writeFile(cacheFileName, pageData.html,  (err) => {
            if (err) {
                console.error("Error writing to file " + cacheFileName, err)
            }
        })

    } else {
        let indexfile

        if (hostrule.fileMapping && hostrule.fileMapping['/index.html']) {
            indexfile = path.join(hostrule.basedir, hostrule.fileMapping['/index.html'])
        } else {
            // default index
            indexfile = path.join(BUILD_DIR, '/index.min.html')
        }
        sendFile(req, res, {headers, filename: indexfile, statusCode})
    }
}


function hasHttpsWwwRedirect(host, req, res) {
    if (host !== 'localhost' && !net.isIP(host)) {

        // force www
        let newhost = host
        if (!newhost.startsWith('www.')) {
            const hostrule = hostrules[host] || hostrules.general
            if (hostrule && hostrule.forceWWW) {
                newhost = 'www.' + newhost
            }
        }

        if (!config.DEV_MODE && this.constructor.name === 'Server') {
            if (process.env.LUNUC_FORCE_HTTPS === 'true') {

                const agent = req.headers['user-agent']


                const {browser, version} = parseUserAgent(agent)


                console.log(`${req.connection.remoteAddress}: Redirect to https ${newhost} / user-agent: ${agent} / browser=${browser} / version=${version}`)

                if ((browser === 'safari' && version < 6) ||
                    (browser === 'firefox' && version <= 12) ||
                    (browser === 'opera' && version <= 10) ||
                    (browser === 'msie' && version <= 6)) {
                    // for browser that doesn't support tls 1.2
                } else {
                    res.writeHead(301, {'Location': 'https://' + newhost + req.url})
                    res.end()
                    return true
                }
            }
        }

        if (newhost != host) {
            console.log(`${req.connection.remoteAddress}: Redirect to ${newhost} / request url=${req.url}`)
            res.writeHead(301, {'Location': (this.constructor.name === 'Server' ? 'http' : 'https') + '://' + newhost + req.url})
            res.end()
            return true
        }
    }
    return false
}

function transcodeVideoOptions(parsedUrl, filename) {

    if (!parsedUrl.query.transcode) {
        return false
    }

    //https://www.lunuc.com/uploads/5f676c358ebac32c662cdb02/-/La%20maison%20du%20bonheur-2006.mp4?ext=mp4&transcode={%22audioQuality%22:3,%22videoBitrate%22:800,%22fps%22:25,%22size%22:%22720x?%22,%22crf%22:28}
    // default options
    let options = {
        noAudio: false,
        /*"audioVolume": 1,*/
        /*"audioQuality": 0,*/
        /*"fps": 24,*/
        /*"size": "720x?",*/
        crf: 10,
        /*"speed": 1,*/
        /*"preset": "slow",*/
        keep: false,
        format: 'mp4'
    }

    try {
        Object.assign(options, JSON.parse(parsedUrl.query.transcode))
    } catch (e) {
        console.log(e)
        return false
    }


    let modfilename = filename
    Object.keys(options).forEach(k => {
        if (k !== 'keep') {
            const value = String(options[k].constructor === Array ? options[k].join('') : options[k])
            modfilename += `-${value.replace(/[^a-zA-Z0-9-_\.]/g, '')}`
        }
    })

    options.filename = modfilename

    options.exists = fs.existsSync(modfilename)

    return options

}

function transcodeAndStreamVideo({options, headerExtra, res, code, filename}) {
    // make sure ffmpeg is install on your device
    // brew install ffmpeg
    //sudo apt install ffmpeg
    // http://localhost:8080/uploads/5f935f98f5ca78b7cbeaa853/-/test.mpg?ext=mp4&transcode={"audioQuality":2,"fps":24,"size":"720x?","crf":24,"keep":true,"nostream":true}

    const ffprobePath = require('@ffprobe-installer/ffprobe').path,
        ffmpeg = require('fluent-ffmpeg')

    ffmpeg.setFfprobePath(ffprobePath)

    delete headerExtra['Content-Length']
    res.writeHead(code, {...headerExtra})

    const outputOptions = []

    if (!options.nostream) {
        outputOptions.push('-movflags isml+frag_keyframe+empty_moov+faststart')
    }
    if (options.crf) {
        outputOptions.push('-crf ' + options.crf)
    }
    if (options.preset) {
        outputOptions.push('-preset ' + options.preset)
    }

    if (options.duration) {
        outputOptions.push('-t ' + options.duration)
    }

    let video = ffmpeg(filename)

    const inputOptions = [
        '-probesize 100M',
        '-analyzeduration 100M'
    ]

    if (options.inputOptions) {
        inputOptions.push(options.inputOptions)
    }

    video.inputOptions(inputOptions)

    if (options.noAudio) {
        console.log('no audio was set')
        video.noAudio()
    } else {
        const aFilter = []

        if (options.audioVolume) {
            aFilter.push('volume=' + options.audioVolume)
        }
        if (options.speed) {
            aFilter.push('atempo=' + options.speed)
        }

        video.audioCodec('aac').audioFilters(aFilter) /*.audioBitrate('128k')*/

        if (options.audioQuality) {
            video.audioQuality(options.audioQuality)
        }

    }

    const vFilter = []

    if (options.speed) {
        vFilter.push(`setpts=${1 / options.speed}*PTS`)
    }

    video.videoCodec('libx264')
        .videoFilter(vFilter)
        .outputOptions(outputOptions)
        .format(options.format)

    if (options.videoBitrate) {
        video.videoBitrate(options.videoBitrate)
    }
    if (options.fps) {
        video.fps(options.fps)
    }
    if (options.size) {
        video.size(options.size)
    }
    video.on('progress', (progress) => {
        console.log('Processing: ' + progress.timemark + '% done')
    }).on('start', console.log).on('end', () => {
        if (options.keep) {
            // rename
            fs.rename(options.filename + '.temp', options.filename, () => {
                console.log('transcode ended and file saved as ' + options.filename)
            })

        }

    }).on('error', console.error)


    if (options.keep) {

        if (fs.existsSync(options.filename + '.temp')) {
            video.pipe(res, {end: true})
            // it is transcoding right now
        } else {
            console.log(`save video as ${options.filename}`)

            if (options.nostream) {
                video.output(options.filename + '.temp').run()
            } else {
                const writeStream = writeStreamFile(options.filename + '.temp')

                const passStream = new PassThrough()

                passStream.pipe(res)
                passStream.pipe(writeStream)

                video.output(passStream, {end: true})

                video.run()
            }
        }

    } else {
        video.pipe(res, {end: true})
    }

    return true
}

async function resizeImage(parsedUrl, req, filename) {
    let mimeType, exists = false

    // resize image file
    if (parsedUrl.query.width || parsedUrl.query.height || parsedUrl.query.format) {
        const width = parseInt(parsedUrl.query.width),
            height = parseInt(parsedUrl.query.height),
            fit = parsedUrl.query.fit

        let format = parsedUrl.query.format
        if (format === 'webp' && req.headers['accept'] && req.headers['accept'].indexOf('image/webp') < 0) {
            format = false
        }


        if (!isNaN(width) || !isNaN(height) || format) {

            const resizeOptions = {fit: fit || sharp.fit.cover}
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

            let modfilename = `${filename}@${width}x${height}-${quality}${fit ? '-' + fit : ''}${format ? '-' + format : ''}`

            if (format) {
                mimeType = MimeType.detectByExtension(format)
            }

            exists = true

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
                    } else if (format === 'png') {
                        await resizedFile.png({
                            quality,
                            force: true
                        }).toFile(modfilename)
                    } else if (format === 'jpg' || format === 'jpeg') {
                        await resizedFile.jpeg({
                            quality,
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
    return {filename, exists, mimeType}
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

    if (!fs.existsSync(filename)) {
        let context
        if (USE_COOKIES) {
            const cookies = parseCookies(req)
            context = decodeToken(cookies.auth)
            context.session = cookies.session
        } else {
            //context = decodeToken(payload.auth)
            //context.session = payload.session
        }
        if(context && context.role === 'administrator') {
            filename = path.join(ABS_UPLOAD_DIR, 'private'+modUri.substring(UPLOAD_URL.length + 1))
        }
    }

    if (fs.existsSync(filename)) {

        // Check if there is a modified image
        const modImage = await resizeImage(parsedUrl, req, filename)
        if (modImage.exists) {
            filename = modImage.filename
        }

        // Check if there is a modified video
        const transcodeOptions = transcodeVideoOptions(parsedUrl, filename)
        if (transcodeOptions && transcodeOptions.exists) {
            console.log(`stream from modified file ${transcodeOptions.filename}`)

            filename = transcodeOptions.filename
        }


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

        if (modImage.mimeType) {
            headerExtra['Content-Type'] = modImage.mimeType
        } else {

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

                if ((ext === 'mp3' || ext === 'mp4' || ext === 'm4a')) {


                    if (!transcodeOptions || transcodeOptions.exists) {

                        headerExtra['Accept-Ranges'] = 'bytes'

                        const range = req.headers.range

                        if (req.headers.range) {
                            //delete headerExtra['Cache-Control']
                            const parts = range.replace(/bytes=/, '').split('-'),
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
            }
        }


        if (transcodeOptions && !transcodeOptions.exists) {
            transcodeAndStreamVideo({options: transcodeOptions, headerExtra, res, code, filename})
        } else {

            const fileStream = fs.createReadStream(filename, streamOption)
            res.writeHead(code, headerExtra)
            fileStream.pipe(res)
        }

    } else {
        console.log('not exists: ' + filename)
        sendError(res, 404)
    }
}

function decodeURIComponentSafe(s) {
    if (!s) {
        return s
    }
    return decodeURIComponent(s.replace(/%(?![0-9][0-9a-fA-F]+)/g, '%25'))
}

// Initialize http api
const app = (USE_HTTPX ? httpx : http).createServer(options, async function (req, res) {

    try {
        const host = getHostFromHeaders(req.headers)
        req.isHttps = req.socket.encrypted || this.constructor.name === 'Server'

        if (hasHttpsWwwRedirect.call(this, host, req, res)) {
            return
        }

        const parsedUrl = url.parse(req.url, true)
        let urlPathname
        try {
            urlPathname = decodeURIComponent(parsedUrl.pathname)
        }catch (e) {
            urlPathname = decodeURIComponentSafe(parsedUrl.pathname)
        }

        //small security check
        if (urlPathname.indexOf('../') >= 0) {
            sendError(res, 403)
            return
        }

        console.log(`${req.connection.remoteAddress}: ${urlPathname}`)

        if (urlPathname.startsWith('/graphql') || urlPathname.startsWith('/' + API_PREFIX)) {
            // there is also /graphql/upload
            return proxy.web(req, res, {
                hostname: 'localhost',
                proxyTimeout: 1000 * 60 * 10,
                port: API_PORT,
                path: req.url,
                onReq: (req, {headers}) => {
                    headers['x-forwarded-for'] = req.socket.remoteAddress
                    headers['x-forwarded-proto'] = req.isHttps ? 'https' : 'http'
                    headers['x-forwarded-host'] = host
                }
            }, defaultWebHandler)

        } else {

            if (urlPathname.startsWith(BACKUP_URL + '/')) {
                const context = contextByRequest(req)
                if (context.id && context.role === 'administrator') {
                    // only allow download if valid jwt token is set
                    const backup_dir = path.join(__dirname, '../' + BACKUP_DIR)
                    const filename = path.join(backup_dir, urlPathname.substring(BACKUP_URL.length))
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


            } else if (urlPathname.startsWith(UPLOAD_URL + '/')) {
                await resolveUploadedFile(urlPathname, parsedUrl, req, res)
            } else {

                // check with and without www
                const hostRuleHost = req.headers['x-host-rule'] ? req.headers['x-host-rule'].split(':')[0] : host
                const hostrule = {...hostrules.general, ...(hostrules[hostRuleHost] || hostrules[hostRuleHost.substring(4)])}

                if (hostrule.redirects) {

                    let redirect = hostrule.redirects[urlPathname]
                    if (!redirect) {
                        redirect = hostrule.redirects['*']
                    }
                    if (redirect) {
                        res.writeHead(301, {'Location': redirect})
                        res.end()
                        return true
                    }

                }

                hostrule.headers = {...hostrules.general.headers, ...hostrule.headers}

                let staticFile

                if (hostrule.fileMapping && hostrule.fileMapping[urlPathname]) {
                    staticFile = path.join(hostrule.basedir, hostrule.fileMapping[urlPathname])
                    console.log('mapped file: ' + staticFile)
                } else if (urlPathname.length > 1 && fs.existsSync(STATIC_TEMPLATE_DIR + urlPathname)) {

                    fs.readFile(STATIC_TEMPLATE_DIR + urlPathname, 'utf8', function (err, data) {
                        const ext = path.extname(urlPathname).split('.')[1]
                        const mimeType = MimeType.detectByExtension(ext)

                        const headerExtra = {
                            'Cache-Control': 'public, max-age=31536000',
                            'Content-Type': mimeType,
                            'Last-Modified': new Date().toUTCString(),
                            ...hostrule.headers[urlPathname]
                        }
                        res.writeHead(200, {'Content-Type': 'text/plain'})
                        res.write(Util.replacePlaceholders(data, {parsedUrl, host, config}))
                        res.end()
                    })


                    return
                } else {
                    staticFile = path.join(STATIC_DIR, urlPathname)
                }
                const headers = hostrule.headers[urlPathname]

                if (!await sendFileFromDir(req, res, staticFile, headers, parsedUrl)) {

                    if (!await sendFileFromDir(req, res, WEBROOT_ABSPATH + urlPathname, headers, parsedUrl)) {
                        if (!await sendFileFromDir(req, res, BUILD_DIR + urlPathname, headers, parsedUrl)) {


                            // special url
                            const pos = urlPathname.indexOf('/' + config.PRETTYURL_SEPERATOR + '/' + config.PRETTYURL_SEPERATOR + '/')
                            if (pos >= 0) {
                                const decodedStr = decodeURIComponent(urlPathname.substring(pos + 5))

                                try {
                                    const data = JSON.parse(decodedStr)
                                    if (data.screenshot) {
                                        //{"screenshot":{"url":"https:/stackoverflow.com/questions/4374822/remove-all-special-characters-with-regexp","options":{"height":300}}}
                                        //console.log(decodeURI(urlPathname.substring(pos+5)))

                                        const filename = decodedStr.replace(/[^\w\s]/gi, '') + '.png'

                                        const absFilename = path.join(ABS_UPLOAD_DIR, 'screenshots', filename)

                                        if (!fs.existsSync(absFilename)) {
                                            let url = data.screenshot.url
                                            if (url.indexOf('/') === 0) {
                                                url = (req.isHttps ? 'https://' : 'http://') + hostRuleHost + url
                                            }
                                            await doScreenCapture(url, absFilename, data.screenshot.options)
                                        }

                                        await resolveUploadedFile(`${UPLOAD_URL}/screenshots/${filename}`, parsedUrl, req, res)


                                    } else {
                                        sendError(res, 404)
                                    }

                                } catch (e) {
                                    console.log(decodedStr)


                                    console.error(e)
                                    sendError(res, 500)
                                }

                            } else {
                                sendIndexFile({req, res, urlPathname, hostrule, host, parsedUrl})
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.log(e)
        sendError(res, 500)
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
