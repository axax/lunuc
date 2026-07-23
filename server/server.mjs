// server/index.mjs
import httpx from './httpx.mjs'
import http from 'http'
import url from 'url'
import path from 'path'
import net from 'net'
import fs from 'fs'
import crypto from 'crypto'
import '../gensrc/extensions-root-server.mjs'
import MimeType from '../util/mime.mjs'
import {getHostFromHeaders} from '../util/host.mjs'
import {replacePlaceholders} from '../util/placeholders.mjs'
import {ensureDirectoryExistence} from '../util/fileUtil.mjs'
import {getBestMatchingHostRule, getHostRules, getRootCertContext, resetHostRules} from '../util/hostrules.mjs'
import {contextByRequest} from '../api/util/sessionContext.mjs'
import {isLetsEncryptAgent, parseUserAgent} from '../util/userAgent.mjs'
import {TRACK_IP_HEADER} from '../api/constants/index.mjs'
import {parseCookies} from '../api/util/parseCookies.mjs'
import {isTemporarilyBlocked} from './util/requestBlocker.mjs'
import {parseWebsite} from './util/web2html.mjs'
import {proxyToApiServer, proxyWsToApiServer} from './util/apiProxy.mjs'
import {verifyTokenAndResponse} from './util/tokenLink.mjs'
//import heapdump from 'heapdump'
import {clientAddress} from '../util/host.mjs'
import Cache from '../util/cache.mjs'
import {decodeURIComponentSafe, regexRedirectUrl, doScreenCapture, createCanonicalSsrQuery} from './util/index.mjs'
import {createSimpleEtag} from './util/etag.mjs'
import {getDynamicConfig} from '../util/config.mjs'
import {
    resolveUploadedFile,
    parseAndSendFile,
    sendError,
    sendFile,
    sendFileFromDir, statSafe
} from './util/file.mjs'
import {actAsReverseProxy, isUrlValidForPorxing} from './util/reverseProxy.mjs'
import {doTrackingEvent} from './util/tracking.mjs'
import {getGatewayIp} from '../util/gatewayIp.mjs'
import {isRateLimited} from './util/rateLimiter.mjs'
import {applyRequestRules} from './util/requestRules.mjs'
import {getRegexCached} from './util/regexCache.mjs'
import {initAsnBlocker, checkAsnPolicy, getAsnStats, resetAsnStats} from './util/asnBlocker.mjs'

const config = getDynamicConfig()

const {UPLOAD_DIR, UPLOAD_URL, BACKUP_DIR, BACKUP_URL, API_PREFIX, WEBROOT_ABSPATH} = config
const ROOT_DIR = path.resolve(), SERVER_DIR = path.join(ROOT_DIR, './server')
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, UPLOAD_DIR)
const API_PREFIXES = API_PREFIX ? (Array.isArray(API_PREFIX) ? API_PREFIX : [API_PREFIX]) : []


// Use Httpx
const USE_HTTPX = process.env.LUNUC_HTTPX === 'false' ? false : true

// Port to listen to
const PORT = (process.env.PORT || process.env.LUNUC_PORT || 8080)

// Build dir
const BUILD_DIR = path.join(ROOT_DIR, './build')
const STATIC_DIR = path.join(ROOT_DIR, './' + config.STATIC_DIR)
const STATIC_TEMPLATE_DIR = path.join(ROOT_DIR, './' + config.STATIC_TEMPLATE_DIR)

const DEFAULT_CERT_DIR = process.env.LUNUC_CERT_DIR || SERVER_DIR

const CACHED_FILES_VALIDATION_TIME = 86400000 * 5 // a day in miliseconds = 86400000

// Request timeout. Was 0 (disabled) which allows slowloris-style clients to
// hold connections open forever after the first byte. Streaming/uploads that
// legitimately take longer go through the API proxy / dedicated paths.
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000 // 5 min

// Base url of this server instance (used for SSR fetches and host replacement)
const BASE_URL = `http://localhost:${PORT}`
const BASE_URL_REGEX = new RegExp(BASE_URL, 'g')

const options = {
    allowHTTP1: true,
    SNICallback: (domain, cb) => {

        const {hostrule} = getBestMatchingHostRule(domain)

        if (hostrule && hostrule.certContext) {
            cb(null, hostrule.certContext)
        } else {
            cb(null, getRootCertContext())
        }
    }
}

