import {sendError, sendFileFromDir} from './file.mjs'
import {SECRET_KEY} from '../../api/constants/index.mjs'
import jwt from 'jsonwebtoken'
import path from 'path'
import archiver from 'archiver'
import {ObjectId} from 'mongodb'
import {dbConnectionCached, MONGO_URL} from '../../api/database.mjs'
import {getDynamicConfig} from '../../util/config.mjs'

const config = getDynamicConfig()

const ROOT_DIR = path.resolve()
const ABS_UPLOAD_DIR = path.join(ROOT_DIR, config.UPLOAD_DIR)

export const verifyTokenAndResponse = (req, res, token, parsedUrl) => {

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (!err) {

            if (decoded.mediaIds) {
                zipAndSendMedias(res, decoded)
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



export const zipAndSendMedias = (res, decoded) => {

    dbConnectionCached(MONGO_URL, 'server',async (err, db) => {

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
