// server/util/file.mjs
import fs from 'fs'
import {resizeImage} from './resizeImage.mjs'
import MimeType from '../../util/mime.mjs'
import {createSimpleEtag} from './etag.mjs'
import zlib from 'zlib'
import {extendHeaderWithRange, isMimeTypeStreamable} from './index.mjs'
import {clientAddress} from '../../util/host.mjs'
import http from 'http'
import {PassThrough} from 'stream'
import {transcodeAndStreamVideo, transcodeVideoOptions} from './transcodeVideo.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'
import Cache from '../../util/cache.mjs'
import path from 'path'
import {getDynamicConfig} from '../../util/config.mjs'
import {getCmsPageQuery, removePrettyUrlPart} from '../../extensions/cms/util/cmsView.mjs'
import {
    SESSION_HEADER,
    AUTH_HEADER,
    HOSTRULE_HEADER,
    TRACK_IP_HEADER,
    CLIENT_ID_HEADER, TRACK_REFERER_HEADER, TRACK_IS_BOT_HEADER, TRACK_USER_AGENT_HEADER, TRACK_URL_HEADER, USE_COOKIES
} from '../../api/constants/index.mjs'
import Util from '../../client/util/index.mjs'
import {parseCookies} from '../../api/util/parseCookies.mjs'
import {decodeToken} from '../../api/util/jwt.mjs'
import Hook from '../../util/hook.cjs'
import {SERVER_TIMING_ENABLED, timingEntry, eventLoopEntry} from '../../util/serverTiming.mjs'
import {API_CONNECT_HOST} from '../../util/apiHost.mjs'

// JSON.stringify for embedding inside an inline <script>: the value stays
// identical for the JS parser, but '</script>' / '<!--' in the data can no
// longer terminate the script block, and U+2028/U+2029 are escaped as well
// same check the cmsPage resolver runs first (ClientUtil.extractQueryParams -> decodeURI)
const isDecodableUri = (str) => {
    try {
        decodeURI(str)
        return true
    } catch (e) {
        return false
    }
}

const jsonForScript = (value) => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

const config = getDynamicConfig()

// Loopback requests from the preload to the api. http.request with a keep-alive agent
// instead of fetch: fetch (undici) costs ~1.5ms more per request on loopback.
const apiPreloadAgent = new http.Agent({keepAlive: true, maxSockets: 256, keepAliveMsecs: 10000})

// POST to the api graphql endpoint, resolves {statusCode, headers, text}.
// Header values that are undefined/null are left out (fetch sent them as 'undefined')
const postToApi = ({body, headers, signal}) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const cleanHeaders = {'Content-Length': Buffer.byteLength(payload)}
    for (const key in headers) {
        if (headers[key] !== undefined && headers[key] !== null) {
            cleanHeaders[key] = headers[key]
        }
    }
    const apiReq = http.request({
        hostname: API_CONNECT_HOST,
        port: API_PORT,
        path: '/graphql',
        method: 'POST',
        agent: apiPreloadAgent,
        headers: cleanHeaders,
        signal
    }, (apiRes) => {
        const chunks = []
        apiRes.on('data', chunk => chunks.push(chunk))
        apiRes.on('end', () => resolve({statusCode: apiRes.statusCode, headers: apiRes.headers, text: Buffer.concat(chunks).toString('utf8')}))
        apiRes.on('error', reject)
        apiRes.on('aborted', () => reject(new Error('api response aborted')))
    })
    apiReq.on('error', reject)
    apiReq.end(payload)
})

// same escaping as jsonForScript, but on json text that is embedded unchanged
// ('<' only occurs inside json strings, where \u003c is equivalent)
const RE_LS = new RegExp('\u2028', 'g'), RE_PS = new RegExp('\u2029', 'g')
const jsonTextForScript = (text) => text
    .replace(/</g, '\\u003c')
    .replace(RE_LS, '\\u2028')
    .replace(RE_PS, '\\u2029')

// Cms components at the root of a page template (typically the layout that wraps the whole
// page) are preloaded together with the page and written into the client cache. The Cms
// element loads them with fetchPolicy 'cache-first', so the browser saves a whole GraphQL
// round trip - and the components inside the layout (e.g. a product list) start right away
// instead of after the layout response. LUNUC_PRELOAD_COMPONENTS=false -> old behaviour
const PRELOAD_COMPONENTS_ENABLED = process.env.LUNUC_PRELOAD_COMPONENTS !== 'false'
const MAX_PRELOAD_COMPONENTS = 3
// the html never waits longer than this for a component - a slow one is left out and
// loaded by the browser as before
const PRELOAD_COMPONENTS_TIMEOUT_MS = parseInt(process.env.LUNUC_PRELOAD_COMPONENTS_TIMEOUT_MS) || 300
// host|slug of a page -> slugs of its root components found the last time. With it the
// components are requested in parallel to the page (no extra time to first byte).
// Bounded, the oldest entry is removed first
const PRELOAD_COMPONENTS_MAX_ENTRIES = 2000
const preloadComponentsByPage = new Map()

