import 'gen/extensions-server'
import express from 'express'
import graphqlHTTP from 'express-graphql'
import { GraphQLError } from 'graphql'
import {createServer} from 'http'
import {SubscriptionServer} from 'subscriptions-transport-ws'
import {execute, subscribe} from 'graphql'
import {schema} from './schema/index'
import {resolver} from './resolver/index'
import {dbConnection, dbPreparation} from './database'
import {auth} from './auth'
import {formatError} from './error'
import {handleUpload, handleMediaDumpUpload, handleDbDumpUpload} from './upload'

const PORT = (process.env.PORT || 3000)

export const start = (done) => {


    dbConnection((err, db, client) => dbPreparation(db, () => {

        if (!db) {
            reject(err)
        } else {
            // Initialize http api
            const app = express()

            // delay response
            /*app.use(function (req, res, next) {
             setTimeout(next, 5000)
             })*/

            // Authentication
            auth.initialize(app, db)


            const rootValue = resolver(db)

            // upload db dump
            app.use('/graphql/upload/dbdump', handleDbDumpUpload(db, client))

            // upload media dump
            app.use('/graphql/upload/mediadump', handleMediaDumpUpload(db))

            // maybe move file upload to another server
            app.use('/graphql/upload', handleUpload(db))


            app.use('/graphql', (req, res, next) => {
                graphqlHTTP({
                    schema,
                    rootValue,
                    graphiql: true,
                    formatError: formatError,
                    extensions({document, variables, operationName, result}) {
                    }
                })(req, res, next).catch((e) => {

                    res.writeHead(500, {'content-type': 'application/json'})
                    res.end(`{"errors":[{"message":"Error in graphql. Probably there is something wrong with the schema or the resolver: ${e.message}"}]}`)

                })
            })


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