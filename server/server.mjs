import proxy from 'http2-proxy'
import httpx from './httpx.mjs'
import http from 'http'
import url from 'url'
import path from 'path'
import net from 'net'
import fs from 'fs'
import zlib from 'zlib'
import config from '../gensrc/config.mjs'
import MimeType from '../util/mime.mjs'
import {getHostFromHeaders} from '../util/host.mjs'
import finalhandler from 'finalhandler'
import sharp from 'sharp'
import {replacePlaceholders} from '../util/placeholders.mjs'
import {ensureDirectoryExistence} from '../util/fileUtil.mjs'
import {loadAllHostrules} from '../util/hostrules.mjs'
import {PassThrough} from 'stream'
import {contextByRequest} from '../api/util/sessionContext.mjs'
import {parseUserAgent} from '../util/userAgent.mjs'
import {USE_COOKIES} from '../api/constants/index.mjs'
import {parseCookies} from '../api/util/parseCookies.mjs'
import puppeteer from 'puppeteer'
import {decodeToken} from '../api/util/jwt.mjs'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import ffmpeg from 'fluent-ffmpeg'
//import heapdump from 'heapdump'
import {clientAddress} from '../util/host.mjs'


const {UPLOAD_DIR, UPLOAD_URL, BACKUP_DIR, BACKUP_URL, API_PREFIX, WEBROOT_ABSPATH} = config
const ROOT_DIR = path.resolve(), SERVER_DIR = path.join(ROOT_DIR, './server')
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, UPLOAD_DIR)

const hostrules = loadAllHostrules(true)

setInterval(()=>{
    // update changes
    loadAllHostrules(true, hostrules)
},60000)

// Use Httpx
const USE_HTTPX = process.env.LUNUC_HTTPX === 'false' ? false : true

// Port to listen to
const PORT = (process.env.PORT || process.env.LUNUC_PORT || 8080)
const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)
const LUNUC_SERVER_NODES = process.env.LUNUC_SERVER_NODES || ''

// Build dir
const BUILD_DIR = path.join(ROOT_DIR, './build')
const STATIC_DIR = path.join(ROOT_DIR, './' + config.STATIC_DIR)
const STATIC_TEMPLATE_DIR = path.join(ROOT_DIR, './' + config.STATIC_TEMPLATE_DIR)
const CERT_DIR = process.env.LUNUC_CERT_DIR || SERVER_DIR
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
    if(hostrules.general && !hostrules.general.certDir){
        hostrules.general.certDir = path.join(CERT_DIR, './chain.pem')
    }
}

