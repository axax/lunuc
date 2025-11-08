import httpx from './httpx.mjs'
import http from 'http'
import url from 'url'
import path from 'path'
import net from 'net'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import MimeType from '../util/mime.mjs'
import {getHostFromHeaders} from '../util/host.mjs'
import {replacePlaceholders} from '../util/placeholders.mjs'
import {ensureDirectoryExistence} from '../util/fileUtil.mjs'
import {getBestMatchingHostRule, getHostRules, getRootCertContext} from '../util/hostrules.mjs'
import {contextByRequest} from '../api/util/sessionContext.mjs'
import {parseUserAgent} from '../util/userAgent.mjs'
import {SECRET_KEY, TRACK_IP_HEADER, USE_COOKIES} from '../api/constants/index.mjs'
import {parseCookies} from '../api/util/parseCookies.mjs'
import {isTemporarilyBlocked} from './util/requestBlocker.mjs'
import {parseWebsite} from './util/web2html.mjs'
import {decodeToken} from '../api/util/jwt.mjs'
import {proxyToApiServer, proxyWsToApiServer} from './util/apiProxy.mjs'
//import heapdump from 'heapdump'
import {clientAddress} from '../util/host.mjs'
import Cache from '../util/cache.mjs'
import {decodeURIComponentSafe, doScreenCapture, regexRedirectUrl} from './util/index.mjs'
import {createSimpleEtag} from './util/etag.mjs'
import {getDynamicConfig} from '../util/config.mjs'
import {
    getFileFromOtherServer,
    parseAndSendFile,
    sendError,
    sendFile,
    sendFileFromDir,
    zipAndSendMedias
} from './util/file.mjs'
import {actAsReverseProxy, isUrlValidForPorxing} from './util/reverseProxy.mjs'

const config = getDynamicConfig()

const {UPLOAD_DIR, UPLOAD_URL, BACKUP_DIR, BACKUP_URL, API_PREFIX, WEBROOT_ABSPATH} = config
const ROOT_DIR = path.resolve(), SERVER_DIR = path.join(ROOT_DIR, './server')
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, UPLOAD_DIR)
const API_PREFIXES = config.API_PREFIX?(Array.isArray(config.API_PREFIX)? config.API_PREFIX : [config.API_PREFIX]):[]


// Use Httpx
const USE_HTTPX = process.env.LUNUC_HTTPX === 'false' ? false : true

// Port to listen to
const PORT = (process.env.PORT || process.env.LUNUC_PORT || 8080)

// Build dir
const BUILD_DIR = path.join(ROOT_DIR, './build')
const STATIC_DIR = path.join(ROOT_DIR, './' + config.STATIC_DIR)
const STATIC_TEMPLATE_DIR = path.join(ROOT_DIR, './' + config.STATIC_TEMPLATE_DIR)

const DEFAULT_CERT_DIR = process.env.LUNUC_CERT_DIR || SERVER_DIR


const options = {
    allowHTTP1: true,
    SNICallback: (domain, cb) => {

        const {hostrule} = getBestMatchingHostRule(domain)

        if(hostrule && hostrule.certContext){
            cb(null, hostrule.certContext)
        }else{
            cb(null,getRootCertContext())
        }
    }
}

if (fs.existsSync(path.join(DEFAULT_CERT_DIR, './chain.pem'))) {
    // Certificate authority
    options.ca = fs.readFileSync(path.join(DEFAULT_CERT_DIR, './chain.pem'))
    const hostrules = getHostRules(true)
    if(hostrules.general && !hostrules.general.certDir){
        hostrules.general.certDir = path.join(DEFAULT_CERT_DIR, './chain.pem')
    }
}

process.on('uncaughtException', (error) => {
    console.log(error)
    console.error(error.stack);
    console.log("Node NOT Exiting...");
})

