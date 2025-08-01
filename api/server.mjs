import '../gensrc/extensions-server.mjs'
import express from 'express'
import {buildASTSchema} from 'graphql'
import {graphqlHTTP} from 'express-graphql'
import bodyParser from 'body-parser'
import {createServer} from 'http'
import {schemaString} from './schema/index.mjs'
import {resolver} from './resolver/index.mjs'
import {dbConnection, dbPreparation, MONGO_URL, BACKUP_MONGO_URL} from './database.mjs'
import {auth} from './auth.mjs'
import {formatError} from './error.mjs'
import {handleUpload, handleMediaDumpUpload, handleDbDumpUpload, handleHostruleDumpUpload} from './upload.mjs'
import Hook from '../util/hook.cjs'
import compression from 'compression'
import {createSubscriptionServer, pubsub} from './subscription.mjs'
import {HEADER_TIMEOUT} from './constants/index.mjs'
import {createUsers} from './data/initialData.mjs'


const PORT = (process.env.PORT || 3000)

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

process.on('uncaughtException', (error) => {
    console.log(error)
    console.error(error.stack)
    console.log("Node NOT Exiting...")
})

process.on('unhandledRejection', (reason, p) => {
    console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason)
    // application specific logging, throwing an error, or other logic here
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

            // fix graphql limit of 100kb body size
            app.use(bodyParser.json({limit: '10000mb'}))

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

                graphqlHTTP({
                    schema,
                    rootValue,
                    graphiql: process.env.NODE_ENV !== 'production',
                    customFormatErrorFn: formatError,
                    extensions({document, variables, operationName, result}) {
                        //UserStats.addData(req, {operationName})

                        // return auth state
                        result.isAuth = !!(req.context && req.context.id)

                    }
                })(req, res, next).then(() => {
                    if (req.context) {

                    }
                }).catch((e) => {
                    res.writeHead(500, {'content-type': 'application/json'})
                    res.end(`{"errors":[{"message":"Error in graphql. Probably there is something wrong with the schema or the resolver: ${e.message}"}]}`)

                })
            })


            /* fallback login for no js browsers */
            app.use(express.urlencoded({
                extended: true
            }))
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


            //server.keepAliveTimeout = 11 * 60*1000;
            server.headersTimeout = HEADER_TIMEOUT

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