process.on('uncaughtException', (error) => {
    console.log(error)
    console.error(error.stack);
    console.log("Node NOT Exiting...");
})



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
    if (req.url === '/lunucws') {
        socket.on('error', (e)=>{
            console.log('ws socket error',e)
        })
        if(req.headers['upgrade'] && req.headers['upgrade'].startsWith('W')) {
            req.headers['upgrade'] = req.headers['upgrade'].toLowerCase()
        }

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


    try {
        res.writeHead(code, {'Content-Type': 'text/plain'})
        res.write(`${code} ${msg}\n`)
        res.end()
    } catch (e) {
        console.error(`Error sending error: ${e.message}`)
    }
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
            'Cache-Control': 'public, max-age=604800', /* a week */
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


let parseWebsiteBrowser
const wasBrowserKilled = async (browser) => {
    if(!browser || !browser.process){
        return true
    }
    const procInfo = await browser.process()
    return !!procInfo.signalCode // null if browser is still running
}
const parseWebsite = async (urlToFetch, host, agent, isBot, remoteAddress, cookies) => {

    let page
    try {
        const startTime = new Date().getTime()

        console.log(`fetch ${urlToFetch}`)
        if(await wasBrowserKilled(parseWebsiteBrowser)) {
            parseWebsiteBrowser = await puppeteer.launch({
                devtools: false,
                /*userDataDir: './server/myUserDataDir',*/
                ignoreHTTPSErrors: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-zygote' /* Disables the use of a zygote process for forking child processes. Instead, child processes will be forked and exec'd directly.*/
                ]
            })
        }
        const pages = await parseWebsiteBrowser.pages()

        if( pages.length > 5){
            console.warn('browser too busy to process more requests -> ignore')
            return {html: 'too busy to process request', statusCode: 500}
        }

        page = await parseWebsiteBrowser.newPage()

        setTimeout(async () => {
            /* if page is still not closed after 20s something is wrong */
            try {
                if(!page.isClosed() && !(await wasBrowserKilled(page.browser()))) {
                    //await pages.forEach(async (page) => await page.close())

                    const procInfo = await parseWebsiteBrowser.process()
                    if (!procInfo.signalCode) {
                        parseWebsiteBrowser.process().kill('SIGINT')
                        console.log('browser still running after 20s. kill process')
                    }
                    parseWebsiteBrowser = false
                }
            }catch (e) {
                console.warn("error termination process",e)
            }

        }, 20000)


        await page.setDefaultTimeout(5000)
        await page.setRequestInterception(true)

        if( cookies && cookies.session && cookies.auth) {
            const cookiesToSet = Object.keys(cookies).map(k=>({domain:'localhost',name:k, value:cookies[k]}))
            await page.setCookie(...cookiesToSet)
        }

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
            if (response.status() === 404 && response.request().resourceType() === 'document' && response.url().endsWith('/404')) {

                statusCode = 404
            }
        })



        await page.evaluateOnNewDocument((data) => {
            window._elementWatchForceVisible = true
            window._disableWsConnection = true
            window._lunucWebParser = data
        },{host, agent, isBot, remoteAddress})


        await page.goto(urlToFetch, {waitUntil: 'networkidle0'})

        let html = await page.content()
        html = html.replace('</head>', '<script>window.LUNUC_PREPARSED=true</script></head>')

        console.log(`url fetched ${urlToFetch} (statusCode ${statusCode}} in ${new Date().getTime() - startTime}ms`)

        page.close()

        /*try {


            const pages = await parseWebsiteBrowser.pages()
            await pages.forEach(async (page) => await page.close())

        }catch (e) {
            console.error(e)
        }*/
        //console.log(`Step 7 ${new Date().getTime() - startTime}ms`)

        //await browser.close()

        return {html, statusCode}
    } catch (e) {
        console.warn('parseWebsite error',e)
        if(page && !page.isClosed()){
            page.close()
        }
        return {html: e.message, statusCode: 500}

    }
}


