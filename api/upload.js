import fs from 'fs'
import formidable from 'formidable'
import {ObjectId} from 'mongodb'
import {auth} from './auth'
import path from 'path'
import Util from './util'
import config from 'gen/config'
import zipper from 'zip-local'
import MimeType from '../util/mime'
import {execSync} from 'child_process'
import {
    CAPABILITY_MANAGE_BACKUPS
} from 'util/capabilities'


const {UPLOAD_DIR} = config


const beforeUpload = (res, req, upload_dir) => {
    if (!Util.ensureDirectoryExistence(upload_dir)) {
        // no upload folder
        res.writeHead(500, {'content-type': 'application/json'});
        res.end(`{"status":"error","message":"Upload folder coud not be created -> ${upload_dir}"}`)
        return false;
    } else {
        if (req.method.toLowerCase() !== 'post') {

            // Method Not Allowed
            res.writeHead(405, {'content-type': 'application/json'});
            res.end('{"status":"error","message":"Method Not Allowed. You must send data with post method"}')
            return false
        }
    }
    return true;
}


const authContextOrError = async (db, res, req, capability) => {
    // check auth token
    const authContext = auth.decodeToken(req.headers.authorization)

    if (!authContext) {
        // no auth
        res.writeHead(401, {'content-type': 'application/json'});
        res.end('{"status":"error","message":"Upload failed. Unauthorized to upload files"}')
        return null
    } else {

        if (capability && !await Util.userHasCapability(db, authContext, capability)) {
            res.writeHead(401, {'content-type': 'application/json'});
            res.end('{"status":"error","message":"User has no capability to ' + capability + '"}')
            return null
        }


        return authContext
    }
}

export const handleUpload = db => async (req, res) => {

    // make sure upload dir exists
    const upload_dir = path.join(__dirname, '../' + UPLOAD_DIR)
    if (beforeUpload(res, req, upload_dir)) {

        const authContext = await authContextOrError(db, res, req)
        if (authContext) {

            /* Process the uploads */
            const form = new formidable.IncomingForm()

            const fileIds = []

            // specify that we want to allow the user to upload multiple files in a single request
            //form.multiples = true


            res.writeHead(200, {'content-type': 'application/json'})


            // every time a file has been uploaded successfully,
            // rename it to it's orignal name
            form.on('file', function (field, file) {
                //console.log(file.path, path.join(UPLOAD_DIR, file.name))
                const _id = ObjectId()
                fileIds.push(_id)

                // store file under the name of the _id
                fs.rename(file.path, path.join(upload_dir, _id.toString()), async () => {

                    const mimeType = MimeType.detectByFileName(file.name)
                    // save to db
                    const insertResult = await db.collection('Media').insertOne({
                        _id,
                        name: file.name,
                        mimeType: mimeType || 'application/octet-stream',
                        createdBy: ObjectId(authContext.id)
                    })
                    if (insertResult.insertedCount > 0) {
                        /*const doc = insertResult.ops[0]


                         console.log({
                         _id: doc._id,
                         title,
                         body,
                         createdBy: {
                         _id: ObjectId(context.id),
                         username: context.username
                         },
                         status: 'created'
                         })*/
                    }
                })
            })

            // log any errors that occur
            form.on('error', function (err) {
                res.end('{"status":"error","message":"' + err.message + '"}')
            })
            form.on('aborted', function () {
                res.end('{"status":"aborted","message":"Upload was aborted"}')
            })

            form.on('progress', function (bytesReceived, bytesExpected) {
                const percent = (bytesReceived / bytesExpected * 100) | 0
                console.log('Uploading: ' + percent + '%')
            })


            // once all the files have been uploaded, send a response to the client
            form.on('end', function () {
                res.end('{"status":"success","ids":' + JSON.stringify(fileIds) + '}')
            })

            // parse the incoming request containing the form data
            form.parse(req)
        }
    }
}

export const handleMediaDumpUpload = db => async (req, res) => {

    // make sure upload dir exists
    const upload_dir = path.join(__dirname, '../' + UPLOAD_DIR)
    if (beforeUpload(res, req, upload_dir)) {

        const authContext = await authContextOrError(db, res, req, CAPABILITY_MANAGE_BACKUPS)
        if (authContext) {

            /* Process the uploads */
            const form = new formidable.IncomingForm()

            res.writeHead(200, {'content-type': 'application/json'})


            // every time a file has been uploaded successfully,
            // rename it to it's orignal name
            form.on('file', function (field, file) {
                zipper.sync.unzip(file.path).save(upload_dir);
            })

            // log any errors that occur
            form.on('error', function (err) {
                res.end('{"status":"error","message":"' + err.message + '"}')
            })
            form.on('aborted', function () {
                res.end('{"status":"aborted","message":"Upload was aborted"}')
            })

            form.on('progress', function (bytesReceived, bytesExpected) {
                const percent = (bytesReceived / bytesExpected * 100) | 0
                console.log('Uploading: ' + percent + '%')
            })


            // once all the files have been uploaded, send a response to the client
            form.on('end', function () {
                res.end('{"status":"success"}')
            })

            // parse the incoming request containing the form data
            form.parse(req)
        }
    }
}


export const handleDbDumpUpload = (db, client) => async (req, res) => {


    const authContext = await authContextOrError(db, res, req, CAPABILITY_MANAGE_BACKUPS)
    if (authContext) {

        /* Process the uploads */
        const form = new formidable.IncomingForm()

        res.writeHead(200, {'content-type': 'application/json'})


        // every time a file has been uploaded successfully,
        // rename it to it's orignal name
        form.on('file', function (field, file) {

            console.log(client.s.url)
            const response = execSync(`mongorestore --uri="${client.s.url}" --gzip --archive="${file.path}"`)
            console.log('restoreDbDump', response)

        })

        // log any errors that occur
        form.on('error', function (err) {
            res.end('{"status":"error","message":"' + err.message + '"}')
        })
        form.on('aborted', function () {
            res.end('{"status":"aborted","message":"Upload was aborted"}')
        })

        form.on('progress', function (bytesReceived, bytesExpected) {
            const percent = (bytesReceived / bytesExpected * 100) | 0
            console.log('Uploading: ' + percent + '%')
        })


        // once all the files have been uploaded, send a response to the client
        form.on('end', function () {
            res.end('{"status":"success"}')
        })

        // parse the incoming request containing the form data
        form.parse(req)
    }
}