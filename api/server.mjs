import '../gensrc/extensions-server.mjs'
import express from 'express'
import {buildASTSchema} from 'graphql'
import {graphqlHTTP} from 'express-graphql'
import bodyParser from 'body-parser'
import {createServer} from 'http'
import zlib from 'zlib'
import {schemaString} from './schema/index.mjs'
import {resolver} from './resolver/index.mjs'
import {dbConnection, dbPreparation, MONGO_URL, BACKUP_MONGO_URL} from './database.mjs'
import {auth} from './auth.mjs'
import {formatAndLogError} from './error.mjs'
import {handleUpload, handleMediaDumpUpload, handleDbDumpUpload, handleHostruleDumpUpload} from './upload.mjs'
import Hook from '../util/hook.cjs'
import compression from 'compression'
import {createSubscriptionServer} from './subscription.mjs'
import {createUsers} from './data/initialData.mjs'

import {getDynamicConfig} from '../util/config.mjs'

const dynamicConfig = getDynamicConfig()

// Save original console.debug function
const originalDebug = console.debug

// Override console.debug
console.debug = (...args) => {
    if (dynamicConfig.DEBUG) {
        originalDebug(...args);
    }
}
function removeNullsMutating(obj) {
    if (Array.isArray(obj)) {
        // Rückwärts iterieren, damit sich die Indizes beim Löschen nicht verschieben
        for (let i = obj.length - 1; i >= 0; i--) {
            if (obj[i] === null || obj[i] === undefined) {
                obj.splice(i, 1);
            } else {
                removeNullsMutating(obj[i]);
            }
        }
    } else if (obj !== null && typeof obj === 'object') {
        for (const key in obj) {
            if (obj[key] === null || obj[key] === undefined) {
                delete obj[key];
            } else {
                removeNullsMutating(obj[key]);
            }
        }
    }
    return obj;
}

const PORT = (process.env.PORT || process.env.API_PORT || 3000)

// Max size of an incoming gzip body AFTER decompression. Protects against
// decompression bombs (a tiny gzip payload that inflates to gigabytes).
// Generous enough for large CMS templates but bounded.
const MAX_INFLATED_BODY_BYTES = 200 * 1024 * 1024 // 200 MB

/**
 * Express middleware: transparently decompress gzip-encoded request bodies.
 *
 * The browser client (finalFetch) compresses large GraphQL payloads with
 * CompressionStream('gzip') and sets `Content-Encoding: gzip`. body-parser
 * does NOT understand request-side Content-Encoding, so without this the
 * compressed bytes would be parsed as raw JSON and fail.
 *
 * This middleware reads the stream, inflates it, parses the JSON itself and
 * assigns `req.body`. It then strips the encoding headers and flags the
 * request so the downstream body-parser is skipped (the stream is already
 * consumed; letting body-parser read it again would hang the request).
 *
 * Only requests with `Content-Encoding: gzip` are touched; everything else
 * (uploads, plain JSON, urlencoded) passes straight through untouched.
 */