const doScreenCapture = async (url, filename, options) => {

    console.log(`take screenshot ${url}`)

    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    })
    const page = await browser.newPage()
    await page.goto(url, {waitUntil: 'domcontentloaded'})

    await page.setViewport({width: 1280, height: 800, ...options})
    if (options.delay) {
        await page.waitForTimeout(options.delay)
    }
    console.log(options)
    if (options.padding) {
        let t,l,b,r
        if(options.padding.constructor===String) {
            const parts = options.padding.trim().split(' ')
            if (parts.length === 4) {
                t = parseInt(parts[0])
                r = parseInt(parts[1])
                b = parseInt(parts[2])
                l = parseInt(parts[3])
            } else {
                t = r = b = l = parseInt(options.padding)
            }
        }else{
            t = r = b = l = options.padding
        }


        options.clip = {
            x: l,
            y: t,
            width: options.width - (l+r),
            height: options.height - (t+b)
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

const sendIndexFile = async ({req, res, urlPathname, remoteAddress, hostrule, host, parsedUrl}) => {
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
    const via = req.headers['via']
    let {version, browser, isBot} = parseUserAgent(agent, hostrule.botregex || (hostrules.general && hostrules.general.botregex))

    if(via && via.indexOf('archive.org_bot') >= 0){
        // https://web.archive.org/
        isBot = true
    }
    /*if(!isBot) {
        console.log(browser, version)
    }*/
    if (isBot ||
        (browser === 'netscape') ||
        (browser === 'safari' && version < 5) ||
        (browser === 'firefox' && version <= 12) ||
        (browser === 'opera' && version <= 10) ||
        (browser === 'chrome' && version <= 16) ||
        (browser === 'msie' && version <= 10)) {

        if ( req.headers.accept && req.headers.accept.indexOf('text/html') < 0 && req.headers.accept.indexOf('*/*') < 0) {
            console.log('headers not valid', req.headers.accept)
            res.writeHead(404)
            res.end()
            return
        }
        // return rentered html for bing as they are not able to render js properly
        //const html = await parseWebsite(`${req.secure ? 'https' : 'http'}://${host}${host === 'localhost' ? ':' + PORT : ''}${urlPathname}`)
        const baseUrl = `http://localhost:${PORT}`
        const urlToFetch = baseUrl + urlPathname + (parsedUrl.search ? parsedUrl.search : '')

        const cacheFileDir = path.join(SERVER_DIR, 'cache', host.replace(/\W/g, ''))
        const cacheFileName = cacheFileDir + '/' + urlToFetch.replace(/\W/g, '') + '.html'

        const cookies = parseCookies(req)

        let sentFromCache = false
        if (!cookies.auth && ensureDirectoryExistence(cacheFileDir)) {


            let isFile = fs.existsSync(cacheFileName)

            if (isFile) {

                //from cache
                console.log(`send from cache ${cacheFileName}`)

                sendFile(req, res, {headers, filename: cacheFileName, statusCode: 200})
                sentFromCache = true

                // only update cache if file is old enough
                const statsFile = fs.statSync(cacheFileName)
                const now = new Date().getTime(),
                    modeTime = new Date(statsFile.mtime).getTime() + 300000; // a day in miliseconds = 86400000

                if (modeTime > now) {

                    return
                }
            }
            // return isFile
        }


        const pageData = await parseWebsite(urlToFetch, host, agent, isBot, remoteAddress, cookies)

        // remove script tags
        pageData.html = pageData.html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'')

        // replace host
        const re = new RegExp(baseUrl, 'g')
        pageData.html = pageData.html.replace(re, `https://${host}`)


        if (pageData.statusCode === 500 || pageData.statusCode === 404) {

            if (!sentFromCache) {
                res.writeHead(pageData.statusCode, headers)
                if (pageData.statusCode !== 500) {
                    res.write(pageData.html)

                }
                res.end()
            }

        } else {

            if (!sentFromCache) {
                res.writeHead(statusCode, headers)
                if (statusCode !== 500) {
                    res.write(pageData.html)
                }
                res.end()
            }

            if(!cookies.auth) {
                console.log(`update cache for ${cacheFileName}`)
                fs.writeFile(cacheFileName, pageData.html, (err) => {
                    if (err) {
                        console.error("Error writing to file " + cacheFileName, err)
                    }
                })
            }
        }

    } else {
        let indexfile

        if (hostrule.fileMapping && hostrule.fileMapping['/index.html']) {
            indexfile = path.join(hostrule._basedir, hostrule.fileMapping['/index.html'])
        } else {
            // default index
            indexfile = path.join(BUILD_DIR, '/index.min.html')
        }
        sendFile(req, res, {headers, filename: indexfile, statusCode})
    }
}


function hasHttpsWwwRedirect(host, req, res, remoteAddress) {
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
            if (process.env.LUNUC_FORCE_HTTPS === 'true' && !req.headers['x-track-ip']) {

                const agent = req.headers['user-agent']

                // don't force redirect for letsencrypt
                if( agent && agent.indexOf('www.letsencrypt.org') < 0 ) {

                    const {browser, version} = parseUserAgent(agent)

                    if ((browser === 'netscape') ||
                        (browser === 'safari' && version <= 6) ||
                        (browser === 'firefox' && version <= 26) ||
                        (browser === 'chrome' && version <= 49) ||
                        (browser === 'opera' && version <= 15) ||
                        (browser === 'msie' && version <= 10)) {
                        // for browser that doesn't support tls 1.2
                    } else {
                        console.log(`${remoteAddress}: Redirect to https ${newhost} / user-agent: ${agent} / browser=${browser} / version=${version}`)

                        res.writeHead(301, {'Location': 'https://' + newhost + req.url})
                        res.end()
                        return true
                    }
                }
            }
        }

        if (newhost != host) {
            const agent = req.headers['user-agent']

            if( !agent || agent.indexOf('www.letsencrypt.org') < 0 ) {
                console.log(`${remoteAddress}: Redirect to ${newhost} / request url=${req.url}`)
                res.writeHead(301, {'Location': (this.constructor.name === 'Server' ? 'http' : 'https') + '://' + newhost + req.url})
                res.end()
                return true
            }
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
        crf: 22,
        /*"speed": 1,*/
        /*"preset": "slow",*/
        keep: false,
        format: 'mp4',
        hvc1: false, /* for libx265 */
        audioBitrate: '160k',
        /*videoFilters: ['format=yuv420p']*/
    }

    try {
        Object.assign(options, JSON.parse(parsedUrl.query.transcode))
    } catch (e) {
        console.log(e)
        return false
    }



    let modfilename = filename

    let filnameObject
    if(options.screenshot){
        modfilename += '-videoframe'
        if(options.screenshot.constructor!==Object){
            options.screenshot = {time: options.screenshot }
        }
        filnameObject = options.screenshot
    }else {
        filnameObject = options
    }

    Object.keys(filnameObject).forEach(k => {
        if (k !== 'keep') {
            const value = String(filnameObject[k].constructor === Array ? filnameObject[k].join('') : filnameObject[k])
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


    ffmpeg.setFfprobePath(ffprobeInstaller.path)
    ffmpeg.setFfmpegPath( ffmpegInstaller.path)

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

    if (options.pass) {
        outputOptions.push('-pass ' + options.pass)
    }
    if (options.duration) {
        outputOptions.push('-t ' + options.duration)
    }
    if (options.hvc1) {
        outputOptions.push('-tag:v hvc1')
    }
    if (options.custom) {
        outputOptions.push(...options.custom)
    }

    let video = ffmpeg(filename)

    if(options.screenshot){
        video.on('filenames', function(filenames) {
            console.log('Will generate ' + filenames.join(', '))
        })
            .on('end', function() {
                console.log('Screenshots taken')
                fs.rename(options.filename + '.png', options.filename, () => {
                    console.log('transcode ended and file saved as ' + options.filename)

                    const fileStream = fs.createReadStream(options.filename)
                    fileStream.pipe(res)
                })
            })
            .screenshots({
                // Will take screens at 20%, 40%, 60% and 80% of the video
                timestamps: [options.screenshot.time],
                size: options.screenshot.size || '320x240',
                count: 1,
                folder: ABS_UPLOAD_DIR,
                filename:options.filename.replace(/^.*[\\\/]/, '')
            })
        return true
    }

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

        video.audioCodec('aac').audioFilters(aFilter)//.audioBitrate(options.audioBitrate || '160k')

        if (options.audioQuality) {
            video.audioQuality(options.audioQuality)
        }

    }

    const vFilter = []

    if (options.speed) {
        vFilter.push(`setpts=${1 / options.speed}*PTS`)
    }
    if(options.videoFilters){
        vFilter.push(...options.videoFilters)
    }

    video.videoCodec(options.codec || 'libx264')
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

        }else{
            console.log('transcode ended')
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
    if (parsedUrl.query.width || parsedUrl.query.height || parsedUrl.query.format || parsedUrl.query.flip || parsedUrl.query.flop) {
        const width = parseInt(parsedUrl.query.width),
            height = parseInt(parsedUrl.query.height),
            fit = parsedUrl.query.fit,
            flip = parsedUrl.query.flip,
            flop = parsedUrl.query.flop

        let format = parsedUrl.query.format
        if (format === 'webp' && req.headers['accept'] && req.headers['accept'].indexOf('image/webp') < 0) {
            format = false
        }

        if (!isNaN(width) || !isNaN(height) || format || flip || flop) {

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

            let modfilename = `${filename}@${width}x${height}-${quality}${fit ? '-' + fit : ''}${format ? '-' + format : ''}${flip ? '-flip' : ''}${flop ? '-flop' : ''}`

            if (format) {
                mimeType = MimeType.detectByExtension(format)
            }

            exists = true

            if (!fs.existsSync(modfilename)) {
                console.log(`modify file ${filename} to ${modfilename}`)
                try {
                    let resizedFile = await sharp(filename).resize(resizeOptions)
                    if(flip){
                        resizedFile = await resizedFile.flip()
                    }
                    if(flop){
                        resizedFile = await resizedFile.flop()
                    }

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

    const urlWithoutUploadDir = modUri.substring(UPLOAD_URL.length + 1)
    if(urlWithoutUploadDir.startsWith('private')){
        sendError(res, 404)
        return
    }
    const baseFilename = path.join(ABS_UPLOAD_DIR, urlWithoutUploadDir) //.replace(/\.\.\//g, ''))
    let filename = baseFilename

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
        if (context && context.role === 'administrator') {
            filename = path.join(ABS_UPLOAD_DIR, 'private' + urlWithoutUploadDir)
        }
    }


    if (!fs.existsSync(filename)) {
        if(getFileFromOtherServer(modUri,baseFilename,res, req)){
            return
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

                if ((ext === 'mp3' || ext === 'mp4' || ext === 'm4v' || ext === 'm4a')) {


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

function getFileFromOtherServer(urlPath, filename, baseResponse, req) {

    const remoteAdr = clientAddress(req)

    if(LUNUC_SERVER_NODES && LUNUC_SERVER_NODES.indexOf(remoteAdr)<0){
        const url = LUNUC_SERVER_NODES+urlPath
        console.log('laod from ' + url + ' - '+remoteAdr)
        http.get(url, function(response) {

            const passStream = new PassThrough()
            response.pipe(passStream)
            passStream.pipe(baseResponse)

            if(response.statusCode == 200) {
                const file = fs.createWriteStream(filename)
                passStream.pipe(file)
            }

        }).on('error', function(err) { // Handle errors
            sendError(res, 404)
        })
        return true
    }

    return false
}


function decodeURIComponentSafe(s) {
    if (!s) {
        return s
    }
    return decodeURIComponent(s.replace(/%(?![0-9][0-9a-fA-F]+)/g, '%25'))
}

// if there are more than {REQUEST_MAX_PER_TIME} request in {REQUEST_TIME_IN_MS}ms the remote ip gets blocked for {REQUEST_BLOCK_IP_FOR_IN_MS}ms
const REQUEST_TIME_IN_MS = 10000,
    REQUEST_MAX_PER_TIME = 350,
    REQUEST_BLOCK_IP_FOR_IN_MS = 120000
const ipMap = {}, blockedIps = {}
let reqCounter = 0

function isIpTemporarilyBlocked(req, remoteAddress){


    if(blockedIps[remoteAddress]){
        // block for 1 min
        if(Date.now()-blockedIps[remoteAddress].start>REQUEST_BLOCK_IP_FOR_IN_MS){
            delete blockedIps[remoteAddress]
        }else {
            console.log(remoteAddress + ' is temporarily blocked due to too many request in a short time')
            req.connection.destroy()
            return true
        }
    }

    if(!ipMap[remoteAddress] || Date.now()-ipMap[remoteAddress].start>REQUEST_TIME_IN_MS){
        ipMap[remoteAddress] = {start:Date.now(),count:0}
    }
    ipMap[remoteAddress].count++

    if(ipMap[remoteAddress].count>REQUEST_MAX_PER_TIME){
        blockedIps[remoteAddress] = {start:Date.now()}
        delete ipMap[remoteAddress]
        req.connection.destroy()
        return true
    }

    reqCounter++

    if(reqCounter>100){
        // clean up
        reqCounter = 0
        for(const ip in ipMap){
            if(Date.now()-ip.start > REQUEST_TIME_IN_MS+1000){
                delete ipMap[ip]
            }
        }
    }

    return false
}

// Initialize http api
const app = (USE_HTTPX ? httpx : http).createServer(options, async function (req, res) {

    try {
        const remoteAddress=clientAddress(req)
        if(!isIpTemporarilyBlocked(req, remoteAddress)) {
            const host = getHostFromHeaders(req.headers)

            req.isHttps = req.socket.encrypted || this.constructor.name === 'Server'

            // check with and without www
            const hostRuleHost = req.headers['x-host-rule'] ? req.headers['x-host-rule'].split(':')[0] : host
            const hostrule = {...hostrules.general, ...(hostrules[hostRuleHost] || hostrules[hostRuleHost.substring(4)])}

            if (hostrule.certDir && hasHttpsWwwRedirect.call(this, host, req, res, remoteAddress)) {
                return
            }

            //small security check
            if (hostrule.blockedIps && hostrule.blockedIps.indexOf(remoteAddress)>=0) {
                console.log(`ip ${remoteAddress} is blocked in hostrule for ${hostRuleHost}`)
                sendError(res, 403)
                return
            }

            const parsedUrl = url.parse(req.url, true)
            let urlPathname
            try {
                urlPathname = decodeURIComponent(parsedUrl.pathname)
            } catch (e) {
                urlPathname = decodeURIComponentSafe(parsedUrl.pathname)
            }

            console.log(`${req.method} ${remoteAddress}: ${host}${parsedUrl.href} - ${req.headers['user-agent']}`)

            //small security check
            if (urlPathname.indexOf('../') >= 0) {
                sendError(res, 403)
                return
            }

            if (urlPathname.startsWith('/graphql') || urlPathname.startsWith('/' + API_PREFIX)) {
                // there is also /graphql/upload
                return proxy.web(req, res, {
                    hostname: 'localhost',
                    proxyTimeout: 3600000, /* 1h */
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
                        const backup_dir = path.join(ROOT_DIR, BACKUP_DIR)
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
                }else if (urlPathname === '/createheapdump') {
                    const context = contextByRequest(req)
                    if (context.id && context.role === 'administrator') {

                        const backup_dir = path.join(ROOT_DIR, BACKUP_DIR+'/heapdump/')

                        if (ensureDirectoryExistence(backup_dir)) {
                            const filename = Date.now() + '.heapsnapshot'
                            const filepath = path.join(backup_dir, filename)

                            heapdump.writeSnapshot(filepath, (e) => {
                                console.log(e)
                            })
                            res.writeHead(200, {'Content-Type': 'text/html'})
                            res.write(`<a download href='${BACKUP_URL}/heapdump/${filename}'>${filename}</a>`)
                            res.end()
                        }else{
                            sendError('cannot create dir', 500)
                        }

                    } else {
                        sendError(res, 403)
                    }


                } else if (urlPathname.startsWith(UPLOAD_URL + '/')) {
                    await resolveUploadedFile(urlPathname, parsedUrl, req, res)
                } else {


                    if (hostrule.redirects) {

                        let redirect = hostrule.redirects[urlPathname+parsedUrl.search]
                        if(!redirect) {
                            redirect = hostrule.redirects[urlPathname]
                        }
                        if (!redirect) {
                            if (urlPathname.endsWith('/')) {
                                redirect = hostrule.redirects[urlPathname.slice(0, -1)]
                            } else {
                                redirect = hostrule.redirects[urlPathname + '/']
                            }
                        }

                        if (!redirect) {
                            redirect = hostrule.redirects['*']
                        }
                        if (redirect) {

                            const agent = req.headers['user-agent']
                            if( !agent || agent.indexOf('www.letsencrypt.org') < 0 ) {
                                res.writeHead(301, {'Location': redirect})
                                res.end()
                                return true
                            }
                        }

                    }

                    hostrule.headers = {...hostrules.general.headers, ...hostrule.headers}

                    let staticFile

                    if (hostrule.fileMapping && hostrule.fileMapping[urlPathname]) {
                        staticFile = path.join(hostrule._basedir, hostrule.fileMapping[urlPathname])
                        console.log('mapped file: ' + staticFile)
                    } else if (urlPathname.length > 1 && fs.existsSync(STATIC_TEMPLATE_DIR + urlPathname)) {
                        console.log(`load ${urlPathname} from template dir`)
                        fs.readFile(STATIC_TEMPLATE_DIR + urlPathname, 'utf8', function (err, data) {
                            const ext = path.extname(urlPathname).split('.')[1]
                            const mimeType = MimeType.detectByExtension(ext)

                            const headerExtra = {
                                'Cache-Control': 'public, max-age=604800',
                                'Content-Type': mimeType,
                                'Last-Modified': new Date().toUTCString(),
                                ...hostrule.headers[urlPathname]
                            }
                            res.writeHead(200, headerExtra)
                            res.write(replacePlaceholders(data, {
                                headers: req.headers,
                                parsedUrl,
                                host,
                                config,
                                pathname:urlPathname}))
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
                                        const screenShotDir = path.join(ABS_UPLOAD_DIR, 'screenshots')

                                        if (data.screenshot && ensureDirectoryExistence(screenShotDir)) {
                                            //{"screenshot":{"url":"https:/stackoverflow.com/questions/4374822/remove-all-special-characters-with-regexp","options":{"height":300}}}
                                            //console.log(decodeURI(urlPathname.substring(pos+5)))

                                            const filename = decodedStr.replace(/[^\w]/gi, '') + '.png'

                                            const absFilename = path.join(screenShotDir, filename)

                                            if (!fs.existsSync(absFilename)) {
                                                let url = data.screenshot.url
                                                if (url.indexOf('/') === 0) {
                                                    url = /*(req.isHttps ? 'https://' : 'http://') + hostRuleHost*/ 'http://127.0.0.1:'+PORT + url
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
                                    sendIndexFile({req, res, remoteAddress, urlPathname, hostrule, host, parsedUrl})
                                }
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

/* this is only used for video conference tool */
//TODO: Move this to an extension as it doesn't belong here
import stream from './stream.js'
import {Server} from 'socket.io'


let ioHttp = new Server(app.http)
ioHttp.on('connection', stream)

let ioHttps = new Server(app.https)
ioHttps.on('connection', stream)


//
// Listen to the `upgrade` event and proxy the
// WebSocket requests as well.
//
if (USE_HTTPX) {
    app.http.on('upgrade', webSocket)
    app.https.on('upgrade', webSocket)
    app.http.on('error', (e) => {
        console.log('http error', e)
    })
    app.https.on('error', (e) => {
        console.log('https error', e)
    })
    app.http.on('clientError', (err, socket) => {
        console.log('http clientError', err)

        if (err.code === 'ECONNRESET' || !socket.writable) {
            return
        }
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    })
    app.https.on('clientError', (err, socket) => {
        console.log('https clientError', err)

        if (err.code === 'ECONNRESET' || !socket.writable) {
            return
        }
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    })
} else {
    app.on('upgrade', webSocket)
}
// Start server
app.listen(PORT, () => console.log(
    `Listening at localhost:${PORT}`
))