// Startup code: sync fs calls are intentional here - the config must be
// fully loaded before the server starts listening, and nothing else is
// running yet that could be blocked.
if (fs.existsSync(path.join(DEFAULT_CERT_DIR, './chain.pem'))) {
    // Certificate authority
    options.ca = fs.readFileSync(path.join(DEFAULT_CERT_DIR, './chain.pem'))
    const hostrules = getHostRules(true)
    if (hostrules.general && !hostrules.general.certDir) {
        hostrules.general.certDir = path.join(DEFAULT_CERT_DIR, './chain.pem')
    }
}

process.on('uncaughtException', (error) => {
    console.log(error)
    console.error(error.stack);
    console.log("Node NOT Exiting...");
})


/* ------------------------------------------------------------------ */
/* Security: path traversal protection                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolves urlParts inside baseDir and returns the absolute path,
 * or null if the resolved path escapes baseDir (path traversal).
 * urlPathname is URI-decoded upstream, so sequences like %2e%2e%2f
 * arrive here as "../" and MUST NOT be allowed to leave baseDir.
 */
const safeJoin = (baseDir, ...urlParts) => {
    const resolved = path.resolve(baseDir, '.' + path.sep + path.join(...urlParts))
    if (resolved === baseDir || resolved.startsWith(baseDir + path.sep)) {
        return resolved
    }
    return null
}

/**
 * Rough check for private / internal network targets.
 * Not bulletproof (DNS rebinding can bypass hostname checks) but combined
 * with the auth requirement it removes the trivial SSRF vectors.
 */
const isPrivateNetworkTarget = (hostname) => {
    if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname)) {
        return true
    }
    return hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        hostname.startsWith('100.') || // CGNAT / tailscale range
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
}


/* ------------------------------------------------------------------ */
/* Performance: template dir file index (avoids existsSync per request) */
/* ------------------------------------------------------------------ */

// Set of url pathnames ('/robots.txt', '/sub/file.xml', ...) that exist in
// the template dir. Refreshed via fs.watch, so the hot path is a pure
// in-memory lookup instead of a blocking syscall on every request.
let templateFiles = new Set()

const scanTemplateDir = async () => {
    const files = new Set()
    try {
        const entries = await fs.promises.readdir(STATIC_TEMPLATE_DIR, {recursive: true, withFileTypes: true})
        for (const entry of entries) {
            if (entry.isFile()) {
                // parentPath is the modern name, path the older one (Node < 20.12)
                const parent = entry.parentPath || entry.path || STATIC_TEMPLATE_DIR
                const abs = path.join(parent, entry.name)
                const rel = '/' + path.relative(STATIC_TEMPLATE_DIR, abs).split(path.sep).join('/')
                files.add(rel)
            }
        }
    } catch (e) {
        // dir may not exist - that's fine, set stays empty
    }
    templateFiles = files
}

// top-level await is fine in ESM - the index must be complete before serving
await scanTemplateDir()
try {
    fs.watch(STATIC_TEMPLATE_DIR, {recursive: true}, () => {
        // debounce bursts of change events
        clearTimeout(scanTemplateDir._t)
        scanTemplateDir._t = setTimeout(scanTemplateDir, 200)
    })
} catch (e) {
    console.warn('index: cannot watch template dir', e.message)
}

await initAsnBlocker()


/* ------------------------------------------------------------------ */
/* Performance: static path resolution cache                            */
/* ------------------------------------------------------------------ */

// Caches which directory a static url resolves to, so subsequent requests
// skip the sequential stat attempts across hostrule.paths / STATIC_DIR /
// WEBROOT / BUILD_DIR. Value: resolved absolute path, or false = known miss.
const PATH_CACHE_TTL_MS = 60000
const PATH_CACHE_MAX_ENTRIES = 5000
const pathResolveCache = new Map()

const pathCacheGet = (key) => {
    const entry = pathResolveCache.get(key)
    if (entry && entry.expires > Date.now()) {
        return entry.value
    }
    pathResolveCache.delete(key)
    return undefined
}

const pathCacheSet = (key, value) => {
    // primitive size cap - drop oldest entry when full
    if (pathResolveCache.size >= PATH_CACHE_MAX_ENTRIES) {
        pathResolveCache.delete(pathResolveCache.keys().next().value)
    }
    pathResolveCache.set(key, {value, expires: Date.now() + PATH_CACHE_TTL_MS})
}


/* ------------------------------------------------------------------ */
/* SSR: render concurrency limit, deduplication + atomic writes         */
/* ------------------------------------------------------------------ */

// In-flight render deduplication: prevents a cache stampede when multiple
// requests hit the same expired/missing cache entry simultaneously. All
// concurrent requests for the same url share a single parseWebsite call.
const pendingRenders = new Map()