const rememberPreloadComponents = (key, slugs) => {
    const previous = preloadComponentsByPage.get(key)
    if (previous && previous.join(',') === slugs.join(',')) {
        return
    }
    preloadComponentsByPage.delete(key)
    if (preloadComponentsByPage.size >= PRELOAD_COMPONENTS_MAX_ENTRIES) {
        preloadComponentsByPage.delete(preloadComponentsByPage.keys().next().value)
    }
    preloadComponentsByPage.set(key, slugs)
}

// Components that are preloaded into the html are removed from the `includes` of the page
// (option "include" of a Cms component, extensions/cms/util/cmsIncludes.mjs), otherwise they would be
// in the html twice. A marker without data stays, so the client knows that the component is
// in its cache and does not request it again with the next page (meta.includes in withCms.js)
export const removePreloadedIncludes = (cmsPage, preloadedSlugs) => {
    if (!cmsPage || !cmsPage.includes || preloadedSlugs.length === 0) {
        return
    }
    try {
        const includes = JSON.parse(cmsPage.includes)
        if (!Array.isArray(includes)) {
            return
        }
        let changed = false
        includes.forEach(include => {
            // preloaded components have no props (findPreloadComponents)
            if (include && include.cmsPage && !include.props && preloadedSlugs.indexOf(include.slug) >= 0) {
                include.cmsPage = null
                changed = true
            }
        })
        if (changed) {
            cmsPage.includes = JSON.stringify(includes)
        }
    } catch (e) {
        // includes stay as they are
    }
}

// slugs of the Cms components at the root of a template that are rendered unconditionally
// and request exactly {dynamic: true, slug} - the same variables (= cache key) the client uses
export const findPreloadComponents = (template) => {
    if (!template || template.indexOf('"Cms"') < 0) {
        return []
    }
    let json
    try {
        json = JSON.parse(template)
    } catch (e) {
        return []
    }
    const slugs = []
    const roots = Array.isArray(json) ? json : [json]
    for (const item of roots) {
        if (!item || item.t !== 'Cms' || !item.p ||
            item.$if !== undefined || item.$is !== undefined || item.$ifexist !== undefined ||
            item.$for !== undefined || item.$loop !== undefined || item.$observe?.waitVisible) {
            continue
        }
        const {slug, props, component} = item.p
        if (typeof slug !== 'string' || !slug || slug.includes('${') || slug.startsWith('@') || component) {
            continue
        }
        // props.$ ends up in the variables (props) - only plain components are preloaded
        if (props !== undefined && (props === null || typeof props !== 'object' || props.$ !== undefined)) {
            continue
        }
        if (slugs.indexOf(slug) < 0) {
            slugs.push(slug)
        }
        if (slugs.length >= MAX_PRELOAD_COMPONENTS) {
            break
        }
    }
    return slugs
}

const {UPLOAD_DIR} = config
const ROOT_DIR = path.resolve()
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, UPLOAD_DIR)

const LUNUC_SERVER_NODES = process.env.LUNUC_SERVER_NODES || ''
// Fallback server for uploads that don't exist locally.
// Format: http://host/basepath (filename part gets appended)
const LUNUC_BACKUP_SERVER_URL = process.env.LUNUC_BACKUP_SERVER_URL /* ||
    'http://100.97.178.113/lunucserver/vmi2319914.contaboserver.net/webroot/uploads/'*/

const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)

// Timeout for fetching files from other server nodes.
// Without it a dead node would stall the client for the full TCP timeout (60s+).
const REMOTE_FILE_TIMEOUT_MS = 5000

/**
 * Non-blocking replacement for fs.statSync in try/catch: resolves with the
 * stats or null if the file doesn't exist / isn't accessible. Runs on the
 * libuv threadpool so the event loop keeps serving other requests while
 * the disk is busy (relevant on cold cache / slow storage / high load).
 */
export const statSafe = async (file) => {
    try {
        return await fs.promises.stat(file)
    } catch (e) {
        return null
    }
}

const downloadUrl = (url, timeoutMs = REMOTE_FILE_TIMEOUT_MS) => {
    return new Promise((resolve) => {
        const request = http.get(url, {timeout: timeoutMs})
        request.on('response', (response) => {
            resolve(response)
        })
        request.on('timeout', () => {
            request.destroy()
            resolve({error: new Error(`timeout after ${timeoutMs}ms: ${url}`)})
        })
        request.on('error', (error) => {
            resolve({error})
        })
    })
}

/**
 * Streams a remote response to the client and simultaneously persists it locally.
 * Writes to a temp file first and renames atomically on success, so an aborted
 * transfer never leaves a partial file behind that would later be served as valid.
 */
// HEAD must answer with the headers only. A body stream piped into a HEAD
// response is never drained over HTTP/2 (the stream is already closed after
// the headers) - the pipe stalls forever and leaks the open file descriptor
// and the response. Callers send the identical headers and then end here.
export const isHeadRequest = (req) => req && req.method === 'HEAD'