const gunzipJsonBody = (req, res, next) => {
    if (req.headers['content-encoding'] !== 'gzip') {
        return next()
    }

    const chunks = []
    let compressedSize = 0
    let settled = false

    const fail = (status, message, err) => {
        if (settled) return
        settled = true
        if (err) console.error('gunzipJsonBody:', message, '-', err.message)
        else console.warn('gunzipJsonBody:', message)

        if (!res.headersSent) {
            res.writeHead(status, {'content-type': 'application/json'})
            res.end(`{"errors":[{"message":"${message}"}]}`)
        }
        // Always tear down the inbound request. On the error/limit path the
        // client may still be uploading; replying before the body is fully
        // read can corrupt a keep-alive connection, so we destroy it rather
        // than leave a half-read stream behind.
        req.destroy()
    }

    // Collect the compressed bytes, then inflate in one shot with
    // zlib.gunzipSync. We deliberately do NOT use the streaming
    // zlib.createGunzip()/req.pipe(): in this setup the request arrives via the
    // upstream proxy (apiProxy.mjs) and the streaming decompressor never
    // emitted 'data'/'end' for the piped body, so the request hung forever.
    // Reading the stream explicitly and decompressing the assembled buffer is
    // robust regardless of how the request stream was wrapped, and trivial in
    // cost for typical payload sizes (tens of KB).
    req.on('data', (chunk) => {
        compressedSize += chunk.length
        // Guard against an oversized compressed payload before we even inflate.
        // A 10 MB gzip body is already far beyond any legitimate request here.
        if (compressedSize > 10 * 1024 * 1024) {
            fail(413, 'Compressed body too large')
            return
        }
        chunks.push(chunk)
    })

    req.on('end', () => {
        if (settled) return
        try {
            const inflated = zlib.gunzipSync(Buffer.concat(chunks), {
                maxOutputLength: MAX_INFLATED_BODY_BYTES
            })
            const raw = inflated.toString('utf8')
            req.body = raw.length ? JSON.parse(raw) : {}
            // Strip encoding-related headers so any downstream parser sees a
            // plain, already-available JSON body instead of trying to re-read
            // the (now consumed) stream. content-length no longer matches the
            // inflated size, so it must go too.
            delete req.headers['content-encoding']
            delete req.headers['content-length']
            req.headers['content-type'] = 'application/json'

            // Signal to the body-parser wrapper below that parsing is done.
            req._bodyParsed = true

            settled = true
            next()
        } catch (e) {
            // gunzipSync throws on invalid gzip, on JSON.parse failure, and
            // (with a RangeError) when maxOutputLength is exceeded.
            const tooLarge = e instanceof RangeError
            fail(tooLarge ? 413 : 400,
                tooLarge ? 'Decompressed body too large' : 'Invalid gzip or JSON body',
                e)
        }
    })

    // The client can drop the connection mid-upload (slow link, tab closed,
    // navigation). 'aborted' fires without a preceding 'error'; handle both
    // so we clean up and log instead of leaving a half-read request behind.
    req.on('error', (e) => fail(400, 'Request stream error', e))
    req.on('aborted', () => fail(400, 'Request aborted during upload'))
}

process.on('SIGINT', () => {
    console.log('Caught interrupt signal. Exit process')

    if ('undefined' != typeof (Hook.hooks['appexit']) && Hook.hooks['appexit'].length) {
        let c = Hook.hooks['appexit'].length
        for (let i = 0; i < Hook.hooks['appexit'].length; ++i) {
            const promise = Hook.hooks['appexit'][i].callback()
            promise.then(() => {
                c--
                if (c === 0) {
                    process.exit()
                }
            })
        }
    } else {
        process.exit()
    }
})

/*process.on('exit', async () => {
    console.log('Goodbye')
})*/

// holds the reference to the server
export let server

