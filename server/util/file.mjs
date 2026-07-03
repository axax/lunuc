import fs from 'fs'
import {resizeImage} from './resizeImage.mjs'
import MimeType from '../../util/mime.mjs'
import {createSimpleEtag} from './etag.mjs'
import {isFileNotNewer} from '../../util/fileUtil.mjs'
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

const config = getDynamicConfig()

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

// On-the-fly brotli: quality 5 is the sweet spot (default 11 can take
// hundreds of ms of CPU for large bundles and delays TTFB on cold hits).
// Pre-compress with quality 11 at build time if you want maximum ratio.
const BROTLI_ONTHEFLY_QUALITY = 5

// Only these extensions can possibly be handled by resizeImage / transcodeVideo.
// Early-out for everything else (js, css, fonts, ...) saves work in the hot path.
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic', '.avif', '.tiff', '.bmp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.mpeg', '.mpg', '.ogv'])

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
const streamAndPersist = (response, baseResponse, filename) => {
    const passStream = new PassThrough()
    response.pipe(passStream)
    passStream.pipe(baseResponse)

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
                    streamAndPersist(response, baseResponse, filename)
                    return true
                }
            }
        }
    }

    // backup server
    if(LUNUC_BACKUP_SERVER_URL) {
        const backupUrl = LUNUC_BACKUP_SERVER_URL + filename.substring(13)
        console.log('load from backup server - ' + backupUrl)
        const response = await downloadUrl(backupUrl)
        if (!response.error && response.statusCode == 200) {
            streamAndPersist(response, baseResponse, filename)
            return true
        }
    }

    return false
}


