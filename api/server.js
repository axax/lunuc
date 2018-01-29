import 'gen/extensions-server'
import express from 'express'
import graphqlHTTP from 'express-graphql'
import {createServer} from 'http'
import {SubscriptionServer} from 'subscriptions-transport-ws'
import {execute, subscribe} from 'graphql'
import {schema} from './schema/index'
import {resolver} from './resolver/index'
import {dbConnection, dbPreparation} from './database'
import {auth} from './auth'
import {formatError} from './error'
import {subscriptionManager} from './subscription'
import path from 'path'
import fs from 'fs'
import formidable from 'formidable'
import {ObjectId} from 'mongodb'


const PORT = (process.env.PORT || 3000)


// Build dir
const BUILD_DIR = path.join(__dirname, '../build')

// location to save uploaded files
const UPLOAD_DIR = BUILD_DIR + '/uploads'


export const start = (done) => {


    dbConnection((err, db) => dbPreparation(db, () => {

        if (!db) {
            reject(err)
        } else {
            // Initialize http api
            const app = express()

            // delay response
            /*app.use(function (req, res, next) {
             setTimeout(next, 3000)
             })*/

            // Authentication
            auth.initialize(app, db)


            const rootValue = resolver(db)

            // upload
            // maybe move file upload to another server
            app.use('/graphql/upload', (req, res) => {

                /* Process the uploads */
                if (req.method.toLowerCase() == 'post') {
                    const form = new formidable.IncomingForm()

                    const fileIds = []

                    // specify that we want to allow the user to upload multiple files in a single request
                    //form.multiples = true


                    res.writeHead(200, {'content-type': 'application/json'})


                    // every time a file has been uploaded successfully,
                    // rename it to it's orignal name
                    form.on('file', function (field, file) {
                        //console.log(file.path, path.join(UPLOAD_DIR, file.name))
                        const uid = ObjectId()
                        fileIds.push(uid.toString())
                        fs.rename(file.path, path.join(UPLOAD_DIR, uid.toString()))
                    })

                    // log any errors that occur
                    form.on('error', function (err) {
                        res.end('{"status":"error","message":"'+err.message+'"}')
                    })
                    form.on('aborted', function () {
                        res.end('{"status":"aborted","message":"Upload was aborted"}')
                    })

                    form.on('progress', function (bytesReceived, bytesExpected) {
                        //self.emit('progess', bytesReceived, bytesExpected)

                        var percent = (bytesReceived / bytesExpected * 100) | 0;
                        process.stdout.write('Uploading: %' + percent + '\r');
                    })


                    // once all the files have been uploaded, send a response to the client
                    form.on('end', function () {
                        res.end('{"status":"success","ids":'+JSON.stringify(fileIds)+'}')
                    })

                    // parse the incoming request containing the form data
                    form.parse(req)

                    /*res.writeHead(200, {'content-type': 'text/plain'});
                     res.write('received upload:\n\n');
                     res.end();*/


                }


            })

            app.use('/graphql', graphqlHTTP((req) => ({
                    schema,
                    rootValue,
                    graphiql: true,
                    formatError: formatError,
                    extensions({document, variables, operationName, result}) {
                    }
                }))
            )


            // Create WebSocket listener server
            const appWs = createServer(app)


            // Bind it to port and start listening
            const server = appWs.listen(PORT, () => {
                console.log(`Server/Websocket is now running on http://localhost:${PORT}`)
                if (typeof done === 'function') {
                    done(server)
                }
            })

            // attach index reference to server
            server._db = db

            const subscriptionServer = SubscriptionServer.create(
                {
                    schema,
                    execute,
                    subscribe,
                    rootValue,
                    onOperation: ({payload}) => {
                        // now if auth is needed we can check if the context is available
                        const context = auth.decodeToken(payload.auth)
                        return {context}
                    }
                },
                {
                    server: appWs
                }
            )
        }
    }))
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