const streamAndPersist = (response, baseResponse, filename, req) => {
    const passStream = new PassThrough()
    response.pipe(passStream)
    if (isHeadRequest(req)) {
        // no body for HEAD - the file is still persisted locally
        baseResponse.end()
    } else {
        passStream.pipe(baseResponse)
    }

    const tmpFilename = `${filename}.tmp${process.pid}`
    const file = fs.createWriteStream(tmpFilename)
    passStream.pipe(file)

    file.on('finish', () => {
        fs.rename(tmpFilename, filename, err => {
            if (err) {
                fs.unlink(tmpFilename, () => {})
            }
        })
    })
    file.on('error', () => {
        fs.unlink(tmpFilename, () => {})
    })
    response.on('error', () => {
        file.destroy()
        fs.unlink(tmpFilename, () => {})
    })
    response.on('aborted', () => {
        file.destroy()
        fs.unlink(tmpFilename, () => {})
    })
}

export const getFileFromOtherServer = async (urlPath, filename, baseResponse, req) => {

    const remoteAdr = clientAddress(req),
        gatewayIp = await getGatewayIp()

    if (LUNUC_SERVER_NODES) {
        const servers = LUNUC_SERVER_NODES.split(',')
        for (const server of servers) {
            if (server.indexOf(remoteAdr) < 0 && server.indexOf(gatewayIp) < 0) {
                const url = server + urlPath
                console.log('load from ' + url + ' - ' + remoteAdr)
                const response = await downloadUrl(url)
                if (!response.error && response.statusCode == 200) {
                    streamAndPersist(response, baseResponse, filename, req)
                    return true
                }
            }
        }
    }

    // backup server
    if (LUNUC_BACKUP_SERVER_URL) {
        const backupUrl = LUNUC_BACKUP_SERVER_URL + filename.substring(13)
        console.log('load from backup server - ' + backupUrl)
        const response = await downloadUrl(backupUrl)
        if (!response.error && response.statusCode == 200) {
            streamAndPersist(response, baseResponse, filename, req)
            return true
        }
    }

    return false
}


// Server-Timing for static files (diagnostic only). Hooks writeHead once per
// response and appends the timings at the moment the headers are sent, so
// every path (200/304/br/gzip/raw/range) is covered without touching it.
const trackStaticFileTiming = (req, res) => {
    if (!SERVER_TIMING_ENABLED || res._lunucFileTiming || typeof res.writeHead !== 'function') {
        return null
    }
    const t = {start: performance.now(), stat: 0, prep: 0, sendStart: 0}
    res._lunucFileTiming = t
    try {
        const originalWriteHead = res.writeHead
        res.writeHead = function (...args) {
            try {
                // only when headers are passed as object (or not at all) -
                // mixing setHeader with raw header arrays is not allowed
                const last = args[args.length - 1]
                if (!Array.isArray(last) && !this.headersSent) {
                    const now = performance.now()
                    const entries = []
                    if (req._lunucStartTime !== undefined) {
                        entries.push(timingEntry('server-pre', t.start - req._lunucStartTime))
                    }
                    entries.push(timingEntry('file-stat', t.stat))
                    entries.push(timingEntry('file-prep', t.prep))
                    if (t.sendStart) {
                        const enc = last && typeof last === 'object' ? last['Content-Encoding'] : undefined
                        entries.push(timingEntry('file-send', now - t.sendStart, enc || 'raw'))
                    }
                    entries.push(timingEntry('file-total', now - t.start))
                    if (req._lunucStartTime !== undefined) {
                        entries.push(timingEntry('server-total', now - req._lunucStartTime))
                    }
                    const el = eventLoopEntry('server-eventloop')
                    if (el) {
                        entries.push(el)
                    }
                    const current = this.getHeader('Server-Timing')
                    const value = entries.join(', ')
                    this.setHeader('Server-Timing', current ? current + ', ' + value : value)
                }
            } catch (e) {
                // timing must never break a response
            }
            res.writeHead = originalWriteHead
            return originalWriteHead.apply(this, args)
        }
        t.restore = () => {
            res.writeHead = originalWriteHead
            res._lunucFileTiming = undefined
        }
    } catch (e) {
        return null
    }
    return t
}