export const start = (done) => {


    dbConnection(MONGO_URL, (err, db, client) => dbPreparation(db, () => {

        if (!db) {
            console.error(err)
        } else {

            // Initialize http api
            const app = express()

            app.use(compression({
                filter: (req, res) => {
                    if (res.noCompression) {
                        // don't compress responses with this request header
                        return false
                    }

                    // fallback to standard filter function
                    return compression.filter(req, res)

                }
            }))

            // Decompress gzip-encoded request bodies BEFORE body-parser runs.
            // The client only gzips large GraphQL payloads; everything else
            // passes through untouched.
            app.use(gunzipJsonBody)

            // fix graphql limit of 100kb body size.
            // Skip parsing when gunzipJsonBody already populated req.body,
            // otherwise body-parser would try to read the already-consumed
            // stream and hang the request.
            const jsonParser = bodyParser.json({limit: '10000mb'})
            app.use((req, res, next) => {
                if (req._bodyParsed) {
                    return next()
                }
                return jsonParser(req, res, next)
            })

            app.use(express.urlencoded({
                extended: true
            }))
            // delay response
            /*  app.use(function (req, res, next) {
               setTimeout(next, 1000)
               })*/

            // Authentication
            auth.initialize(app, db)

            // order is important
            Hook.call('appready', {db, app, context: {lang:_app_.lang}})

            // upload db dump
            app.use('/graphql/upload/dbdump', handleDbDumpUpload(db, client))

            // upload media dump
            app.use('/graphql/upload/mediadump', handleMediaDumpUpload(db))

            app.use('/graphql/upload/hostrule', handleHostruleDumpUpload(db))

            // maybe move file upload to another server
            app.use('/graphql/upload', handleUpload(db))

            const resolvers = resolver(db)

            // Graphql-Express
            const schema = buildASTSchema(schemaString)
            let rootValue = {}
            Object.keys(resolvers).forEach(key => {
                if (key === 'Query' || key === 'Mutation' || key === 'Subscription') {
                    rootValue = {...rootValue, ...resolvers[key]}
                } else {
                    rootValue[key] = resolvers[key]
                }
            })

            // to upload large files
            // app.use(bodyParser.raw({ limit : '10gb', type : '*/*'}))

            // only allow post methode
            app.post('/graphql', (req, res, next) => {

                const originalJson = res.json.bind(res)

                res.json = (body) => {
                    if (res.headersSent) {
                        console.warn('[res.json wrapper] Headers already sent, skipping')
                        return res
                    }

                    if (body?.data?.cmsPage) {
                        body.data = removeNullsMutating(body.data)
                    }
                    body.isAuth = !!(req.context && req.context.id)
                    return originalJson(body)
                }

                graphqlHTTP({
                    schema,
                    rootValue,
                    graphiql: process.env.NODE_ENV !== 'production',
                    customFormatErrorFn: (error)=>{

                        return formatAndLogError(db,req,error)
                    },
                    /*extensions({document, variables, operationName, result}) {

                        result.isAuth = !!(req.context && req.context.id)

                    }*/
                })(req, res, next).then(() => {

                }).catch((error) => {
                    console.warn('graphql error', error)
                    res.writeHead(500, {'content-type': 'application/json'})
                    res.end(`{"errors":[{"message":"Error in graphql. Probably there is something wrong with the schema or the resolver: ${error.message}"}]}`)

                    const errorContext = {
                        message: error.message,
                        name: error.name,
                        stack: error.stack,
                        body: req.body,                       // enthält query + variables
                        query: req.body && req.body.query,
                        variables: req.body && req.body.variables,
                        operationName: req.body && req.body.operationName,
                        url: req.originalUrl,
                        method: req.method,
                        headers: {
                            'content-type': req.headers['content-type'],
                            'user-agent': req.headers['user-agent'],
                            'x-forwarded-for': req.headers['x-forwarded-for']
                        },
                        userId: req.context && req.context.id
                    }

                    Hook.call('graphqlError', {db, req, errorContext, type:'catch'})
                })
            })


            /* fallback login for no js browsers */
            app.use('/graphql/login', async (req, res) => {
                if(req.body) {

                    const result = await resolvers.Query.login(req.body, req)
                    if(!result.user){
                        res.send(`invalid login`)
                    }else {
                        res.redirect(req.body.forward || '/')
                    }
                }else{
                    res.send(`Username and Password is missing`)
                }
            })


            // Create WebSocket listener server
            server = createServer(app)


            // Bind it to port and start listening
            server.listen(PORT, () => {
                console.log(`Server/Websocket is now running on http://localhost:${PORT}`)
                if (typeof done === 'function') {
                    done(server)
                }
            })

            server.keepAliveTimeout = 11 * 60 * 1000
            server.headersTimeout   = server.keepAliveTimeout + 5000
            // request body may take longer than the 5 min Node default for large uploads
            server.requestTimeout   = 12 * 60 * 1000                   // 0 disables it entirely


            // attach index reference to server
            server._db = db

            createSubscriptionServer({server, schema, rootValue})


        }
    }))

    if (BACKUP_MONGO_URL) {
        dbConnection(BACKUP_MONGO_URL, async (err, db, client) => {
            await createUsers(db)
            _app_.backupDb = db

        })
    }
}


export const stop = (server, done) => {
    if (server) {
        console.log(`Stop server running on http://localhost:${PORT}`)

        if (server._db && server._db.close) {
            server._db.close(() => {
                server.close(() => {
                    done()
                })
            })
        } else {
            server.close(() => {
                done()
            })
        }

    } else {
        done()
    }
}

export default {start, stop}