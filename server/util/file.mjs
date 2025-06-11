import fs from 'fs'
import {resizeImage} from './resizeImage.mjs'
import MimeType from '../../util/mime.mjs'
import {createSimpleEtag} from './etag.mjs'
import {isFileNotNewer} from '../../util/fileUtil.mjs'
import zlib from 'zlib'
import {extendHeaderWithRange, isMimeTypeStreamable} from './index.mjs'
import {clientAddress} from "../../util/host.mjs";
import http from 'http'
import {PassThrough} from 'stream'
import {transcodeAndStreamVideo, transcodeVideoOptions} from './transcodeVideo.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'
import Cache from '../../util/cache.mjs'
import archiver from 'archiver'
import path from 'path'
import {dbConnection, MONGO_URL} from '../../api/database.mjs'
import {getDynamicConfig} from '../../util/config.mjs'
import {ObjectId} from 'mongodb'
import {getCmsPageQuery} from '../../extensions/cms/util/cmsView.mjs'
import {SESSION_HEADER, AUTH_HEADER} from '../../api/constants/index.mjs'

const config = getDynamicConfig()

const {UPLOAD_DIR} = config
const ROOT_DIR = path.resolve(), SERVER_DIR = path.join(ROOT_DIR, '../server')
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, UPLOAD_DIR)

const LUNUC_SERVER_NODES = process.env.LUNUC_SERVER_NODES || ''

const downloadUrl = ( url ) => {
    return new Promise ( ( resolve ) => {
        const request = http.get( url )
        request.on( 'response', ( response ) => {
            resolve( response )
        })
        request.on( 'error', ( error ) => {
            resolve({error} )
        })
    })
}

export const getFileFromOtherServer = async (urlPath, filename, baseResponse, req) => {

    const remoteAdr = clientAddress(req),
        gatewayIp = await getGatewayIp()

    if(LUNUC_SERVER_NODES){
        const servers = LUNUC_SERVER_NODES.split(',')
        for(const server of servers){
            if(server.indexOf(remoteAdr)<0 && server.indexOf(gatewayIp)<0) {
                const url = server + urlPath
                console.log('load from ' + url + ' - ' + remoteAdr)
                const response = await downloadUrl(url)
                if(!response.error && response.statusCode == 200) {
                    const passStream = new PassThrough()
                    response.pipe(passStream)
                    passStream.pipe(baseResponse)
                    const file = fs.createWriteStream(filename)
                    passStream.pipe(file)
                    return true
                }
            }
        }
    }
    return false
}


