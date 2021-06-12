import 'gen/extensions-server'
import express from 'express'
import {buildSchema} from 'graphql'
import {graphqlHTTP} from 'express-graphql'
import bodyParser from 'body-parser'
//import {ApolloServer, gql} from 'apollo-server-express'
import {createServer} from 'http'
import {SubscriptionServer} from 'subscriptions-transport-ws'
import {execute, subscribe} from 'graphql'
import {schemaString} from './schema/index'
import {resolver} from './resolver/index'
import {dbConnection, dbPreparation, MONGO_URL, BACKUP_MONGO_URL} from './database'
import {auth} from './auth'
import {formatError} from './error'
import {handleUpload, handleMediaDumpUpload, handleDbDumpUpload} from './upload'
import Hook from 'util/hook'
import compression from 'compression'
import {pubsub} from './subscription'
import {decodeToken} from './util/jwt'
import {HEADER_TIMEOUT, SESSION_HEADER, USE_COOKIES} from './constants'
import {parseCookies} from './util/parseCookies'
import {createUserRoles, createUsers} from './data/initialData'


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

            // delay response
            /*  app.use(function (req, res, next) {
               setTimeout(next, 1000)
               })*/

            // Authentication
            auth.initialize(app, db)

            // order is important
            Hook.call('appready', {db, app})

            // upload db dump
            app.use('/graphql/upload/dbdump', handleDbDumpUpload(db, client))

            // upload media dump
            app.use('/graphql/upload/mediadump', handleMediaDumpUpload(db))

            // maybe move file upload to another server
            app.use('/graphql/upload', handleUpload(db))

            const resolvers = resolver(db)

            // ApolloServer
            // Construct a schema, using GraphQL schema language
            /* const typeDefs = gql(schemaString)
             const apolloServer = new ApolloServer({
                 typeDefs, resolvers, formatError,
                 context: ({ req }) => req
             })
             apolloServer.applyMiddleware({app, path: '/graphql'})*/

            // Graphql-Express
            const schema = buildSchema(schemaString)
            let rootValue = {}
            Object.keys(resolvers).forEach(key => {
                if (key === 'Query' || key === 'Mutation' || key === 'Subscription') {
                    rootValue = {...rootValue, ...resolvers[key]}
                } else {
                    rootValue[key] = resolvers[key]
                }
            })


            //app.use(bodyParser.urlencoded({ extended: false }))
            // fix graphql limit of 100kb body size
            app.use(bodyParser.json({limit: '10000mb'}))

            // only allow post methode
            app.post('/graphql', (req, res, next) => {

                //var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                //console.log(ip)*
                // TODO: replace with ApolloServer so with can use batch queries
                graphqlHTTP({
                    schema,
                    rootValue,
                    graphiql: process.env.NODE_ENV !== 'production',
                    customFormatErrorFn: formatError,
                    extensions({document, variables, operationName, result}) {
                        //UserStats.addData(req, {operationName})
                    }
                })(req, res, next).then(() => {
                    if (req.context) {
                        req.context.responded = true
                        if (req.context.delayedPubsubs) {
                            for (const pub of req.context.delayedPubsubs) {
                                pubsub.publish(pub.triggerName, pub.payload)
                            }
                        }
                    }
                }).catch((e) => {
                    res.writeHead(500, {'content-type': 'application/json'})
                    res.end(`{"errors":[{"message":"Error in graphql. Probably there is something wrong with the schema or the resolver: ${e.message}"}]}`)

                })
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

            const subscriptionServer = SubscriptionServer.create(
                {
                    schema,
                    execute,
                    subscribe,
                    rootValue,
                    onConnect: (connectionParams, webSocket, context) => {

                        // const host = webSocket.upgradeReq.headers.host
                    },
                    onOperation: ({payload}, params, ws) => {

                        let context
                        if (USE_COOKIES) {
                            const cookies = parseCookies(ws.upgradeReq)
                            context = decodeToken(cookies.auth)
                            context.session = cookies.session
                        } else {
                            context = decodeToken(payload.auth)
                            context.session = payload.session
                        }

                        // now if auth is needed we can check if the context is available
                        context.variables = payload.variables
                        return {context, schema}
                    }
                },
                {
                    server
                }
            )

        }
    }))

    if (BACKUP_MONGO_URL) {
        dbConnection(BACKUP_MONGO_URL, async (err, db, client) => {
            await createUserRoles(db)
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