export const sendFileFromDir = async (req, res, {send404 = false, filename, headers = {}, parsedUrl, neverCompress = false}) => {

    let statMain
    try {
        statMain = fs.statSync(filename)
    } catch (e) {}

    if (statMain && statMain.isFile()) {

        const ext = path.extname(filename).toLowerCase()

        // Check if there is a modified image (only for image extensions)
        let modImage = {exists: false}
        if (IMAGE_EXTENSIONS.has(ext)) {
            modImage = await resizeImage(parsedUrl, req, filename)
            if (modImage.exists) {
                filename = modImage.filename
            }
        }

        // Check if there is a modified video (only for video extensions)
        let transcodeOptions = null
        if (VIDEO_EXTENSIONS.has(ext)) {
            transcodeOptions = transcodeVideoOptions(parsedUrl, filename)
            if (transcodeOptions && transcodeOptions.exists) {
                console.log(`stream from modified file ${transcodeOptions.filename}`)
                filename = transcodeOptions.filename
            }
        }

        // Reuse the initial stat unless filename was swapped to a variant
        let stat
        if (modImage.exists || (transcodeOptions && transcodeOptions.exists)) {
            try {
                stat = fs.statSync(filename)
            } catch (e) {
                sendError(res, 404)
                return true
            }
        } else {
            stat = statMain
        }

        const etag = createSimpleEtag({content: filename, stat})
        if (req.headers['if-none-match'] === etag) {
            // native http.ServerResponse - res.status() is Express-only
            res.writeHead(304)
            res.end()
            return true
        }

        const headersExtended = {
            'Vary': 'Accept-Encoding',
            'Last-Modified': stat.mtime.toUTCString(),
            'Cache-Control': 'public, max-age=31536000', /* 604800 (a week) */
            'Content-Length': stat.size,
            'Content-Type': parsedUrl ? MimeType.takeOrDetect(modImage.mimeType, parsedUrl) : MimeType.detectByFileName(filename),
            'ETag': `"${etag}"`,
            ...headers
        }

        // Connection header is forbidden on HTTP/2 (connection-specific headers)
        if (req.httpVersion !== '2.0') {
            headersExtended['Connection'] = 'Keep-Alive'
        }

        if (transcodeOptions && !transcodeOptions.exists) {
            await transcodeAndStreamVideo({options: transcodeOptions, headers: headersExtended, req, res, filename})
        } else {
            sendFile(req, res, {headers: headersExtended, filename, fileStat: stat, neverCompress, statusCode: 200})
        }
        return true
    } else if (send404) {
        sendError(res, 404)
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

export const sendFile = (req, res, {headers, filename, fileStat, neverCompress = false, statusCode = 200}) => {
    let acceptEncoding = req.headers['accept-encoding'] || ''

    if (!neverCompress && !MimeType.inCompressible(headers['Content-Type'])) {
        // TODO make it configurable
        neverCompress = true
    }
    let statsMainFile
    try {
        statsMainFile = fileStat || fs.statSync(filename)

        if (!headers['Last-Modified']) {
            headers['Last-Modified'] = statsMainFile.mtime.toUTCString()
        }

        /**
         * Serves THIS request with fast compression (low latency), and builds
         * the max-quality cached version in the background so all subsequent
         * requests get the optimally compressed file.
         */
        const streamCompressAndCache = (encoding, fileExt) => {
            delete headers['Content-Length']
            res.writeHead(statusCode, {...headers, 'Content-Encoding': encoding})

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

            if (isFileNotNewer(filename + '.br', statsMainFile)) {
                // pre-compressed br version is available - serve it directly
                const statsFile = fs.statSync(filename + '.br')

                res.writeHead(statusCode, {...headers, 'Content-Length': statsFile.size, 'Content-Encoding': 'br'})
                const fileStream = fs.createReadStream(filename + '.br')
                fileStream.on('error', (err) => console.error('sendFile: Stream error:', err))
                fileStream.pipe(res)
            } else {
                streamCompressAndCache('br', '.br')
            }

        } else if (!neverCompress && acceptEncoding.match(/\bgzip\b/)) {

            if (isFileNotNewer(filename + '.gz', statsMainFile)) {
                // pre-compressed gz version is available - serve it directly
                const statsFile = fs.statSync(filename + '.gz')
                res.writeHead(statusCode, {...headers, 'Content-Length': statsFile.size, 'Content-Encoding': 'gzip'})
                const fileStream = fs.createReadStream(filename + '.gz')
                fileStream.on('error', (err) => console.error('sendFile: Stream error:', err))
                fileStream.pipe(res)
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

            const fileStream = fs.createReadStream(filename, streamOption)
            fileStream.on('error', (err) => console.error('sendFile: Stream error:', err))
            fileStream.pipe(res).on('error', (err) => console.error('sendFile: Pipe error:', err))

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
export const parseAndSendFile = (req, res, {filename, headers, statusCode, parsedUrl, remoteAddress, host, hostrule}) => {


    let data = Cache.get('IndexFile' + filename)
    if (!data || isFileNotNewer(filename, data)) {
        data = {mtime: new Date()}
        try {
            data.content = fs.readFileSync(filename, 'utf8')
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
            cookies = parseCookies(req),
            query = getCmsPageQuery({dynamic: false}),
            cleanPathname = parsedUrl.pathname.substring(1).split(`/${config.PRETTYURL_SEPERATOR}/`)[0],
            contextLanguage = Util.urlContext(parsedUrl.pathname)

        let slug = Util.removeTrailingSlash(contextLanguage ? cleanPathname.substring(contextLanguage.length + 1) : cleanPathname)
        if (slug.startsWith('[admin]')) {
            slug = slug.substring(8)
        }

        slug = removePrettyUrlPart(slug)

        if (cookies.auth || req.headers[AUTH_HEADER] || slug.startsWith(config.ADMIN_BASE_URL.slice(1))) {
            // we don't preload data if auth data exists
            finalContent = finalContent.replace(PRELOAD_DATA_PLACEHOLDER, '/*preload disabled*/')
            compressContentAndSend(req, res, finalContent, statusCode, data, headers)
        } else {

            const variables = {
                dynamic: false,
                slug,
                query: parsedUrl.search ? parsedUrl.search.substring(1) : ''
            }
            const clientId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9)

            fetch(`http://localhost:${API_PORT}/graphql`, {
                method: 'POST',
                headers: {
                    'Content-Language': contextLanguage,
                    'Content-Type': 'application/json',
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
                },
                body: JSON.stringify({
                    query,
                    variables: Object.assign({}, variables, {meta: JSON.stringify({referer: req.headers.referer})})
                }),
            }).then(response => response.json()) // Parse JSON response
                .then(result => {
                    let additionalContent = `/*time${Date.now() - startTime}ms*/\n`
                    if (result?.data?.cmsPage) {
                        if (!result.data.cmsPage.fetchPolicy) {
                            result.data.cmsPage.fetchPolicy = 'cache-first'
                        }
                        if (result.data.cmsPage.name) {
                            finalContent = finalContent.replace(PAGE_TITLE_PLACEHOLDER, result.data.cmsPage.name[contextLanguage || config.DEFAULT_LANGUAGE] || '')
                        }

                        additionalContent += `
window.addEventListener('appReady', (event) => {
    _app_.clientId = '${clientId}'
    _app_.defaultFetchPolicy = {['${result.data.cmsPage.slug}']:'${result.data.cmsPage.fetchPolicy || (result.data.cmsPage.subscriptions ? 'cache-first' : 'cache-first')}'}     
    event.detail.client.writeQuery({
        query: '${query}',
        variables: ${JSON.stringify(variables)},
        data: ${JSON.stringify(result.data)}
    })
})`

                        headers['x-no-serviceworker-cache'] = true
                    } else {
                        statusCode = 404
                        additionalContent = `_app_.show404=true`
                    }
                    finalContent = finalContent.replace(PRELOAD_DATA_PLACEHOLDER, additionalContent)
                    compressContentAndSend(req, res, finalContent, statusCode, data, headers)
                })
                .catch(error => {
                    console.error('parseAndSendFile Error:', error)
                    compressContentAndSend(req, res, finalContent, statusCode, data, headers)
                })
        }
    } else {
        compressContentAndSend(req, res, finalContent, statusCode, data, headers)
    }
}

const compressContentAndSend = (req, res, finalContent, statusCode, data, headers) => {
    // Check if the client accepts gzip
    if (req.headers['accept-encoding'] && req.headers['accept-encoding'].includes('gzip')) {
        zlib.gzip(finalContent, (err, compressed) => {
            if (!err) {
                res.writeHead(statusCode, {
                    'Last-Modified': data.mtime.toUTCString(),
                    'Content-Length': compressed.length,
                    ...headers,
                    'Content-Encoding': 'gzip'
                })
                res.write(compressed)
                res.end()
            } else {
                console.error(err)
                res.writeHead(500)
                res.end('Error occurred during compression.')
            }
        })
    } else {
        // If gzip is not accepted, send the uncompressed data.
        // Buffer.byteLength: Content-Length must be bytes, not string length
        // (differs as soon as the HTML contains umlauts or other multi-byte chars)
        res.writeHead(statusCode, {
            'Last-Modified': data.mtime.toUTCString(),
            'Content-Length': Buffer.byteLength(finalContent),
            ...headers
        })
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

    if (!fs.existsSync(filename)) {
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


    if (!fs.existsSync(filename) && (!parsedUrl || parsedUrl.query.remoteserver !== 'false')) {
        if (await getFileFromOtherServer(modUri, baseFilename, res, req)) {
            return
        }
    }

    if (await sendFileFromDir(req, res, {filename, parsedUrl})) {
        // track file access
        Hook.call('UploadedFileAccess', {name: urlWithoutUploadDir, filename})
    } else {
        console.log('not exists: ' + filename)
        sendError(res, 404)
        Hook.call('UploadedFileAccessError', {name: urlWithoutUploadDir, filename})
    }
}