import ImageClassfier from './imageClassifierLambda.mjs'
import ffmpeg from 'fluent-ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import mediaResolver from '../gensrc/resolver.mjs'
import {ObjectId} from 'mongodb'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import config from '../../../gensrc/config.mjs'
import sharp from 'sharp'
import exif from 'exif-reader'

export const removeInvalidProperties = function (obj) {
    for (const i in obj) {
        if(i.indexOf('.')>=0){
            delete obj[i]
        }else {
            const v = obj[i]
            if (v) {
                if (v.constructor === Array) {
                    v.forEach((x) => {
                        if (x.constructor === Object) {
                            removeInvalidProperties(x)
                        }
                    })
                } else if (v.constructor === Object) {
                    removeInvalidProperties(v)
                }
            }
        }
    }
    return null
}


export const createMediaEntry = async ({db, _id, file, data, context}) => {
    // const mimeType = MimeType.detectByFileName(file.name)
    // call image classifier if requested
    if (data.classifyImage) {
        data.meta = JSON.stringify(await ImageClassfier.classifyByUrl(data.url || ('http://www.lunuc.com' + UPLOAD_URL + '/' + _id.toString()) )) //)
    }

    if(file.mimetype) {
        if (file.mimetype.indexOf('audio/') === 0 || file.mimetype.indexOf('video/') === 0) {

            try {
                ffmpeg.setFfprobePath(ffprobeInstaller.path)
                ffmpeg.setFfmpegPath(ffmpegInstaller.path)
                const {meta} = await (new Promise((resolve) => {
                    ffmpeg.ffprobe(file.filepath, function (error, meta) {
                        if (error) {
                            console.warn(error)
                        }
                        resolve({error, meta})
                    })
                }))
                removeInvalidProperties(meta)
                data.info = meta
            } catch (e) {
                console.warn('error in ffprobe', e)
            }
        }else if (file.mimetype.indexOf('image/') === 0){
            // detect image dimension
            try {
                const image = await sharp(file.filepath)
                data.info = await image.metadata()
                delete data.info.icc
                if(data.info.exif){
                    data.info.exif = exif(data.info.exif)
                }
            }catch (e){
                console.log('error getting metadata of image', file.originalFilename, e.message)
            }
        }
    }




    const media = {
        name: file.originalFilename,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream',
        ...data
    }

    if (_id) {
        media._id = _id
    }

    if(!data._id) {
        // save to db
        mediaResolver(db).Mutation.createMedia(media, {context})
    }else{
        // update media
        mediaResolver(db).Mutation.updateMedia(media, {context})
    }
}

export const createMediaEntryFromUrl = ({db,url,data,context}) => {

    const paths = url.split('?')[0].split('#')[0].split('/'),
        fileName = paths[paths.length-1],
        _id = new ObjectId()


    const {UPLOAD_DIR} = config
    const ABS_UPLOAD_DIR = path.join(path.resolve(), UPLOAD_DIR)

    const uploadFile = path.join(ABS_UPLOAD_DIR, _id.toString())
    downloadFile(url,uploadFile).then((res)=>{
        if(res) {
            const stats = fs.statSync(uploadFile)
            createMediaEntry({
                db, file: {
                    originalFilename: fileName,
                    size: stats.size,
                    mimetype: res.headers ? res.headers['content-type'] : ''
                }, data, context, _id
            })
        }
    })

    return {_id}
}

export const downloadFile = async (url, fileName)=>{
    return new Promise(resolve=>{
        if( fs.existsSync(fileName) ){
            resolve(false)
        }else{
            const file = fs.createWriteStream(fileName)
            console.log(`download: ${url}`)
            let httpx = https
            const parsedUrl = new URL(url)
            if (parsedUrl.protocol === 'http:') {
                httpx = http
            }

            const request = httpx.get(url, (res) => {

                if(res.statusCode=== 200){
                    res.pipe(file)

                    file.on('finish', () => {
                        file.close(()=>{
                            resolve(res)
                        })
                    })
                }else{
                    resolve(false)
                }

            }).on('error', (err) => {
                file.close()
                try{
                    fs.unlink(fileName)
                }catch(e){}
                resolve(false)
            })

        }
    })
}


const OBJECT_ID_EXACT = /^[0-9a-f]{24}$/


// the media id a file belongs to is the file name without the 'private' prefix
function mediaKeyFromFile(file) {
    return file.indexOf('private') === 0 ? file.substring(7) : file
}


// collects all files in dir, optionally restricted by media ids and a custom filter
function collectFiles(dir, {ids, filter} = {}) {
    if (!fs.existsSync(dir)) {
        console.log(`[collectFiles] directory does not exist: ${dir}`)
        return []
    }

    return fs.readdirSync(dir).reduce((files, file) => {
        const filePath = path.join(dir, file)

        if (fs.lstatSync(filePath).isDirectory()) {
            return files
        }
        if (filter && !filter(file)) {
            return files
        }
        // if ids are given, only files belonging to one of them are handled
        if (ids && !ids.some(id => file.indexOf(id) >= 0)) {
            return files
        }

        files.push({file, filePath})
        return files
    }, [])
}


// deletes the given files and returns the names of the removed ones
function deleteFiles(files) {
    return files.reduce((removed, {file, filePath}) => {
        console.log('[deleteFiles] delete file ' + filePath)
        fs.unlinkSync(filePath)
        removed.push(file)
        return removed
    }, [])
}


// resolves which media ids still exist, ids = null checks the whole collection
async function getExistingMediaIds(db, ids = null) {
    const found = await db.collection('Media').distinct('_id', ids ? {
        _id: {$in: ids.map(id => new ObjectId(id))}
    } : {})

    return new Set(found.map(id => id.toString()))
}


// removes generated image variants, originals only if the media does not exist anymore
export async function removeMediaVariants(db, {ids, saveMode} = {}) {
    const {UPLOAD_DIR} = config
    const uploadDir = path.join(path.resolve(), UPLOAD_DIR)

    const candidates = collectFiles(uploadDir, {
        ids,
        // in save mode only generated variants are touched, originals are kept
        filter: saveMode ? (file => file.indexOf('@') > 0) : null
    })

    if (!candidates.length) {
        return []
    }

    // a file named exactly like a media id is an original, everything else is generated
    const originalIds = candidates
        .map(({file}) => mediaKeyFromFile(file))
        .filter(key => OBJECT_ID_EXACT.test(key))

    // only originals need a db lookup, generated files are always removed
    const existingIds = originalIds.length
        ? await getExistingMediaIds(db, ids ? originalIds : null)
        : new Set()

    return deleteFiles(candidates.filter(({file}) => !existingIds.has(mediaKeyFromFile(file))))
}


// screenshots are always generated on demand and can be removed unconditionally,
// but for now only when explicit media ids are given
export function removeMediaScreenshots({ids} = {}) {
    if (!ids || !ids.length) {
        return []
    }

    const {UPLOAD_DIR} = config
    const screenShotDir = path.join(path.resolve(), UPLOAD_DIR, 'screenshots')

    return deleteFiles(collectFiles(screenShotDir, {ids}))
}