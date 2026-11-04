import formidable from 'formidable'
import path from 'path'
import fs from 'fs'
import Util from './util/index.mjs'
import config from '../gensrc/config.mjs'
import Hook from '../util/hook.cjs'
import {execFileSync} from 'child_process'
import {safeUnzipToDir} from './util/zipSafe.mjs'
import {
    CAPABILITY_MANAGE_BACKUPS
} from '../util/capabilities.mjs'


const {UPLOAD_DIR, DEFAULT_LANGUAGE, HOSTRULES_ABSPATH} = config

const beforeUpload = (res, req, upload_dir) => {
    if (!Util.ensureDirectoryExistence(upload_dir, true)) {
        // no upload folder
        res.writeHead(500, {'content-type': 'application/json'});
        res.end(JSON.stringify({status: 'error', message: `Upload folder could not be created -> ${upload_dir}`}))
        return false;
    } else {
        if (req.method.toLowerCase() !== 'post') {

            // Method Not Allowed
            res.writeHead(405, {'content-type': 'application/json'});
            res.end(JSON.stringify({status: 'error', message: 'Method Not Allowed. You must send data with post method'}))
            return false
        }
    }
    return true;
}


// max upload size for users that are not logged in (default 100MB), env value in MB
const ANONYMOUS_MAX_FILE_SIZE = (parseInt(process.env.LUNUC_ANONYMOUS_UPLOAD_MAX_MB) || 100) * 1024 * 1024

const authContextOrError = async (db, res, req, capability) => {
    // req.context is set (and validated) by auth.initialize, which runs before the upload routes
    const authContext = req.context

    if (capability && !await Util.userHasCapability(db, authContext, capability)) {
        res.writeHead(401, {'content-type': 'application/json'});
        res.end(JSON.stringify({status: 'error', message: 'User has no capability to ' + capability}))
        return null
    }

    return authContext
}

export const handleUpload = db => async (req, res) => {
    // make sure upload dir exists
    const upload_dir = path.join(__dirname, '..' + UPLOAD_DIR)
    if (beforeUpload(res, req, upload_dir)) {

        // anonymous uploads (e.g. attachments of public forms) are limited in size,
        // so nobody can fill up the disk without an account
        const maxFileSize = req.context.id ? 10 * 1024 * 1024 * 1024 /* 10GB */ : ANONYMOUS_MAX_FILE_SIZE

        // req.context is set (and validated) by auth.initialize; without login the anonymous user
        let context = await Util.userOrAnonymousContext(db, req.context)


        if (context.id) {

            if (!context.lang) {
                context.lang = DEFAULT_LANGUAGE
            }

            /* Process the uploads */
            const form = formidable({maxFileSize, maxTotalFileSize: maxFileSize})

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

            // 'endReached' is set once the form fully parsed all parts,
            // 'count' tracks the number of file hooks currently in flight,
            // 'finished' guards that the response is sent exactly once.
            let endReached = false
            let count = 0
            let finished = false
            const response = {status: 'success'}

            // Send the final response once the form has ended AND no file hook
            // is still running. Safe to call multiple times and from multiple
            // event handlers - only the first matching call sends the response.
            const tryFinish = () => {
                if (!finished && endReached && count === 0) {
                    finished = true
                    res.end(JSON.stringify(response))
                }
            }

            // every time a file has been uploaded successfully,
            // run the registered FileUpload hooks
            form.on('file', async (field, file) => {
                if (finished) {
                    return
                }
                count++
                try {
                    if (Hook.hooks['FileUpload'] && Hook.hooks['FileUpload'].length) {
                        for (let i = 0; i < Hook.hooks['FileUpload'].length; ++i) {
                            await Hook.hooks['FileUpload'][i].callback({db, req, context, file, response, data})
                        }
                    }
                } catch (e) {
                    if (!finished) {
                        finished = true
                        res.end(JSON.stringify({status: 'aborted', message: e.message}))
                    }
                    return
                }
                count--
                tryFinish()
            })

            // log any errors that occur
            form.on('error', function (err) {
                console.log('upload error',err)
                if (!finished) {
                    finished = true
                    res.end(JSON.stringify({status: 'error', message: err.message}))
                }
            })
            form.on('aborted', function (err) {
                console.log('upload aborted', err)
                if (!finished) {
                    finished = true
                    res.end(JSON.stringify({status: 'aborted', message: 'Upload was aborted'}))
                }
            })

            // once all the parts have been received, mark the form as ended and
            // try to send the response. This also covers the case where no file
            // was uploaded (only fields) as well as the race where every file
            // hook already finished before the 'end' event fired.
            form.on('end', () => {
                endReached = true
                tryFinish()
            })

            // parse the incoming request containing the form data
            // (without a callback parse returns a promise - errors are handled in the 'error' event)
            form.parse(req).catch(() => {})
        }
    }
}

// 1GB
const MAX_DUMP_SIZE = 1024 * 1024 * 1024

/*
 Upload of backup dumps (media, hostrules, db): parses the form, runs onFile(file) for every
 received file and sends exactly one json response after the whole form is received.
 If onFile throws, the response is an error with its message (further files are skipped).
 */