export const sendFileFromDir = async (req, res, {
    send404 = false,
    filename,
    indexFiles, // e.g. ['index.html', 'index.htm']
    headers = {},
    parsedUrl,
    neverCompress = false,
    cacheControl = 'public, max-age=31536000' /* default: long cache for immutable assets */
}) => {

    const fileTiming = trackStaticFileTiming(req, res)
    let statMain = await statSafe(filename)
    if (fileTiming) {
        fileTiming.stat = performance.now() - fileTiming.start
    }
    let mimeType

    // If the path points to a directory, try each indexFiles candidate in order
    if (statMain && indexFiles && indexFiles.length && statMain.isDirectory()) {
        let resolved = null
        for (const candidate of indexFiles) {
            const indexPath = path.join(filename, candidate)
            const indexStat = await statSafe(indexPath)
            if (indexStat && indexStat.isFile()) {
                resolved = {filename: indexPath, stat: indexStat}
                break
            }
        }
        if (resolved) {
            filename = resolved.filename
            statMain = resolved.stat
            mimeType = 'text/html'
        } else {
            statMain = null // no matching index file -> fall through to 404 handling
        }
    }

    if (statMain && statMain.isFile()) {

        // Check if there is a modified image
        let modImage = await resizeImage(parsedUrl, req, filename)
        if (modImage.exists) {
            filename = modImage.filename
        }

        // Check if there is a modified video
        let transcodeOptions = transcodeVideoOptions(parsedUrl, filename)
        if (transcodeOptions && transcodeOptions.exists) {
            console.log(`stream from modified file ${transcodeOptions.filename}`)
            filename = transcodeOptions.filename
        }

        // Reuse the initial stat unless filename was swapped to a variant
        let stat
        if (modImage.exists || (transcodeOptions && transcodeOptions.exists)) {
            stat = await statSafe(filename)
            if (!stat) {
                sendError(res, 404)
                return true
            }
        } else {
            stat = statMain
        }

        // Quote the etag once and reuse it everywhere. The browser echoes the
        // etag back exactly as sent (including quotes) in the If-None-Match header,
        // so the comparison must be done against the quoted value.
        const etag = `"${createSimpleEtag({content: filename, stats: stat})}"`
        if (fileTiming) {
            fileTiming.prep = performance.now() - fileTiming.start - fileTiming.stat
        }

        if (req.headers['if-none-match'] === etag) {
            // native http.ServerResponse - res.status() is Express-only.
            // Re-send validators so the cached entry stays fresh.
            res.writeHead(304, {
                'ETag': etag,
                'Cache-Control': cacheControl,
                'Last-Modified': stat.mtime.toUTCString()
            })
            res.end()
            return true
        }
        if(!mimeType){
            mimeType = parsedUrl ? MimeType.takeOrDetect(modImage.mimeType, parsedUrl) : MimeType.detectByFileName(filename)
        }

        const headersExtended = {
            'Vary': 'Accept-Encoding',
            'Last-Modified': stat.mtime.toUTCString(),
            'Cache-Control': cacheControl,
            'Content-Length': stat.size,
            'Content-Type': mimeType,
            'ETag': etag,
            ...headers
        }

        // Connection header is forbidden on HTTP/2 (connection-specific headers)
        if (req.httpVersion !== '2.0') {
            headersExtended['Connection'] = 'Keep-Alive'
        }

        if (fileTiming) {
            fileTiming.sendStart = performance.now()
        }
        if (transcodeOptions && !transcodeOptions.exists) {
            await transcodeAndStreamVideo({options: transcodeOptions, headers: headersExtended, req, res, filename})
        } else {
            await sendFile(req, res, {headers: headersExtended, filename, fileStat: stat, neverCompress, statusCode: 200})
        }
        return true
    } else if (send404) {
        sendError(res, 404)
        return false
    }
    // nothing sent - remove the timing hook so a fallback response of the
    // caller is not tagged with file timings
    if (fileTiming && fileTiming.restore) {
        fileTiming.restore()
    }
    return false
}


// module level - prevents parallel requests from starting the expensive
// Q11 cache build twice for the same file
const inFlightCompressions = new Set()

const FAST_BROTLI_QUALITY = 4
const CACHE_BROTLI_QUALITY = 11

const brotliOptions = (quality, size) => {
    const params = {
        [zlib.constants.BROTLI_PARAM_QUALITY]: quality
    }
    // SIZE_HINT must be a number - guard against undefined stat
    if (typeof size === 'number' && size > 0) {
        params[zlib.constants.BROTLI_PARAM_SIZE_HINT] = size
    }
    return {params}
}

