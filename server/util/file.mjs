import fs from 'fs'
import {resizeImage} from './resizeImage.mjs'
import path from 'path'
import MimeType from '../../util/mime.mjs'
import {createSimpleEtag} from './etag.mjs'
import {isFileNotNewer} from '../../util/fileUtil.mjs'
import zlib from 'zlib'
import {extendHeaderWithRange} from './index.mjs'
import {clientAddress} from "../../util/host.mjs";
import http from "http";
import {PassThrough} from 'stream'

const LUNUC_SERVER_NODES = process.env.LUNUC_SERVER_NODES || ''

export const getFileFromOtherServer = (urlPath, filename, baseResponse, req) => {

    const remoteAdr = clientAddress(req)

    if(LUNUC_SERVER_NODES && LUNUC_SERVER_NODES.indexOf(remoteAdr)<0){
        const url = LUNUC_SERVER_NODES+urlPath
        console.log('load from ' + url + ' - '+remoteAdr)
        http.get(url, function(response) {

            const passStream = new PassThrough()
            response.pipe(passStream)
            passStream.pipe(baseResponse)

            if(response.statusCode == 200) {
                const file = fs.createWriteStream(filename)
                passStream.pipe(file)
            }

        }).on('error', function(err) { // Handle errors
            sendError(baseResponse, 404)
        })
        return true
    }

    return false
}


export const sendFileFromDir = async (req, res, filePath, headers, parsedUrl) => {

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
            'ETag': `"${createSimpleEtag({content: filePath, stats})}"`,
            ...headers
        }
        sendFile(req, res, {headers: headerExtra, filename: modImage.filename})

        return true
    } else if(fs.existsSync(filePath+'.br'))  {
        // file exists as compressed file
       // sendFile(req, res, {filename: filePath})
    }
    return false
}


export const sendFile = (req, res, {headers, filename, statusCode = 200}) => {
    let acceptEncoding = req.headers['accept-encoding'], neverCompress = false

    const isVideo = headers['Content-Type'] && headers['Content-Type'].indexOf('video/') === 0,
        isImage = headers['Content-Type'] && headers['Content-Type'].indexOf('image/') === 0

    if (isImage || isVideo) {
        // TODO make it configurable
        neverCompress = true
    }

    if (!acceptEncoding) {
        acceptEncoding = ''
    }

    let statsMainFile
    try {
        statsMainFile = fs.statSync(filename)

        if (!neverCompress && acceptEncoding.match(/\bbr\b/)) {

            if (isFileNotNewer(filename + '.br', statsMainFile)) {
                // if br version is available send this instead
                const statsFile = fs.statSync(filename + '.br')
                res.writeHead(statusCode, {...headers, 'Content-Length': statsFile.size, 'Content-Encoding': 'br'})
                const fileStream = fs.createReadStream(filename + '.br')
                fileStream.pipe(res)
            } else {
                delete headers['Content-Length']
                res.writeHead(statusCode, {...headers, 'Content-Encoding': 'br'})
                const fileStream = fs.createReadStream(filename)
                const fileStreamCom = fileStream.pipe(zlib.createBrotliCompress())

                fileStreamCom.pipe(res)
                fileStreamCom.pipe(fs.createWriteStream(filename + '.br'))
            }

        } else if (!neverCompress && acceptEncoding.match(/\bgzip\b/)) {

            if (isFileNotNewer(filename + '.gz', statsMainFile)) {
                // if gz version is available send this instead
                const statsFile = fs.statSync(filename + '.gz')
                res.writeHead(statusCode, {...headers, 'Content-Length': statsFile.size, 'Content-Encoding': 'gzip'})
                const fileStream = fs.createReadStream(filename + '.gz')
                fileStream.pipe(res)
            } else {
                delete headers['Content-Length']
                res.writeHead(statusCode, {...headers, 'Content-Encoding': 'gzip'})
                const fileStream = fs.createReadStream(filename)
                const fileStreamCom = fileStream.pipe(zlib.createGzip())
                fileStreamCom.pipe(res)
                fileStreamCom.pipe(fs.createWriteStream(filename + '.gz'))
            }

        } else if (!neverCompress && acceptEncoding.match(/\bdeflate\b/)) {
            res.writeHead(statusCode, {...headers, 'Content-Encoding': 'deflate'})
            const fileStream = fs.createReadStream(filename)
            fileStream.pipe(zlib.createDeflate()).pipe(res)
        } else {

            let streamOption

            if(isVideo){

                streamOption = extendHeaderWithRange(headers, req, statsMainFile)
                delete headers.ETag
                delete headers['Cache-Control']
                if(streamOption){
                    statusCode = 206
                }
            }

            res.writeHead(statusCode, {'Content-Length':statsMainFile.size,...headers})

            const fileStream = fs.createReadStream(filename, streamOption)
            fileStream.pipe(res)
        }
    } catch (err) {
        console.error(filename + ' does not exist', err)
        sendError(res, 404)
    }
}

export const sendError = (res, code) => {
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