// Global Puppeteer concurrency limit. renderOnce deduplicates IDENTICAL
// urls, this semaphore caps how many DIFFERENT urls render at the same
// time. Everything above RENDER_MAX_CONCURRENT waits in a bounded queue,
// everything above the queue limit is rejected immediately with an
// overloaded result - the server stays responsive no matter how many
// distinct urls come in.
// LUNUC_SSR_CONCURRENCY is also read by web2html.mjs (its page-leak
// threshold is derived from it) - one env var, two consumers, same default.
const RENDER_MAX_CONCURRENT = parseInt(process.env.LUNUC_SSR_CONCURRENCY) || 5
const RENDER_MAX_QUEUE = parseInt(process.env.LUNUC_SSR_QUEUE) || 20

let activeRenders = 0
const renderQueue = []

const acquireRenderSlot = () => {
    if (activeRenders < RENDER_MAX_CONCURRENT) {
        activeRenders++
        return Promise.resolve(true)
    }
    if (renderQueue.length >= RENDER_MAX_QUEUE) {
        return Promise.resolve(false) // overloaded - caller sends 503
    }
    return new Promise(resolve => renderQueue.push(resolve))
}

const releaseRenderSlot = () => {
    const next = renderQueue.shift()
    if (next) {
        next(true) // hand the slot over, activeRenders stays constant
    } else {
        activeRenders--
    }
}

const renderOnce = (cacheKey, renderFn) => {
    if (pendingRenders.has(cacheKey)) {
        // same url is already being rendered -> reuse that promise
        return pendingRenders.get(cacheKey)
    }
    const promise = (async () => {
        const gotSlot = await acquireRenderSlot()
        if (!gotSlot) {
            return {statusCode: 503, html: '', overloaded: true}
        }
        try {
            return await renderFn()
        } finally {
            releaseRenderSlot()
        }
    })().finally(() => pendingRenders.delete(cacheKey))
    pendingRenders.set(cacheKey, promise)
    return promise
}

// Atomic cache write: write to a tmp file first, then rename. rename is
// atomic on the same filesystem, so a concurrent request can never read
// a half-written html file.
const writeCacheFileAtomic = (cacheFileName, html) => {
    const tmpFile = `${cacheFileName}.tmp-${process.pid}-${Date.now()}`
    fs.writeFile(tmpFile, html, (err) => {
        if (err) {
            console.error('Error writing cache tmp file ' + tmpFile, err)
            return
        }
        fs.rename(tmpFile, cacheFileName, (renameErr) => {
            if (renameErr) {
                console.error('Error renaming cache file ' + cacheFileName, renameErr)
                // cleanup orphaned tmp file
                fs.unlink(tmpFile, () => {})
            }
        })
    })
}

