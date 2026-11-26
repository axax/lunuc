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
import {isMediaPrivate} from '../../../util/mediaFile.mjs'

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

    // returned (awaitable): the entry exists when the promise resolves
    if(!data._id) {
        // save to db
        return mediaResolver(db).Mutation.createMedia(media, {context})
    }else{
        // update media
        return mediaResolver(db).Mutation.updateMedia(media, {context})
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

// isMediaPrivate: shared with the web server (util/mediaFile.mjs)
export {isMediaPrivate}

const existsAsync = (file) => fs.promises.access(file).then(() => true, () => false)

// Generated files (image variants "<prefix>@...", video frames "<prefix>-...", compressed copies
// "<prefix>.br/.gz") of renamed originals are removed in one batch: one readdir of the upload dir
// for all media changed within a second (e.g. a bulk edit of many media), the originals are kept
const GENERATED_FILE = /^((?:private)?[0-9a-f]{24})./
const generatedFilesToRemove = new Set()
let removeGeneratedFilesTimeout

function removeGeneratedFiles(uploadDir, prefix) {
    generatedFilesToRemove.add(prefix)
    clearTimeout(removeGeneratedFilesTimeout)
    removeGeneratedFilesTimeout = setTimeout(async () => {
        const prefixes = new Set(generatedFilesToRemove)
        generatedFilesToRemove.clear()
        try {
            const files = await fs.promises.readdir(uploadDir)
            await Promise.all(files.map(file => {
                const match = GENERATED_FILE.exec(file)
                if (match && prefixes.has(match[1])) {
                    console.log('[removeGeneratedFiles] delete file ' + file)
                    // may already be removed by removeMediaVariants
                    return fs.promises.unlink(path.join(uploadDir, file)).catch(() => {})
                }
            }))
        } catch (e) {
            console.error('removeGeneratedFiles', e)
        }
    }, 1000)
}

// Makes sure the file of a media matches its private flag:
// private  -> the original lives as "private<id>" and is only served after the access check,
//             generated public copies are removed
// public   -> the original lives as "<id>"
export async function syncMediaFileVisibility(id, isPrivate) {
    if (!id || !ObjectId.isValid(id)) {
        return
    }
    id = id.toString()

    const uploadDir = path.join(path.resolve(), config.UPLOAD_DIR)
    const publicFile = path.join(uploadDir, id)
    const privateFile = path.join(uploadDir, 'private' + id)

    if (isMediaPrivate(isPrivate)) {
        if (await existsAsync(publicFile)) {
            // a public file always wins over an older private one (e.g. a replaced file)
            await fs.promises.rename(publicFile, privateFile)
            removeGeneratedFiles(uploadDir, id)
        }
    } else if (await existsAsync(privateFile) && !await existsAsync(publicFile)) {
        await fs.promises.rename(privateFile, publicFile)
        removeGeneratedFiles(uploadDir, 'private' + id)
    }
}


// private media whose original is still stored under the public name (before the fix an update
// without the field "private" moved it back) are moved to private<id> - part of the media cleanup.
// One query for the ids and one stat per private media, returns the number of moved files
export async function syncAllPrivateMediaFiles(db, {ids} = {}) {
    const uploadDir = path.join(path.resolve(), config.UPLOAD_DIR)
    const match = {private: {$in: [true, 'true']}}
    if (ids) {
        match._id = {$in: ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id))}
    }
    const privateIds = await db.collection('Media').distinct('_id', match)
    let moved = 0
    for (const id of privateIds) {
        if (await existsAsync(path.join(uploadDir, id.toString()))) {
            await syncMediaFileVisibility(id, true)
            moved++
        }
    }
    if (moved) {
        console.log(`[syncAllPrivateMediaFiles] ${moved} private media files moved`)
    }
    return moved
}


// ─── trash ────────────────────────────────────────────────────────────────────
// A deleted media keeps its original file for MEDIA_TRASH_DAYS in uploads/.trash (same file name,
// "<id>" or "private<id>"), so it can be restored together with the entry from the History.
// The trash is never served (server/util/file.mjs blocks paths starting with a dot).
export const MEDIA_TRASH_DIR = '.trash'
export const MEDIA_TRASH_DAYS = 30

const uploadDirPath = () => path.join(path.resolve(), config.UPLOAD_DIR)
const trashDirPath = () => path.join(uploadDirPath(), MEDIA_TRASH_DIR)

// moves the originals of the given media into the trash, generated variants are removed
// (they are generated again on demand after a restore)
export async function moveMediaFilesToTrash(ids) {
    if (!ids || !ids.length) {
        return
    }
    const uploadDir = uploadDirPath(), trashDir = trashDirPath()
    await fs.promises.mkdir(trashDir, {recursive: true})
    const now = new Date()
    await Promise.all(ids.flatMap(id => [String(id), 'private' + id]).map(async name => {
        const target = path.join(trashDir, name)
        try {
            await fs.promises.rename(path.join(uploadDir, name), target)
            // the age in the trash counts from now (rename keeps the old modification time)
            await fs.promises.utimes(target, now, now)
            removeGeneratedFiles(uploadDir, name)
        } catch (e) {
            if (e.code !== 'ENOENT') {
                console.error('moveMediaFilesToTrash', name, e.message)
            }
        }
    }))
}

// moves the original of a media back from the trash (under the name matching its private flag)
// returns true if a file was restored
export async function restoreMediaFileFromTrash(id, isPrivate) {
    const uploadDir = uploadDirPath(), trashDir = trashDirPath()
    const target = path.join(uploadDir, (isMediaPrivate(isPrivate) ? 'private' : '') + id)
    for (const name of [String(id), 'private' + id]) {
        try {
            await fs.promises.rename(path.join(trashDir, name), target)
            return true
        } catch (e) {
            if (e.code !== 'ENOENT') {
                throw e
            }
        }
    }
    return false
}

// does the trash still contain the file of a media
export async function mediaFileInTrash(id) {
    const trashDir = trashDirPath()
    return await existsAsync(path.join(trashDir, String(id))) || await existsAsync(path.join(trashDir, 'private' + id))
}

// deletes files that are longer than MEDIA_TRASH_DAYS in the trash, returns the number of deleted files
export async function purgeMediaTrash(days = MEDIA_TRASH_DAYS) {
    const trashDir = trashDirPath()
    let files
    try {
        files = await fs.promises.readdir(trashDir)
    } catch (e) {
        return 0
    }
    const olderThan = Date.now() - days * 24 * 60 * 60 * 1000
    let removed = 0
    for (const file of files) {
        const filePath = path.join(trashDir, file)
        try {
            const stat = await fs.promises.stat(filePath)
            if (stat.isFile() && stat.mtimeMs < olderThan) {
                await fs.promises.unlink(filePath)
                removed++
            }
        } catch (e) {
            console.error('purgeMediaTrash', file, e.message)
        }
    }
    return removed
}