export const sendFile = async (req, res, {headers, filename, fileStat, neverCompress = false, statusCode = 200}) => {
    let acceptEncoding = req.headers['accept-encoding'] || ''

    if (!neverCompress && !MimeType.inCompressible(headers['Content-Type'])) {
        // TODO make it configurable
        neverCompress = true
    }
    try {
        const statsMainFile = fileStat || await statSafe(filename)
        if (!statsMainFile) {
            console.error('sendFile: file not found ' + filename)
            sendError(res, 404)
            return
        }

        if (!headers['Last-Modified']) {
            headers['Last-Modified'] = statsMainFile.mtime.toUTCString()
        }

        /**
         * returns the stats of the compressed sibling if it exists and is at
         * least as new as the main file (i.e. the cache is still valid),
         * otherwise null. One stat call instead of two, non-blocking.
         */
        const statCompressedIfValid = async (compressedFile) => {
            const s = await statSafe(compressedFile)
            if (s && s.mtime >= statsMainFile.mtime) {
                return s
            }
            return null
        }

        /**
         * Serves THIS request with fast compression (low latency), and builds
         * the max-quality cached version in the background so all subsequent
         * requests get the optimally compressed file.
         */
        const streamCompressAndCache = (encoding, fileExt) => {
            delete headers['Content-Length']
            res.writeHead(statusCode, {...headers, 'Content-Encoding': encoding})

            if (isHeadRequest(req)) {
                res.end()
            } else {
                // 1. fast compression for the waiting client
                const fastCompressor = encoding === 'br'
                    ? zlib.createBrotliCompress(brotliOptions(FAST_BROTLI_QUALITY, statsMainFile.size))
                    : zlib.createGzip({level: 6})

                const fileStream = fs.createReadStream(filename)
                fileStream.pipe(fastCompressor).pipe(res)
                fileStream.on('error', (err) => {
                    console.error('sendFile: read error', filename, err)
                    res.destroy()
                })
            }

            // 2. max-quality cache build in the background (nobody waits for it)
            const cacheKey = filename + fileExt
            if (inFlightCompressions.has(cacheKey)) {
                return
            }
            inFlightCompressions.add(cacheKey)

            const tmpFile = `${cacheKey}.tmp${process.pid}`
            const slowCompressor = encoding === 'br'
                ? zlib.createBrotliCompress(brotliOptions(CACHE_BROTLI_QUALITY, statsMainFile.size))
                : zlib.createGzip({level: 9})

            const cacheRead = fs.createReadStream(filename)
            const writeStream = fs.createWriteStream(tmpFile)
            cacheRead.pipe(slowCompressor).pipe(writeStream)

            writeStream.on('finish', () => {
                // atomic rename - concurrent readers never see a partial file
                fs.rename(tmpFile, cacheKey, err => {
                    if (err) {
                        fs.unlink(tmpFile, () => {})
                    }
                    inFlightCompressions.delete(cacheKey)
                })
            })
            const cleanup = (err) => {
                if (err) {
                    console.error('sendFile: cache build error', cacheKey, err)
                }
                fs.unlink(tmpFile, () => {})
                inFlightCompressions.delete(cacheKey)
            }
            writeStream.on('error', cleanup)
            cacheRead.on('error', cleanup)
        }

        if (!neverCompress && acceptEncoding.match(/\bbr\b/)) {

            const brStats = await statCompressedIfValid(filename + '.br')
            if (brStats) {
                // pre-compressed br version is available - serve it directly
                res.writeHead(statusCode, {...headers, 'Content-Length': brStats.size, 'Content-Encoding': 'br'})
                if (isHeadRequest(req)) {
                    res.end()
                } else {
                    const fileStream = fs.createReadStream(filename + '.br')
                    fileStream.on('error', (err) => console.error('sendFile: Stream error:', err))
                    fileStream.pipe(res)
                }
            } else {
                streamCompressAndCache('br', '.br')
            }

        } else if (!neverCompress && acceptEncoding.match(/\bgzip\b/)) {

            const gzStats = await statCompressedIfValid(filename + '.gz')
            if (gzStats) {
                // pre-compressed gz version is available - serve it directly
                res.writeHead(statusCode, {...headers, 'Content-Length': gzStats.size, 'Content-Encoding': 'gzip'})
                if (isHeadRequest(req)) {
                    res.end()
                } else {
                    const fileStream = fs.createReadStream(filename + '.gz')
                    fileStream.on('error', (err) => console.error('sendFile: Stream error:', err))
                    fileStream.pipe(res)
                }
            } else {
                streamCompressAndCache('gzip', '.gz')
            }

        } else {
            // note: deflate branch removed intentionally - every client that
            // supports deflate also supports gzip

            let streamOption
            if (isMimeTypeStreamable(headers['Content-Type'])) {

                streamOption = extendHeaderWithRange(headers, req, statsMainFile)
                //delete headers.ETag
                //delete headers['Cache-Control']
                if (streamOption) {
                    statusCode = 206
                }
            }

            res.writeHead(statusCode, {
                'Content-Length': statsMainFile.size,
                ...headers
            })

            if (isHeadRequest(req)) {
                res.end()
            } else {
                const fileStream = fs.createReadStream(filename, streamOption)
                fileStream.on('error', (err) => console.error('sendFile: Stream error:', err))
                fileStream.pipe(res).on('error', (err) => console.error('sendFile: Pipe error:', err))
            }

        }
    } catch (err) {
        // note: this catches more than missing files (e.g. zlib option errors),
        // so log the actual error instead of claiming the file doesn't exist
        console.error('sendFile: failed for ' + filename, err)
        sendError(res, 404)
    }
}

export const sendError = (res, code, msg = '') => {
    if (!msg) {
        if (code === 404) {
            msg = 'Not Found'
        } else if (code === 403) {
            msg = 'Not Allowed'
        } else if (code === 429) {
            msg = 'Too Many Requests. Please try again later.'
        }
    }

    try {
        res.writeHead(code, {'Content-Type': 'text/plain'})
        res.write(`${code} ${msg}\n`)
        res.end()
    } catch (e) {
        console.error(`Error sending error: ${e.message}`)
    }
}