const sendIndexFile = async ({req, res, urlPathname, remoteAddress, hostrule, host, parsedUrl}) => {

    const agent = req.headers['user-agent']

    if (!agent) {
        console.warn('Server: User-Agent missing for ' + urlPathname)
        res.writeHead(404)
        res.end()
        return
    }

    const headers = {
        'Cache-Control': 'public, max-age=60',
        'Content-Type': MimeType.detectByExtension('html') + '; charset=utf-8',
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

    let {isBot, noJsRendering} = parseUserAgent(agent, {botRegex: hostrule.botRegex, noJsRenderingBotRegex: hostrule.noJsRenderingBotRegex})

    if (noJsRendering || parsedUrl.query.__ssr === '1') {

        if (req.headers.accept && req.headers.accept.indexOf('text/html') < 0 && req.headers.accept.indexOf('*/*') < 0) {
            console.log('headers not valid', req.headers.accept)
            res.writeHead(404)
            res.end()
            return
        }

        const queryString = createCanonicalSsrQuery(parsedUrl.query, hostrule)

        if (queryString === null) {
            // query too large for ssr - serve the js shell instead of
            // rendering. Real browsers handle it, scrapers get nothing costly.
            console.log(`ssr skipped (query limits) ${urlPathname} ${remoteAddress}`)
            let indexfile
            if (hostrule.fileMapping && hostrule.fileMapping['/index.html']) {
                indexfile = path.join(hostrule._basedir, hostrule.fileMapping['/index.html'])
            } else {
                indexfile = path.join(BUILD_DIR, '/index.min.html')
            }
            await parseAndSendFile(req, res, {filename: indexfile, headers, statusCode, parsedUrl, host, remoteAddress, hostrule})
            return
        }

        const urlToFetch = BASE_URL + urlPathname + queryString
        const cacheFileDir = path.join(SERVER_DIR, 'cache', host.replace(/\W/g, ''))

        // filename is the hash alone: uniqueness and filesystem length
        // limits solved in one. 16 hex chars = 64 bits - collision-safe at
        // any realistic cache size (8 chars/32 bits would reach birthday-
        // collision territory at ~65k urls). To map a hash back to its url,
        // grep the hash in the logs (every cache log line contains it).
        const urlHash = crypto.createHash('md5').update(urlPathname + queryString).digest('hex').substring(0, 16)

        const cacheFileName = `${cacheFileDir}/${urlHash}.html`

        const errorFile = Cache.get('ErrorFile' + cacheFileName)
        if (errorFile) {
            console.log(`send from error file cache ${cacheFileName}`)
            res.writeHead(errorFile.statusCode, headers)
            res.write('Error ' + errorFile.statusCode)
            res.end()
            await doTrackingEvent(req, {event: '404', host})
            return
        }

        const cookies = parseCookies(req)

        let sentFromCache = false
        if (!cookies.auth && ensureDirectoryExistence(cacheFileDir, true)) {

            // one async stat replaces the previous existsSync + statSync pair -
            // non-blocking and no TOCTOU gap between the two calls
            const cacheStats = await statSafe(cacheFileName)

            if (cacheStats && cacheStats.isFile()) {

                //from cache
                console.log(`send from cache ${cacheFileName}`)

                await sendFile(req, res, {headers, filename: cacheFileName, fileStat: cacheStats, statusCode: 200})
                sentFromCache = true

                // only update cache if file is old enough
                const now = Date.now(),
                    modeTime = cacheStats.mtime.getTime() + CACHED_FILES_VALIDATION_TIME

                if (modeTime > now) {
                    await doTrackingEvent(req, {event: 'visit', host})
                    console.log(`cache is not updated for ${cacheFileName}`)
                    return
                }

                // stale content was already sent - if a background render for
                // this url is already in flight, don't trigger another one,
                // the running render will refresh the cache
                if (pendingRenders.has(cacheFileName)) {
                    await doTrackingEvent(req, {event: 'visit', host})
                    console.log(`render already in flight for ${cacheFileName}`)
                    return
                }
            }
        }

        // deduplicated render: concurrent requests for the same url share one
        // render; the semaphore caps total concurrency across different urls
        const pageData = await renderOnce(cacheFileName, () =>
            parseWebsite(urlToFetch, {host, agent, referer: req.headers.referer, isBot, remoteAddress, cookies}))

        if (pageData.overloaded) {
            // render capacity exhausted. If stale content was already sent,
            // the client is fine - just don't touch the error cache. Fresh
            // requests get 503 + Retry-After (Googlebot treats that as
            // temporary and retries instead of derating the page). Must run
            // BEFORE the error-cache logic below, otherwise a full queue
            // would cache the url as an error for 6 minutes.
            if (!sentFromCache) {
                res.writeHead(503, {...headers, 'Retry-After': '30'})
                res.end()
            }
            return
        }

        // remove script tags
        pageData.html = pageData.html.replace(/<(script|noscript)(?![^>]*type=["']application\/ld\+json["'])[\s\S]*?<\/\1>/gi, '')

        // replace host (BASE_URL_REGEX is precompiled at module level)
        pageData.html = pageData.html.replace(BASE_URL_REGEX, `https://${host}`)


        if (pageData.statusCode >= 500 || pageData.statusCode === 404) {

            if (sentFromCache) {
                // stale content was already sent and the background re-render
                // failed: touch the stale file so CACHED_FILES_VALIDATION_TIME
                // acts as a backoff instead of retrying the (failing) render
                // on every single request
                const now = new Date()
                fs.utimes(cacheFileName, now, now, (err) => {
                    if (err) {
                        console.warn('could not touch stale cache file ' + cacheFileName, err)
                    }
                })
                console.warn(`background re-render failed (${pageData.statusCode}) for ${cacheFileName} -> keeping stale cache with backoff`)
            } else {
                Cache.set('ErrorFile' + cacheFileName, {statusCode: pageData.statusCode}, 360000) // 6 min

                res.writeHead(pageData.statusCode, headers)
                if (pageData.statusCode < 500) {
                    res.write(pageData.html)
                }
                res.end()
            }

        } else {

            if (!sentFromCache) {
                res.writeHead(pageData.statusCode, headers)
                res.write(pageData.html)
                res.end()
            }
            if (!cookies.auth) {
                //console.log(`update cache for ${cacheFileName}`)
                writeCacheFileAtomic(cacheFileName, pageData.html)
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
        await parseAndSendFile(req, res, {filename: indexfile, headers, statusCode, parsedUrl, host, remoteAddress, hostrule})
    }
}


const sendFileFromTemplateDir = (req, res, urlPathname, headers, parsedUrl, host) => {
    //console.log(`load ${urlPathname} from template dir`)

    const templateFile = safeJoin(STATIC_TEMPLATE_DIR, urlPathname)
    if (!templateFile) {
        sendError(res, 404)
        return
    }

    // callback-based fs is already non-blocking - equivalent to fs.promises,
    // just a different notation
    fs.stat(templateFile, (err, stats) => {
        if (err) {
            // never throw inside an async fs callback - it bypasses the
            // request try/catch and leaves the response hanging forever
            sendError(res, 404)
            return
        }

        fs.readFile(templateFile, 'utf8', (err, data) => {
            if (err) {
                sendError(res, 404)
                return
            }

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
                // native http.ServerResponse - res.status() is Express-only
                res.writeHead(304)
                res.end()
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
            && (newhost.indexOf('.') === newhost.lastIndexOf('.')) // not for subdomains
            && hostrule.forceWWW) {
            newhost = 'www.' + newhost
        }

        if (!config.DEV_MODE && !req.isHttps && !req.headers['x-forwarded-server'] &&
            process.env.LUNUC_FORCE_HTTPS === 'true' && !req.headers[TRACK_IP_HEADER]) {

            const agent = req.headers['user-agent']

            // don't force redirect for letsencrypt
            if (agent && !isLetsEncryptAgent(agent)) {

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

        if (newhost != host) {
            const agent = req.headers['user-agent']

            if (!agent || !isLetsEncryptAgent(agent)) {
                console.log(`${remoteAddress}: Redirect to ${newhost} / request url=${req.url}`)
                res.writeHead(301, {'Location': (req.isHttps ? 'https' : 'http') + '://' + newhost + req.url})
                res.end()
                return true
            }
        }
    }
    return false
}



// Initialize http api
const app = (USE_HTTPX ? httpx : http).createServer(options, async function (req, res) {

    // Generous timeout instead of 0 (disabled): protects against clients
    // that start a request and never finish sending it. Long-running
    // streaming responses reset the timer with every write.
    req.setTimeout(REQUEST_TIMEOUT_MS)
    req.socket.setTimeout(REQUEST_TIMEOUT_MS)
    req.on('aborted', () => {
        console.log('in createServer request aborted', req.url)
    })
    req.on('error', (err) => {
        console.log('in createServer error', req.url, err)
    })

    try {
        const remoteAddress = clientAddress(req)
        if (isTemporarilyBlocked({key: remoteAddress})) {

            sendError(res, 429)

            return
        }

        const host = getHostFromHeaders(req.headers),
            parsedUrl = url.parse(req.url, true)

        if (!host) {
            console.log(`no host found in request: ${req.method} ${remoteAddress}`, req.url, req.headers)
            sendError(res, 403)
            return
        }


        req.isHttps = req.socket.encrypted

        if (!req.headers[TRACK_IP_HEADER] && parsedUrl.href !== '/graphql') {
            console.log(`${req.method} ${remoteAddress}: ${req.isHttps ? 'https' : 'http'}://${host}${parsedUrl.href} - ${req.headers['user-agent']}`)
        }
        // check with and without www
        const bestHostruleData = getBestMatchingHostRule(host)

        if (!bestHostruleData._exactMatch && net.isIP(host) === 0 && host !== 'localhost' && !isLetsEncryptAgent(req.headers['user-agent'])) {
            console.log(`no hostrule found for ${host}`)
            sendError(res, 404)
            return
        }

        const allHostrules = getHostRules(true),
            hostrule = {...allHostrules.general, ...bestHostruleData.hostrule}

        // Merge general headers into hostrule headers ONCE and EARLY, so both
        // sendIndexFile and the static file paths below see the same merged
        // headers. Previously this merge happened only in the static branch,
        // which meant index requests missed the general headers.
        hostrule.headers = {...allHostrules.general.headers, ...hostrule.headers}
        if (!hostrule.headers.common) {
            hostrule.headers.common = {}
        }

        const asnResult = await checkAsnPolicy({
            ip: remoteAddress,
            urlPathname: parsedUrl.pathname,
            userAgent: req.headers['user-agent'],
            hostrule
        })
        if (asnResult.action !== 'allow') {
            console.log(`asn ${asnResult.action} for ${remoteAddress} AS${asnResult.asn} (${asnResult.org}) ${parsedUrl.pathname}`)
            sendError(res, asnResult.action === 'block' ? 403 : 429)
            return
        }

        if (isRateLimited(req, hostrule, host)) {
            console.log(`rate limited for ${remoteAddress} ${req.headers['user-agent']}`)
            sendError(res, 429)
            return
        }

        if (applyRequestRules(req, res, parsedUrl, remoteAddress, hostrule.requestRules, host)) {
            return
        }

        if (hostrule.certDir && hasHttpsWwwRedirect({parsedUrl, hostrule, host, req, res, remoteAddress})) {
            return
        }

        //small security check
        if (hostrule.blockedIps && hostrule.blockedIps.indexOf(remoteAddress) >= 0) {
            console.log(`ip ${remoteAddress} is blocked by hostrule for ${host}`)
            sendError(res, 403)
            return
        }

        let urlPathname
        try {
            urlPathname = decodeURIComponent(parsedUrl.pathname)
        } catch (e) {
            urlPathname = decodeURIComponentSafe(parsedUrl.pathname)
        }


        if (hostrule.blockUrlPathRegex) {
            const patternFromString = getRegexCached(hostrule.blockUrlPathRegex)

            // test the DECODED pathname: testing the raw one allowed trivial
            // bypasses via percent-encoding (/%61dmin vs ^/admin), because
            // all routing below operates on the decoded urlPathname
            if (patternFromString.test(urlPathname) && (!hostrule.redirects || !hostrule.redirects[urlPathname])) {
                console.log(`url path ${urlPathname} blocked by hostrule regex for ${host}`)
                sendError(res, 403)
                return
            }
        }

        // hostrule.reverseProxy = {ip:'localhost',port:9002,http2:false}
        if (isUrlValidForPorxing(urlPathname, hostrule)) {
            await actAsReverseProxy(req, res, {parsedUrl, hostrule, host})
        } else if (urlPathname.startsWith(`/${config.SERVER_COMMAND_PREFIX}/`)) {
            const context = contextByRequest(req)
            if (context.id && context.role === 'administrator') {
                const command = urlPathname.substring(`/${config.SERVER_COMMAND_PREFIX}/`.length)
                console.log(`client server execute command ${command}`)
                if (command === 'refreshhostrules') {
                    resetHostRules()
                    sendError(res, 200)
                } else if (command === 'asnstats') {
                    res.writeHead(200, {'Content-Type': 'application/json'})
                    res.write(JSON.stringify(getAsnStats({limit: 50}), null, 2))
                    res.end()
                } else if (command === 'asnstatsreset') {
                    resetAsnStats()
                    sendError(res, 200)
                }
            } else {
                sendError(res, 403)
            }

        } else if (urlPathname.startsWith('/graphql') || urlPathname.startsWith('/oauth/') ||
            API_PREFIXES.some(prefix => urlPathname.startsWith('/' + prefix + '/'))) {
            // there is also /graphql/upload
            proxyToApiServer(req, res, {host, path: parsedUrl.path})
        } else {

            if (urlPathname.startsWith('/tokenlink/')) {

                let token = urlPathname.substring(11)
                token = token.substring(0, token.indexOf('/'))
                verifyTokenAndResponse(req, res, token, parsedUrl)

            } else if (urlPathname.startsWith(BACKUP_URL + '/')) {
                const context = contextByRequest(req)
                if (context.id && context.role === 'administrator') {
                    // only allow download if valid jwt token is set
                    const backup_dir = path.join(ROOT_DIR, BACKUP_DIR)
                    // traversal-safe: must stay inside the backup dir
                    const filename = safeJoin(backup_dir, urlPathname.substring(BACKUP_URL.length))

                    if (!filename || !await sendFileFromDir(req, res, {
                        filename: filename,
                        neverCompress: true, headers: {}, parsedUrl
                    })) {
                        sendError(res, 404)
                    }
                } else {
                    sendError(res, 403)
                }
            } else if (urlPathname === '/createheapdump') {
                const context = contextByRequest(req)
                if (context.id && context.role === 'administrator') {

                    const backup_dir = path.join(ROOT_DIR, BACKUP_DIR + '/heapdump/')

                    if (ensureDirectoryExistence(backup_dir, true)) {
                        const filename = Date.now() + '.heapsnapshot'
                        const filepath = path.join(backup_dir, filename)

                        /*heapdump.writeSnapshot(filepath, (e) => {
                            console.log(e)
                        })*/
                        res.writeHead(200, {'Content-Type': 'text/html'})
                        res.write(`<a download href='${BACKUP_URL}/heapdump/${filename}'>${filename}</a>`)
                        res.end()
                    } else {
                        sendError(res, 500, 'cannot create dir')
                    }

                } else {
                    sendError(res, 403)
                }


            } else if (urlPathname.startsWith(UPLOAD_URL + '/')) {
                await resolveUploadedFile(req, res, urlPathname, parsedUrl)
            } else {

                let redirect, redirectStatusCode = 301
                if (hostrule.redirects) {

                    redirect = hostrule.redirects[urlPathname + parsedUrl.search]
                    if (!redirect) {
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
                if (!redirect && hostrule.regexRedirects) {
                    const redirectResponse = regexRedirectUrl(urlPathname + (parsedUrl.search || ''), hostrule.regexRedirects)
                    if (redirectResponse.url) {
                        redirect = redirectResponse.url
                        if (redirectResponse.statusCode) {
                            redirectStatusCode = redirectResponse.statusCode
                        }
                    }
                }
                if (redirect) {

                    redirect = redirect.replace(/%pathname%/g, parsedUrl.pathname || '/').replace(/%search%/g, parsedUrl.search || '')

                    console.log(`Hostrule redirect to ${redirect}`)
                    const agent = req.headers['user-agent']
                    if (!agent || !isLetsEncryptAgent(agent)) {
                        res.writeHead(redirectStatusCode, {'Location': redirect})
                        res.end()
                        return
                    }
                }

                const headers = {...hostrule.headers.common, ...hostrule.headers[urlPathname]}

                if (hostrule.fileMapping && hostrule.fileMapping[urlPathname]) {
                    const mappedFile = path.join(hostrule._basedir, hostrule.fileMapping[urlPathname])
                    //console.log('mapped file: ' + mappedFile)
                    if (await sendFileFromDir(req, res, {filename: mappedFile, headers, parsedUrl})) {
                        return
                    }
                } else if (urlPathname.length > 1 && templateFiles.has(urlPathname)) {
                    // in-memory lookup instead of fs.existsSync on every request
                    sendFileFromTemplateDir(req, res, urlPathname, headers, parsedUrl, host)
                    return
                }

                if (hostrule.webRoot) {
                    // if a webRoot is defined, only this path is checked for matching files
                    const indexFile = hostrule.indexFile || 'index.html'
                    const webRootBase = path.join(WEBROOT_ABSPATH, hostrule.webRoot)
                    const webRootFile = safeJoin(webRootBase, urlPathname !== '/' ? urlPathname : indexFile)

                    if (webRootFile && await sendFileFromDir(req, res, {
                        filename: webRootFile,
                        headers
                    })) {
                        return
                    }
                    sendError(res, 404)
                    return
                } else if (urlPathname !== '/') {

                    // Path resolution cache: skip the sequential stat attempts
                    // across all candidate dirs once we know where (or that
                    // nowhere) a given url resolves. Keyed per host because
                    // hostrule.paths differ between hosts.
                    const cacheKey = host + ':' + urlPathname
                    const cachedPath = pathCacheGet(cacheKey)

                    if (cachedPath) {
                        if (await sendFileFromDir(req, res, {filename: cachedPath, headers, parsedUrl})) {
                            return
                        }
                        // file disappeared since caching - invalidate and fall
                        // through to a fresh scan
                        pathResolveCache.delete(cacheKey)
                    }

                    if (cachedPath !== false) {
                        const pathsToCheck = [...hostrule.paths, STATIC_DIR, WEBROOT_ABSPATH, BUILD_DIR]

                        let found = false
                        for (const curPath of pathsToCheck) {
                            // traversal-safe: candidate must stay inside curPath
                            const candidate = safeJoin(curPath, urlPathname)
                            if (!candidate) {
                                continue
                            }
                            if (await sendFileFromDir(req, res, {
                                filename: candidate,
                                headers,
                                parsedUrl
                            })) {
                                pathCacheSet(cacheKey, candidate)
                                found = true
                                break
                            }
                        }
                        if (found) {
                            return
                        }
                        // remember the miss so repeated 404s don't rescan all dirs
                        pathCacheSet(cacheKey, false)
                    }
                }

                // special url
                const pos = parsedUrl.pathname.indexOf('/' + config.PRETTYURL_SEPERATOR + '/' + config.PRETTYURL_SEPERATOR + '/')
                if (pos >= 0) {
                    const decodedStr = decodeURIComponent(decodeURIComponent(parsedUrl.pathname.substring(pos + 5).split('/')[0]))
                    try {
                        const data = JSON.parse(decodedStr)
                        const screenShotDir = path.join(ABS_UPLOAD_DIR, 'screenshots')

                        if (data.screenshot && ensureDirectoryExistence(screenShotDir, true)) {
                            //{"screenshot":{"url":"https:/stackoverflow.com/questions/4374822/remove-all-special-characters-with-regexp","options":{"height":300}}}

                            const filename = decodedStr.replace(/[^\w]/gi, '') + '.png'

                            const absFilename = path.join(screenShotDir, filename)

                            if (!(await statSafe(absFilename))) {
                                let url = data.screenshot.url

                                if (url.indexOf('/') === 0) {
                                    // own relative path - resolve against this server
                                    url = 'http://127.0.0.1:' + PORT + url
                                } else {
                                    // external url - block internal network targets (SSRF)
                                    let parsedTarget
                                    try {
                                        parsedTarget = new URL(url)
                                    } catch (e) {
                                        sendError(res, 400)
                                        return
                                    }
                                    if (!['http:', 'https:'].includes(parsedTarget.protocol) ||
                                        isPrivateNetworkTarget(parsedTarget.hostname)) {
                                        console.log(`screenshot target blocked: ${url} by ${remoteAddress}`)
                                        sendError(res, 403)
                                        return
                                    }
                                }

                                const cookies = parseCookies(req)
                                const result = await doScreenCapture(url, absFilename, data.screenshot.options, cookies)
                                if (result.statusCode !== 200) {
                                    if (result.statusCode === 302) {
                                        res.writeHead(result.statusCode, {'Location': result.location})
                                        res.end()
                                    } else {
                                        sendError(res, result.statusCode)
                                    }
                                    return
                                }

                            }

                            await resolveUploadedFile(req, res, `${UPLOAD_URL}/screenshots/${filename}`, parsedUrl)


                        } else {
                            sendError(res, 404)
                        }

                    } catch (e) {
                        console.log(decodedStr)


                        console.error(e)
                        sendError(res, 500)
                    }

                } else {


                    const gatewayIp = await getGatewayIp()

                    if (gatewayIp !== remoteAddress && remoteAddress !== '127.0.0.1' && remoteAddress !== '::1') {
                        // second more restrictive check - NOTE: distinct keys
                        // per window, otherwise both configs share one bucket
                        // and double-count each other's requests
                        if (isTemporarilyBlocked({
                                key: 'index1s-' + remoteAddress,
                                requestPerTime: 10,
                                requestTimeInMs: 1000
                            }) ||
                            isTemporarilyBlocked({
                                key: 'index10s-' + remoteAddress,
                                requestPerTime: 100,
                                requestTimeInMs: 10000
                            })) {
                            sendError(res, 429)
                            return
                        }
                    }

                    const ext = path.extname(urlPathname)
                    if (!ext || urlPathname.indexOf('/' + config.PRETTYURL_SEPERATOR + '/') >= 0) {
                        // file extension is not allowed here
                        await sendIndexFile({req, res, remoteAddress, urlPathname, hostrule, host, parsedUrl})
                    } else {
                        sendError(res, 404)
                    }
                }
            }
        }

    } catch (e) {
        console.log(e)
        sendError(res, 500)
    }
})


//
// Listen to the `upgrade` event and proxy the
// WebSocket requests as well.
//
if (USE_HTTPX) {
    const trackRequest = (req) => {
        req.socket._lastUrl = req.url
        req.socket._lastIp = req.socket?.remoteAddress
        req.socket._lastUserAgent = req.headers?.['user-agent']
    }

    const onClientError = (protocol) => (err, socket) => {
        console.log(`${protocol} clientError`, {
            code: err.code,
            message: err.message,
            remoteIp: socket?.remoteAddress || socket?._lastIp,
            requestUrl: socket?._lastUrl || '(unknown)',
            userAgent: socket?._lastUserAgent || '(unknown)'
        })

        if (err.code === 'ECONNRESET' || !socket.writable) {
            return
        }
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    }

    app.http.on('upgrade', proxyWsToApiServer)
    app.https.on('upgrade', proxyWsToApiServer)

    app.http.on('error', (e) => console.log('http error', e))
    app.https.on('error', (e) => console.log('https error', e))

    app.http.on('request', trackRequest)
    app.https.on('request', trackRequest)

    app.http.on('clientError', onClientError('http'))
    app.https.on('clientError', onClientError('https'))
} else {
    app.on('upgrade', proxyWsToApiServer)
}
// Start server
app.listen(PORT, () => console.log(
    `Listening at localhost:${PORT}`
))