const sendIndexFile = async ({req, res, urlPathname, remoteAddress, hostrule, host, parsedUrl}) => {

    const agent = req.headers['user-agent']

    if(!agent){
        console.warn('Server: User-Agent missing for '+urlPathname)
        res.writeHead(404)
        res.end()
        return
    }

    const headers = {
        'Cache-Control': 'public, max-age=60',
        'Content-Type': MimeType.detectByExtension('html')+'; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000',
        /*'Content-Security-Policy': "default-src 'self';" +
            "font-src 'self' fonts.gstatic.com;" +
            "img-src 'self' data: en.gravatar.com;" +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval';" +
            "style-src 'self' 'unsafe-inline' fonts.googleapis.com",*/
        ...hostrule.headers.common,
        ...hostrule.headers[urlPathname]
    }

    const statusCode = (hostrule.statusCode && hostrule.statusCode[urlPathname] ? hostrule.statusCode[urlPathname] : 200)

    let botRegex
    if(hostrule.botregex){
        botRegex = hostrule.botregex
    }else {
        const hostrules = getHostRules(true)
        botRegex = (hostrules.general && hostrules.general.botregex)
    }
    let {isBot, noJsRendering} = parseUserAgent(agent, botRegex)

    if (noJsRendering || parsedUrl.query.__ssr==='1') {

        if ( req.headers.accept && req.headers.accept.indexOf('text/html') < 0 && req.headers.accept.indexOf('*/*') < 0) {
            console.log('headers not valid', req.headers.accept)
            res.writeHead(404)
            res.end()
            return
        }
        // return rendered html for bing as they are not able to render js properly
        const baseUrl = `http://localhost:${PORT}`
        const urlToFetch = baseUrl + urlPathname + (parsedUrl.search ? parsedUrl.search : '').replace('?__ssr=1','').replace('&__ssr=1','')

        const cacheFileDir = path.join(SERVER_DIR, 'cache', host.replace(/\W/g, ''))
        const cacheFileName = cacheFileDir + '/' + urlToFetch.replace(/\W/g, '') + '.html'

        const errorFile = Cache.get('ErrorFile'+cacheFileName)
        if(errorFile){
            console.log(`send from error file cache ${cacheFileName}`)
            res.writeHead(errorFile.statusCode, headers)
            res.write('Error '+errorFile.statusCode)
            res.end()
            return
        }

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
                    modeTime = new Date(statsFile.mtime).getTime() + 60000; // a day in miliseconds = 86400000

                if (modeTime > now) {
                    // TODO request is not tracked
                    console.log(`cache is not updated for ${cacheFileName}`)
                    return
                }
            }
            // return isFile
        }

        const pageData = await parseWebsite(urlToFetch, {host, agent, referer: req.headers.referer, isBot, remoteAddress, cookies})

        // remove script tags
        pageData.html = pageData.html.replace(/<(script|noscript)[\s\S]*?<\/\1>/gi,'')

        // replace host
        const re = new RegExp(baseUrl, 'g')
        pageData.html = pageData.html.replace(re, `https://${host}`)


        if (pageData.statusCode >= 500 || pageData.statusCode === 404) {

            if (!sentFromCache) {
                Cache.set('ErrorFile'+cacheFileName, {statusCode: pageData.statusCode}, 360000) // 5 min

                res.writeHead(pageData.statusCode, headers)
                if (pageData.statusCode < 500) {
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
        parseAndSendFile(req, res, {filename:indexfile, headers, statusCode, parsedUrl, host, remoteAddress, hostrule})
    }
}


const sendFileFromTemplateDir = (req, res, urlPathname, headers, parsedUrl, host) => {
    console.log(`load ${urlPathname} from template dir`)

    // fetch file details
    fs.stat(STATIC_TEMPLATE_DIR + urlPathname, (err, stats) => {
        if (err) {
            throw err
        }

        fs.readFile(STATIC_TEMPLATE_DIR + urlPathname, 'utf8', function (err, data) {
            const ext = path.extname(urlPathname).split('.')[1]
            const mimeType = MimeType.detectByExtension(ext)

            const content = replacePlaceholders(data, {
                headers: req.headers,
                parsedUrl,
                host,
                config,
                pathname: urlPathname
            })
            const etag = createSimpleEtag({content})
            if (req.headers['if-none-match'] === etag) {
                res.status(304).end()
                return
            }

            const headerExtra = {
                'Cache-Control': 'public, max-age=604800',
                'Content-Type': mimeType,
                'Last-Modified': stats.mtime.toUTCString(),
                'ETag': `"${etag}"`,
                ...headers
            }
            res.writeHead(200, headerExtra)
            res.write(content)
            res.end()
        })
    })
}

const hasHttpsWwwRedirect = ({parsedUrl, hostrule, host, req, res, remoteAddress}) => {

    if (host !== 'localhost' && !net.isIP(host)) {

        // force www
        let newhost = host
        if (!newhost.startsWith('www.')
            && (newhost.indexOf('.')===newhost.lastIndexOf('.')) // not for subdomains
            && hostrule.forceWWW) {
            newhost = 'www.' + newhost
        }

        if (!config.DEV_MODE && !req.isHttps) {
            if (process.env.LUNUC_FORCE_HTTPS === 'true' && !req.headers[TRACK_IP_HEADER]) {

                const agent = req.headers['user-agent']

                // don't force redirect for letsencrypt
                if( agent && agent.indexOf('www.letsencrypt.org') < 0 ) {

                    const {browser, version} = parseUserAgent(agent)

                    if ((hostrule.allowInsecure && hostrule.allowInsecure[parsedUrl.pathname]) ||
                        (browser === 'netscape') ||
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
                res.writeHead(301, {'Location': (req.isHttps ? 'https' : 'http') + '://' + newhost + req.url})
                res.end()
                return true
            }
        }
    }
    return false
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


    if (!fs.existsSync(filename) && (!parsedUrl || parsedUrl.query.remoteserver!=='false') ) {
        if(await getFileFromOtherServer(modUri,baseFilename,res, req)){
            return
        }
    }

    if(!await sendFileFromDir(req, res,{filename, parsedUrl})){
        console.log('not exists: ' + filename)
        sendError(res, 404)
    }
}



// Initialize http api
const app = (USE_HTTPX ? httpx : http).createServer(options, async function (req, res) {

    try {
        const remoteAddress=clientAddress(req)
        if(!isTemporarilyBlocked({req, key:remoteAddress})) {
            const host = getHostFromHeaders(req.headers)

            req.isHttps = req.connection.encrypted || req.socket.encrypted

            // check with and without www
            //const hostRuleHost = req.headers[HOSTRULE_HEADER] ? req.headers[HOSTRULE_HEADER].split(':')[0] : host
            const hostrules = getHostRules(true)
            const hostrule = {...hostrules.general, ...getBestMatchingHostRule(host).hostrule}

            const parsedUrl = url.parse(req.url, true)

            console.log(`${req.method} ${remoteAddress}: ${host}${parsedUrl.href} - ${req.headers['user-agent']}`)


            if (hostrule.certDir && hasHttpsWwwRedirect( {parsedUrl, hostrule, host, req, res, remoteAddress})) {
                return
            }

            //small security check
            if (hostrule.blockedIps && hostrule.blockedIps.indexOf(remoteAddress)>=0) {
                console.log(`ip ${remoteAddress} is blocked in hostrule for ${host}`)
                sendError(res, 403)
                return
            }

            let urlPathname
            try {
                urlPathname = decodeURIComponent(parsedUrl.pathname)
            } catch (e) {
                urlPathname = decodeURIComponentSafe(parsedUrl.pathname)
            }

            //small security check
            if (urlPathname.indexOf('../') >= 0) {
                sendError(res, 403)
                return
            }

           // hostrule.reverseProxy = {ip:'localhost',port:9002,http2:false}
            if(isUrlValidForPorxing(urlPathname, hostrule)){
                actAsReverseProxy(req,res,{parsedUrl,hostrule, host})
            }else if (urlPathname.startsWith('/graphql') || API_PREFIXES.some(prefix => urlPathname.startsWith('/'+prefix + '/'))) {
                // there is also /graphql/upload
                proxyToApiServer(req, res, {host, path: parsedUrl.path})
            } else {
                if (urlPathname.startsWith( '/tokenlink/')) {
                    let token = urlPathname.substring(11)
                    token = token.substring(0,token.indexOf('/'))
                    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
                        if (!err) {

                            if(decoded.mediaIds){
                                zipAndSendMedias(res, decoded)
                            }else if (!await sendFileFromDir(req, res, {
                                filename: path.join(ROOT_DIR, decoded.filePath),
                                neverCompress: true, headers: {}, parsedUrl
                            })) {
                                sendError(res, 404)
                            }

                        } else {
                            console.error(err)
                            sendError(res, 404)
                        }
                    })

                }else if (urlPathname.startsWith(BACKUP_URL + '/')) {
                    const context = contextByRequest(req)
                    if (context.id && context.role === 'administrator') {
                        // only allow download if valid jwt token is set
                        const backup_dir = path.join(ROOT_DIR, BACKUP_DIR)
                        const filename = path.join(backup_dir, urlPathname.substring(BACKUP_URL.length))

                        if(!await sendFileFromDir(req, res, {filename: filename,
                            neverCompress:true, headers: {}, parsedUrl})){
                            sendError(res, 404)
                        }
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

                            /*heapdump.writeSnapshot(filepath, (e) => {
                                console.log(e)
                            })*/
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

                    let redirect
                    if (hostrule.redirects) {

                        redirect = hostrule.redirects[urlPathname+parsedUrl.search]
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
                    }
                    if(!redirect && hostrule.regexRedirects){
                        redirect = regexRedirectUrl(urlPathname+(parsedUrl.search || ''), hostrule.regexRedirects)
                    }
                    if (redirect) {

                        redirect = redirect.replace(/%pathname%/g, parsedUrl.pathname || '/').replace(/%search%/g, parsedUrl.search || '')

                        console.log(`Hostrule redirect to ${redirect}`)
                        const agent = req.headers['user-agent']
                        if( !agent || agent.indexOf('www.letsencrypt.org') < 0 ) {
                            res.writeHead(301, {'Location': redirect})
                            res.end()
                            return true
                        }
                    }

                    hostrule.headers = {...hostrules.general.headers, ...hostrule.headers}
                    const headers = {...hostrule.headers.common,...hostrule.headers[urlPathname]}
                    if (hostrule.fileMapping && hostrule.fileMapping[urlPathname]) {
                        const mappedFile = path.join(hostrule._basedir, hostrule.fileMapping[urlPathname])
                        //console.log('mapped file: ' + mappedFile)
                        if (await sendFileFromDir(req, res, {filename: mappedFile, headers, parsedUrl})) {
                            return
                        }
                    } else if (urlPathname.length > 1 && fs.existsSync(STATIC_TEMPLATE_DIR + urlPathname)) {
                        sendFileFromTemplateDir(req, res, urlPathname, headers, parsedUrl, host )
                        return
                    }

                    if(hostrule.webRoot){
                        // if a webRoot is defined, only this path is checked for matching files
                        const indexFile = hostrule.indexFile || 'index.html'
                        if (await sendFileFromDir(req, res, {filename: path.join(WEBROOT_ABSPATH, hostrule.webRoot, urlPathname!=='/'?urlPathname:indexFile), headers})) {
                            return
                        }
                        sendError(res, 404)
                        return
                    }else if(urlPathname!=='/'){
                        const pathsToCheck = [...hostrule.paths, STATIC_DIR, WEBROOT_ABSPATH, BUILD_DIR]

                        for(const curPath of pathsToCheck){
                            if (await sendFileFromDir(req, res, {filename: path.join(curPath, urlPathname), headers, parsedUrl})) {
                                return
                            }
                        }
                    }

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
                                    const result = await doScreenCapture(url, absFilename, data.screenshot.options)
                                    if(result.statusCode!=200){
                                        if(result.statusCode===302){
                                            res.writeHead(result.statusCode, {'Location': result.location})
                                            res.end()
                                        }else {
                                            sendError(res, result.statusCode)
                                        }
                                        return
                                    }

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

                        const ext = path.extname(urlPathname)
                        if(!ext || urlPathname.indexOf('/'+config.PRETTYURL_SEPERATOR+'/')>=0) {
                            // file extension is not allowed here
                            await sendIndexFile({req, res, remoteAddress, urlPathname, hostrule, host, parsedUrl})
                        }else{
                            sendError(res, 404)
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
    app.http.on('upgrade', proxyWsToApiServer)
    app.https.on('upgrade', proxyWsToApiServer)
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
        console.log('https clientError', err, socket && socket.remoteAddress)

        if (err.code === 'ECONNRESET' || !socket.writable) {
            return
        }
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    })
} else {
    app.on('upgrade', proxyWsToApiServer)
}
// Start server
app.listen(PORT, () => console.log(
    `Listening at localhost:${PORT}`
))