const PRELOAD_DATA_PLACEHOLDER = '<%=preloadData%>'
const APP_DATA_PLACEHOLDER = '<%=appData%>'
const HEAD_DATA_PLACEHOLDER = '<%=appHead%>'
const PAGE_TITLE_PLACEHOLDER = '<%=pageTitle%>'
export const parseAndSendFile = async (req, res, {filename, headers, statusCode, parsedUrl, remoteAddress, host, hostrule, isBot}) => {


    let data = Cache.get('IndexFile' + filename)

    // reload the template when there is no cache entry yet or the file on
    // disk has been modified after the cache entry was created
    let needsReload = !data
    if (data) {
        const currentStat = await statSafe(filename)
        if (currentStat && currentStat.mtime.getTime() > data.mtime.getTime()) {
            needsReload = true
        }
    }

    if (needsReload) {
        data = {mtime: new Date()}
        try {
            data.content = await fs.promises.readFile(filename, 'utf8')
        } catch (err) {
            console.error(`parseAndSendFile: ${filename} does not exist`, err)
            sendError(res, 404)
            return
        }
        Cache.set('IndexFile' + filename, data)
    }

    /*

        Add meta data to the html head with the placeholder HEAD_DATA_PLACEHOLDER:
        <meta name="theme-color" content="${APP_COLOR}">
        <meta name="author" content="lunuc.com">
    */
    let finalContent = data.content.replace('<%=encodedUrl%>', encodeURIComponent(parsedUrl.href)).replace(HEAD_DATA_PLACEHOLDER, hostrule?.htmlHead || '')

    if (data.content.indexOf(APP_DATA_PLACEHOLDER) >= 0) {
        const appData = `_app_ = {redirect404:'/404',start:new Date(),detectLang:${(hostrule?.detectLang !== false)},defaultLang:'${hostrule?.defaultLanguage || config.DEFAULT_LANGUAGE}',languages:['${(hostrule?.languages || config.LANGUAGES).join("','")}'],slugContext:'${hostrule?.slugContext || ''}',login:{hideDomain:${(hostrule?.hideDomain === true)}, defaultDomain:'${(hostrule?.defaultDomain || '')}'}}`
        finalContent = finalContent.replace(APP_DATA_PLACEHOLDER, appData)
    }
    const preloadPlaceHolderIndex = finalContent.indexOf(PRELOAD_DATA_PLACEHOLDER)

    if (preloadPlaceHolderIndex >= 0) {
        // make first graphql request and return result
        const startTime = Date.now(),
            preloadStart = performance.now(),
            cookies = parseCookies(req),
            query = getCmsPageQuery({dynamic: false}),
            cleanPathname = parsedUrl.pathname.substring(1).split(`/${config.PRETTYURL_SEPERATOR}/`)[0],
            contextLanguage = Util.urlContext(parsedUrl.pathname)

        let slug = Util.removeTrailingSlash(contextLanguage ? cleanPathname.substring(contextLanguage.length + 1) : cleanPathname)
        if (slug.startsWith('[admin]')) {
            slug = slug.substring(8)
        }

        slug = removePrettyUrlPart(slug)

        const preloadQuery = parsedUrl.search ? parsedUrl.search.substring(1) : ''

        if (cookies.auth || req.headers[AUTH_HEADER] || slug.startsWith(config.ADMIN_BASE_URL.slice(1))) {
            // we don't preload data if auth data exists
            finalContent = finalContent.replace(PRELOAD_DATA_PLACEHOLDER, '/*preload disabled*/')
            compressContentAndSend(req, res, finalContent, statusCode, data, headers)
        } else if (!isDecodableUri(preloadQuery)) {
            // malformed percent-encoding (scanners, e.g. "?%ADd+allow_url_include..."):
            // the cmsPage resolver would throw "URI malformed" -> no cmsPage -> 404 page.
            // same response as before, but without the api roundtrip and the error log
            finalContent = finalContent.replace(PRELOAD_DATA_PLACEHOLDER, () => '_app_.show404=true')
            compressContentAndSend(req, res, finalContent, 404, data, headers)
        } else {

            const variables = {
                dynamic: false,
                slug,
                query: preloadQuery
            }
            const clientId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
            const timing = {}

            // IP instead of 'localhost': see util/apiHost.mjs
            const apiFetch = (body, signal) => postToApi({
                body,
                signal,
                headers: {
                    'Content-Language': contextLanguage,
                    'Content-Type': 'application/json',
                    // loopback request: compressing in the api and decompressing
                    // here again is pure overhead - ask for the plain response
                    'Accept-Encoding': 'identity',
                    'User-Agent': req.headers['user-agent'],
                    [TRACK_IP_HEADER]: req.headers[TRACK_IP_HEADER] || remoteAddress,
                    [TRACK_URL_HEADER]: req.headers[TRACK_URL_HEADER] || req.url,
                    [TRACK_REFERER_HEADER]: req.headers[TRACK_REFERER_HEADER] || '',
                    [TRACK_IS_BOT_HEADER]: req.headers[TRACK_IS_BOT_HEADER] || '',
                    [TRACK_USER_AGENT_HEADER]: req.headers[TRACK_USER_AGENT_HEADER] || '',
                    [CLIENT_ID_HEADER]: clientId,
                    [HOSTRULE_HEADER]: req.headers[HOSTRULE_HEADER] || host,
                    [SESSION_HEADER]: req.headers[SESSION_HEADER] || '',
                    /* cookies and auth_header not needed at the moment*/
                    'Cookie': req.headers.cookie,
                    [AUTH_HEADER]: req.headers[AUTH_HEADER]
                }
            })

            // root components of the page (e.g. the layout), see findPreloadComponents
            // not for bots: many of them don't run javascript and would never load the components
            const preloadComponents = PRELOAD_COMPONENTS_ENABLED && !isBot
            const componentQuery = getCmsPageQuery({dynamic: true}),
                componentPageKey = (req.headers[HOSTRULE_HEADER] || host) + '|' + slug,
                componentFetches = {}
            const fetchComponent = (componentSlug) => {
                if (!componentFetches[componentSlug]) {
                    componentFetches[componentSlug] = apiFetch({
                        query: componentQuery,
                        variables: {dynamic: true, slug: componentSlug}
                    }, AbortSignal.timeout(PRELOAD_COMPONENTS_TIMEOUT_MS)).then(response => {
                        // embedded as it is (no parse + stringify): only a plain result without
                        // errors is used - graphql puts "errors" before "data"
                        if (response.statusCode === 200 && response.text.startsWith('{"data":{"cmsPage":{')) {
                            return response.text
                        }
                        return null
                    }).catch(error => {
                        // timeout or error: the browser loads the component itself
                        console.warn(`preload component ${componentSlug} skipped: ${error.message}`)
                        return null
                    })
                }
                return componentFetches[componentSlug]
            }
            if (preloadComponents) {
                // known from the last request of this page -> in parallel to the page itself
                const knownComponents = preloadComponentsByPage.get(componentPageKey)
                if (knownComponents) {
                    knownComponents.forEach(fetchComponent)
                }
            }

            apiFetch({
                query,
                variables: Object.assign({}, variables, {meta: JSON.stringify({referer: req.headers.referer})})
            }).then(response => {
                // pass the api timings through to the browser (diagnostic only)
                timing.api = response.headers['server-timing']
                return JSON.parse(response.text)
            })
                .then(async result => {
                    let componentsContent = ''
                    if (preloadComponents && result?.data?.cmsPage) {
                        try {
                            const componentSlugs = findPreloadComponents(result.data.cmsPage.template)
                            rememberPreloadComponents(componentPageKey, componentSlugs)
                            const componentResults = await Promise.all(componentSlugs.map(fetchComponent))
                            removePreloadedIncludes(result.data.cmsPage, componentSlugs.filter((slug, index) => !!componentResults[index]))
                            componentResults.forEach((componentText, index) => {
                                if (componentText) {
                                    // same variables as the client (getGqlVariables) -> same cache key
                                    componentsContent += `
    event.detail.client.writeQuery({
        query: '${componentQuery}',
        variables: ${jsonForScript({dynamic: true, slug: componentSlugs[index]})},
        data: (${jsonTextForScript(componentText)}).data
    })`
                                }
                            })
                        } catch (error) {
                            console.warn('preload components failed', error)
                            componentsContent = ''
                        }
                    }
                    timing.preload = performance.now() - preloadStart
                    let additionalContent = `/*time${Date.now() - startTime}ms*/\n`
                    if (result?.data?.cmsPage) {
                        if (!result.data.cmsPage.fetchPolicy) {
                            result.data.cmsPage.fetchPolicy = 'cache-first'
                        }
                        if (result.data.cmsPage.name) {
                            // replacer function: a '$&', '$$' or "$'" in the title must be inserted literally
                            const pageTitle = result.data.cmsPage.name[contextLanguage || config.DEFAULT_LANGUAGE] || ''
                            finalContent = finalContent.replace(PAGE_TITLE_PLACEHOLDER, () => pageTitle)
                        }

                        additionalContent += `
window.addEventListener('appReady', (event) => {
    _app_.clientId = '${clientId}'
    _app_.defaultFetchPolicy = {['${result.data.cmsPage.slug}']:'${result.data.cmsPage.fetchPolicy || (result.data.cmsPage.subscriptions ? 'cache-first' : 'cache-first')}'}     
    event.detail.client.writeQuery({
        query: '${query}',
        variables: ${jsonForScript(variables)},
        data: ${jsonForScript(result.data)}
    })${componentsContent}
})`

                        headers['x-no-serviceworker-cache'] = true
                    } else {
                        statusCode = 404
                        additionalContent = `_app_.show404=true`
                    }
                    // replacer function: '$' patterns in the data must be inserted literally
                    finalContent = finalContent.replace(PRELOAD_DATA_PLACEHOLDER, () => additionalContent)
                    compressContentAndSend(req, res, finalContent, statusCode, data, headers, timing)
                })
                .catch(error => {
                    console.error('parseAndSendFile Error:', error)
                    if (timing.preload === undefined) {
                        timing.preload = performance.now() - preloadStart
                    }
                    compressContentAndSend(req, res, finalContent, statusCode, data, headers, timing)
                })
        }
    } else {
        compressContentAndSend(req, res, finalContent, statusCode, data, headers)
    }
}