export const sendFileFromDir = async (req, res, {send404 = false, filename, headers = {}, parsedUrl, neverCompress=false}) => {

    let statMain
    try {
        statMain = fs.statSync(filename)
    }catch (e){}

    if (statMain && statMain.isFile()) {

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


        const etag = createSimpleEtag({content: filename, stat})
        if (req.headers['if-none-match'] === etag) {
            res.status(304).end()
            return true
        }

        const headersExtended = {
            'Vary': 'Accept-Encoding',
            'Last-Modified': stat.mtime.toUTCString(),
            'Connection': 'Keep-Alive',
            'Cache-Control': 'public, max-age=31536000', /* 604800 (a week) */
            'Content-Length': stat.size,
            'Content-Type': parsedUrl?MimeType.takeOrDetect(modImage.mimeType, parsedUrl):MimeType.detectByFileName(filename),
            'ETag': `"${etag}"`,
            ...headers
        }

        if (transcodeOptions && !transcodeOptions.exists) {
            await transcodeAndStreamVideo({options: transcodeOptions, headers: headersExtended, req, res, filename})
        } else {
            sendFile(req,res,{headers: headersExtended,filename,fileStat:stat,neverCompress,statusCode:200})
        }
        return true
    }else if(send404){
        sendError(res, 404)
    }
    return false
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

        if(!headers['Last-Modified']){
            headers['Last-Modified'] = statsMainFile.mtime.toUTCString()
        }

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
            if(isMimeTypeStreamable(headers['Content-Type'])){

                streamOption = extendHeaderWithRange(headers, req, statsMainFile)
                //delete headers.ETag
                //delete headers['Cache-Control']
                if(streamOption){
                    statusCode = 206
                }
            }

            res.writeHead(statusCode, {
                'Content-Length':statsMainFile.size,
                ...headers})

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


const PRELOAD_DATA_PLACEHOLDER = '<%=preloadData%>';
export const parseAndSendFile = (req, res, {filename, headers, statusCode, parsedUrl}) => {


    let data = Cache.get('IndexFile' + filename)
    if (!data || isFileNotNewer(filename, data)) {
        data = {mtime:new Date()}
        try {
            data.content = fs.readFileSync(filename, 'utf8')
        }catch (err){
            console.error(`parseAndSendFile: ${filename} does not exist`, err)
            sendError(res, 404)
            return
        }
        Cache.set('IndexFile'+filename, data)
    }

    /* there is currently only one use case */
    let finalContent = data.content.replace('<%=encodedUrl%>', encodeURIComponent(parsedUrl.href))

    const preloadPlaceHolderIndex = data.content.indexOf(PRELOAD_DATA_PLACEHOLDER)

    if(preloadPlaceHolderIndex >= 0) {
        // make first graphql request and return result
        const startTime = Date.now(),
            query = getCmsPageQuery({dynamic: false}),
            variables = {
                dynamic: false,
                slug: parsedUrl.pathname.substring(1).split(config.PRETTYURL_SEPERATOR)[0],
                query: parsedUrl.search ? parsedUrl.search.substring(1) : ''
            }

        fetch('http:/localhost:3000/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie,
                [SESSION_HEADER]:req.headers[SESSION_HEADER],
                [AUTH_HEADER]:req.headers[AUTH_HEADER]
            },
            body: JSON.stringify({
                query,
                variables: Object.assign({},variables,{meta: JSON.stringify({referer: req.headers.referer})})
            }),
        }).then(response => response.json()) // Parse JSON response
            .then(result => {
                let additionalContent = `/*time${Date.now()-startTime}ms*/\n`
                if (result?.data?.cmsPage) {
                    console.log('Success:', result);
                    additionalContent+=`
_app_.defaultFetchPolicy = 'cache-first'                    
_app_.onClientReady = (client)=>{
    client.writeQuery({
        query: '${query}',
        variables: ${JSON.stringify(variables)},
        data: ${JSON.stringify(result.data)}
    })
}`

                } else {
                    statusCode = 404
                    additionalContent = `_app_.show404=true`
                }
                finalContent = finalContent.replace(PRELOAD_DATA_PLACEHOLDER,additionalContent)
                compressContentAndSend(req, res, finalContent, statusCode, data, headers)
            })
            .catch(error => {
                console.error('parseAndSendFile Error:', error)
                compressContentAndSend(req, res, finalContent, statusCode, data, headers)
            })
    }else {
        compressContentAndSend(req, res, finalContent, statusCode, data, headers)
    }
}

const compressContentAndSend = (req, res, finalContent, statusCode, data, headers)=>  {
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
        // If gzip is not accepted, send the uncompressed data
        res.writeHead(statusCode, {
            'Last-Modified': data.mtime.toUTCString(),
            'Content-Length': finalContent.length,
            ...headers
        })
        res.write(finalContent)
        res.end()
    }
}


export const zipAndSendMedias = (res, decoded) => {

    dbConnection(MONGO_URL, async (err, db) => {

        if (!db) {
            console.error(err)
            res.status(500).send({error: err.message})
        } else {
            // Set the headers to indicate a file attachment of type zip
            res.setHeader('Content-Disposition', 'attachment; filename=files.zip')
            res.setHeader('Content-Type', 'application/zip')

            // Create a zip archive and pipe it to the response
            const archive = archiver('zip', {zlib: {level: 9}})
            archive.pipe(res)

            const medias = await db.collection('Media').find({ _id: { $in: decoded.mediaIds.map(id=>new ObjectId(id)) } }).toArray()
            // Add files to the archive (can be from disk, buffers, or strings)
            for (const media of medias) {
                archive.file(path.join(ABS_UPLOAD_DIR, media._id.toString()), {name: media.name})
            }

            // Handle errors
            archive.on('error', err => {
                res.status(500).send({error: err.message});
            })

            // Finalize the archive (this sends the zip to the client)
            archive.finalize()
        }
    })
}