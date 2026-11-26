import {isHeadRequest, sendError, sendFileFromDir} from './file.mjs'
import {SECRET_KEY} from '../../api/constants/index.mjs'
import jwt from 'jsonwebtoken'
import path from 'path'
import {ZipArchive} from 'archiver'
import {ObjectId} from 'mongodb'
import {getServerDb} from '../../api/database.mjs'
import {getDynamicConfig} from '../../util/config.mjs'
import {mediaFilePath} from '../../util/mediaFile.mjs'

const config = getDynamicConfig()

const ROOT_DIR = path.resolve()
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, config.UPLOAD_DIR)

export const verifyTokenAndResponse = (req, res, token, parsedUrl) => {

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (!err) {

            if (decoded.mediaIds) {
                zipAndSendMedias(res, decoded, req)
            } else if (!await sendFileFromDir(req, res, {
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
}



export const zipAndSendMedias = (res, decoded, req) => {

    getServerDb().then(async ({db, err}) => {

        if (!db) {
            console.error(err)
            res.status(500).send({error: err.message})
        } else {
            // Set the headers to indicate a file attachment of type zip
            res.setHeader('Content-Disposition', 'attachment; filename=files.zip')
            res.setHeader('Content-Type', 'application/zip')

            if (isHeadRequest(req)) {
                // headers only - an archive piped into a HEAD response never
                // drains (HTTP/2) and keeps the zip stream and files open
                res.end()
                return
            }

            // Create a zip archive and pipe it to the response
            const archive = new ZipArchive({
                zlib: { level: 9 }, // Sets the compression level.
            });
            archive.pipe(res)

            const medias = await db.collection('Media').find({ _id: { $in: decoded.mediaIds.map(id=>new ObjectId(id)) } }).toArray()
            // Add files to the archive (can be from disk, buffers, or strings)
            for (const media of medias) {
                // "<id>" or "private<id>" - a missing file would abort the whole zip
                const filePath = await mediaFilePath(ABS_UPLOAD_DIR, media)
                if (filePath) {
                    archive.file(filePath, {name: media.name})
                } else {
                    console.warn(`token link zip: file of media ${media._id} not found`)
                }
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