const handleDumpUpload = (req, res, formOptions, onFile) => {
    const form = formidable({keepExtensions: false, ...formOptions})

    res.writeHead(200, {'content-type': 'application/json'})

    // several events can end the upload (error, aborted, end) - only the first one responds
    let finished = false
    const send = (body) => {
        if (!finished) {
            finished = true
            res.end(JSON.stringify(body))
        }
    }

    let fileError = null
    form.on('file', (field, file) => {
        if (fileError || finished) {
            return
        }
        try {
            onFile(file)
        } catch (e) {
            console.error('dump upload: processing failed', file.filepath, e.message)
            fileError = e.message
        }
    })

    form.on('error', (err) => {
        console.log('dump upload error', err)
        send({status: 'error', message: err.message})
    })
    form.on('aborted', () => {
        send({status: 'aborted', message: 'Upload was aborted'})
    })

    // progress is reported for every received chunk - only log every 10%
    let lastStep = -1
    form.on('progress', (bytesReceived, bytesExpected) => {
        const step = bytesExpected ? Math.floor(bytesReceived / bytesExpected * 10) : 0
        if (step !== lastStep) {
            lastStep = step
            console.log(`Uploading dump: ${step * 10}%`)
        }
    })

    form.on('end', () => {
        send(fileError ? {status: 'error', message: fileError} : {status: 'success'})
    })

    // without a callback parse returns a promise - errors are handled in the 'error' event
    form.parse(req).catch(() => {})
}

export const handleMediaDumpUpload = db => async (req, res) => {
    // make sure upload dir exists
    const upload_dir = path.join(__dirname, '../' + UPLOAD_DIR)
    if (beforeUpload(res, req, upload_dir) && await authContextOrError(db, res, req, CAPABILITY_MANAGE_BACKUPS)) {
        // safeUnzipToDir validates EVERY zip entry against path traversal ("zip slip")
        // before anything is written - so no file can end up outside of upload_dir
        handleDumpUpload(req, res, {maxFileSize: MAX_DUMP_SIZE}, file => safeUnzipToDir(file.filepath, upload_dir))
    }
}

export const handleHostruleDumpUpload = db => async (req, res) => {
    // make sure upload dir exists
    if (beforeUpload(res, req, HOSTRULES_ABSPATH) && await authContextOrError(db, res, req, CAPABILITY_MANAGE_BACKUPS)) {
        // zip slip protection: see handleMediaDumpUpload
        handleDumpUpload(req, res, {maxFileSize: MAX_DUMP_SIZE}, file => safeUnzipToDir(file.filepath, HOSTRULES_ABSPATH))
    }
}

export const handleDbDumpUpload = (db, client) => async (req, res) => {
    const authContext = await authContextOrError(db, res, req, CAPABILITY_MANAGE_BACKUPS)
    if (authContext) {
        const maxDbDumpSize = 10 * 1024 * 1024 * 1024 // 10GB
        handleDumpUpload(req, res, {maxFileSize: maxDbDumpSize, maxTotalFileSize: maxDbDumpSize}, file => {
            // execFileSync instead of execSync: no shell parsing, arguments are
            // passed 1:1 to the process. client.s.url and file.filepath don't
            // come directly from the client body, but execFileSync is still
            // the safer choice here with no downsides.
            // --drop deletes ALL existing collections before the restore -
            // make sure CAPABILITY_MANAGE_BACKUPS is tightly scoped and
            // restores are logged/audited (see below).
            console.log(`[AUDIT] DB restore triggered by user=${authContext.username || authContext.id} at ${new Date().toISOString()} file=${file.originalFilename} size=${file.size}`)

            try {
                if (!file.size) {
                    throw new Error('Uploaded file is empty')
                }
                // a mongodump --gzip archive must start with the gzip magic bytes 1f 8b
                const fd = fs.openSync(file.filepath, 'r')
                const magic = Buffer.alloc(2)
                fs.readSync(fd, magic, 0, 2, 0)
                fs.closeSync(fd)
                if (magic[0] !== 0x1f || magic[1] !== 0x8b) {
                    throw new Error(`Uploaded file is not a gzip archive (size=${file.size} bytes)`)
                }
                const response = execFileSync('mongorestore', [
                    '--nsInclude=lunuc.*',
                    '--noIndexRestore',
                    `--uri=${client.s.url}`,
                    '--drop',
                    '--gzip',
                    `--archive=${file.filepath}`
                ], {maxBuffer: 50 * 1024 * 1024})
                console.log('restoreDbDump', response.toString())
            } catch (e) {
                // mongorestore writes its actual error message to stderr
                const stderr = e.stderr ? e.stderr.toString() : ''
                const failedLine = stderr.split('\n').find(l => l.includes('Failed:'))
                const restoreError = failedLine ? failedLine.replace(/^.*Failed:\s*/, '') : e.message
                console.error('restoreDbDump failed', restoreError, stderr)
                throw new Error('Restore failed: ' + restoreError)
            }
        })
    }
}
