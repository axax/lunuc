import formidable from 'formidable'
import path from 'path'
import Util from './util'
import config from 'gen/config'
import zipper from 'zip-local'
import Hook from 'util/hook'
import {execSync} from 'child_process'
import {
    CAPABILITY_MANAGE_BACKUPS
} from 'util/capabilities'

const {UPLOAD_DIR, UPLOAD_URL, DEFAULT_LANGUAGE} = config
import {contextByRequest} from '../api/util/sessionContext'


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
    const authContext = contextByRequest(req)

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
        const upload_dir = path.join(__dirname, '..' + UPLOAD_DIR)
        if (beforeUpload(res, req, upload_dir)) {

            let context = contextByRequest(req)

            if (!context.id) {
                // use anonymouse user
                const anonymousUser = await Util.userByName(db, 'anonymous')
                context = {username: anonymousUser.username, id: anonymousUser._id.toString()}
            }


            if (context.id) {

                if (!context.lang) {
                    context.lang = DEFAULT_LANGUAGE
                }

                /* Process the uploads */
                const form =  formidable({maxFileSize:10 * 1024 * 1024 * 1024})  // 10GB


                const fileIds = []

                // specify that we want to allow the user to upload multiple files in a single request
                //form.multiples = true

                // send header
                res.writeHead(200, {'content-type': 'application/json'})

                // create map with parameters
                const data = {}
                form.on('field', function (key, value) {
                    try {
                        data[key] = JSON.parse(value)
                    } catch (e) {
                        console.warn(e, value)
                        data[key] = value
                    }
                })

                let endReached = false

                let response = {status: 'success'}, count = 0

                // every time a file has been uploaded successfully,
                // rename it to it's orignal name
                let hasError
                form.on('file', async (field, file) => {
                    if( hasError ){
                        return
                    }
                    count++
                    try {
                        if (Hook.hooks['FileUpload'] && Hook.hooks['FileUpload'].length) {
                            for (let i = 0; i < Hook.hooks['FileUpload'].length; ++i) {
                                await Hook.hooks['FileUpload'][i].callback({db, context, file, response, data})
                            }
                        }
                    }catch (e) {
                        hasError = true
                        res.end(JSON.stringify({status: 'aborted', message: e.message}))
                        return
                    }
                    count--
                    if (endReached && count === 0) {
                        res.end(JSON.stringify(response))
                    }
                })

                // log any errors that occur
                form.on('error', function (err) {
                    console.log(err)
                    res.end('{"status":"error","message":"' + err.message + '"}')
                })
                form.on('aborted', function (err) {
                    console.log(err)
                    res.end('{"status":"aborted","message":"Upload was aborted"}')
                })

                /*form.on('progress', function (bytesReceived, bytesExpected) {
                    const percent = (bytesReceived / bytesExpected * 100) | 0
                    console.log('Uploading: ' + percent + '%')
                })*/


                // once all the files have been uploaded, send a response to the client
                form.on('end', () => {
                    endReached = true
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
            const form = formidable({maxFileSize: 1014 * 1024 * 1024, keepExtensions: false})

            res.writeHead(200, {'content-type': 'application/json'})


            // every time a file has been uploaded successfully,
            // rename it to it's orignal name
            form.on('file', function (field, file) {
                try {
                    zipper.sync.unzip(file.path).save(upload_dir);
                } catch (e) {
                    console.log(file.path)
                    console.error(e)
                    res.end('{"status":"error","message":"' + e.message + '"}')

                }
            })

            // log any errors that occur
            form.on('error', function (err) {
                console.log(err)
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
            // --drop --> drops collections before
            const response = execSync(`mongorestore --nsInclude=lunuc.* --noIndexRestore --uri="${client.s.url}" --drop --gzip --archive="${file.path}"`)
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
