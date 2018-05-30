import fs from 'fs'
import formidable from 'formidable'
import {ObjectId} from 'mongodb'
import {auth} from './auth'
import path from 'path'
import Util from './util'
import config from 'gen/config'
const {UPLOAD_DIR} = config


const handleUpload = db => (req, res) => {

    // make sure upload dir exists
    const upload_dir = path.join(__dirname, '../'+ UPLOAD_DIR)
    if( !Util.ensureDirectoryExistence(upload_dir) ){
        // no upload folder
        res.writeHead(500, {'content-type': 'application/json'});
        res.end(`{"status":"error","message":"Upload folder coud not be created -> ${upload_dir}"}`)
    }else {

        /* Process the uploads */
        if (req.method.toLowerCase() === 'post') {

            // check auth token
            const authContext = auth.decodeToken(req.headers.authorization)

            if (authContext) {

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

                    // store file under the name of the _id
                    fs.rename(file.path, path.join(upload_dir, _id.toString()), async () => {
                        // save to db
                        const insertResult = await db.collection('Media').insertOne({
                            _id,
                            name: file.name,
                            createdBy: ObjectId(authContext.id)
                        })

                        /*if (insertResult.insertedCount) {
                         const doc = insertResult.ops[0]


                         return {
                         _id: doc._id,
                         title,
                         body,
                         createdBy: {
                         _id: ObjectId(context.id),
                         username: context.username
                         },
                         status: 'created'
                         }
                         }*/
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
                    var percent = (bytesReceived / bytesExpected * 100) | 0;
                    process.stdout.write('Uploading: ' + percent + '%\r');
                })


                // once all the files have been uploaded, send a response to the client
                form.on('end', function () {
                    res.end('{"status":"success","ids":' + JSON.stringify(fileIds) + '}')
                })

                // parse the incoming request containing the form data
                form.parse(req)
            } else {
                // no auth
                res.writeHead(401, {'content-type': 'application/json'});
                res.end('{"status":"error","message":"Upload failed. Unauthorized to upload files"}')

            }

        }
    }
}


export default handleUpload