// Server-Timing header value for the index response (diagnostic only)
const buildIndexServerTiming = (req, timing, compressMs, compressName = 'gzip') => {
    const entries = []
    if (timing && timing.api) {
        entries.push(timing.api)
    }
    if (timing && timing.preload !== undefined) {
        entries.push(timingEntry('preload', timing.preload))
    }
    if (compressMs !== undefined) {
        entries.push(timingEntry(compressName, compressMs))
    }
    if (req._lunucStartTime !== undefined) {
        entries.push(timingEntry('server-total', performance.now() - req._lunucStartTime))
    }
    const el = eventLoopEntry('server-eventloop')
    if (el) {
        entries.push(el)
    }
    return entries.length ? entries.join(', ') : undefined
}

// level 4: roughly twice as fast as the default (6) at only a few percent
// larger output - same trade-off as the api compression (api/server.mjs)
const INDEX_GZIP_OPTIONS = {level: 4}

// brotli quality 4: about the same cpu time as gzip level 4, but a clearly
// smaller html (preload data included). LUNUC_INDEX_BROTLI=false -> gzip only (old behaviour)
const INDEX_BROTLI_ENABLED = process.env.LUNUC_INDEX_BROTLI !== 'false'
const INDEX_BROTLI_QUALITY = 4

// the response differs by Accept-Encoding - tell shared caches (Cache-Control is public).
// a Vary set by the hostrule headers is kept as it is
const withVary = (headers) => {
    for (const key in headers) {
        if (key.toLowerCase() === 'vary') {
            return headers
        }
    }
    return {...headers, 'Vary': 'Accept-Encoding'}
}

const compressContentAndSend = (req, res, finalContent, statusCode, data, headers, timing) => {
    const acceptEncoding = req.headers['accept-encoding']
    // same detection as sendFile for br, unchanged check for gzip
    const encoding = acceptEncoding
        ? (INDEX_BROTLI_ENABLED && /\bbr\b/.test(acceptEncoding) ? 'br' : (acceptEncoding.includes('gzip') ? 'gzip' : null))
        : null

    if (encoding) {
        const compressStart = performance.now()
        const done = (err, compressed) => {
            if (!err) {
                const timingValue = SERVER_TIMING_ENABLED ? buildIndexServerTiming(req, timing, performance.now() - compressStart, encoding) : undefined
                const timingHeader = timingValue ? {'Server-Timing': timingValue} : null
                res.writeHead(statusCode, withVary({
                    'Last-Modified': data.mtime.toUTCString(),
                    'Content-Length': compressed.length,
                    ...timingHeader,
                    ...headers,
                    'Content-Encoding': encoding
                }))
                res.write(compressed)
                res.end()
            } else {
                console.error(err)
                res.writeHead(500)
                res.end('Error occurred during compression.')
            }
        }
        if (encoding === 'br') {
            const input = Buffer.from(finalContent)
            zlib.brotliCompress(input, {
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: INDEX_BROTLI_QUALITY,
                    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
                    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: input.length
                }
            }, done)
        } else {
            zlib.gzip(finalContent, INDEX_GZIP_OPTIONS, done)
        }
    } else {
        // If compression is not accepted, send the uncompressed data.
        // Buffer.byteLength: Content-Length must be bytes, not string length
        // (differs as soon as the HTML contains umlauts or other multi-byte chars)
        const timingValue = SERVER_TIMING_ENABLED ? buildIndexServerTiming(req, timing) : undefined
        const timingHeader = timingValue ? {'Server-Timing': timingValue} : null
        res.writeHead(statusCode, withVary({
            'Last-Modified': data.mtime.toUTCString(),
            'Content-Length': Buffer.byteLength(finalContent),
            ...timingHeader,
            ...headers
        }))
        res.write(finalContent)
        res.end()
    }
}


export const resolveUploadedFile = async (req, res, uri, parsedUrl) => {

    // remove pretty url part
    const pos = uri.indexOf('/' + config.PRETTYURL_SEPERATOR + '/')
    let modUri
    if (pos >= 0) {
        modUri = uri.substring(0, pos)
    } else {
        modUri = uri
    }

    const urlWithoutUploadDir = modUri.substring(config.UPLOAD_URL.length + 1)

    // resolve and verify the path stays inside the upload dir
    // (prevents path traversal like /uploads/..%2F..%2Fserver%2Fkey.pem)
    const baseFilename = path.resolve(ABS_UPLOAD_DIR, '.' + path.sep + urlWithoutUploadDir)
    if (!baseFilename.startsWith(ABS_UPLOAD_DIR + path.sep)) {
        sendError(res, 404)
        return
    }

    // private uploads are only accessible via the hook check below
    if (baseFilename.startsWith(path.join(ABS_UPLOAD_DIR, 'private'))) {
        sendError(res, 404)
        return
    }

    let filename = baseFilename

    if (!(await statSafe(filename))) {
        // check for private upload
        let context
        if (USE_COOKIES) {
            const cookies = parseCookies(req)
            context = decodeToken(cookies.auth)
            if (context) {
                context.session = cookies.session
            }
        } else {
            //context = decodeToken(payload.auth)
            //context.session = payload.session
        }
        if (context && context.role) {
            if (Hook.hooks['UploadedFilePrivateAccess']) {
                for (let i = 0; i < Hook.hooks['UploadedFilePrivateAccess'].length; ++i) {
                    if (await Hook.hooks['UploadedFilePrivateAccess'][i].callback({name: urlWithoutUploadDir, context})) {
                        filename = path.join(ABS_UPLOAD_DIR, 'private' + urlWithoutUploadDir)
                        break
                    }
                }
            }
        }
    }


    if (!(await statSafe(filename)) && (!parsedUrl || parsedUrl.query.remoteserver !== 'false')) {
        if (await getFileFromOtherServer(modUri, baseFilename, res, req)) {
            return
        }
    }

    if (await sendFileFromDir(req, res, {filename, parsedUrl, cacheControl: 'public, max-age=60, must-revalidate'})) {
        // track file access
        Hook.call('UploadedFileAccess', {name: urlWithoutUploadDir, filename})
    } else {
        console.log('not exists: ' + filename)
        sendError(res, 404)
        Hook.call('UploadedFileAccessError', {name: urlWithoutUploadDir, filename})
    }
}