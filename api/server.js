import 'gen/extensions-server'
import express from 'express'
import {buildSchema} from 'graphql'
import graphqlHTTP from 'express-graphql'
import {ApolloServer, gql} from 'apollo-server-express'
import {createServer} from 'http'
import {SubscriptionServer} from 'subscriptions-transport-ws'
import {execute, subscribe} from 'graphql'
import {schemaString} from './schema/index'
import {resolver} from './resolver/index'
import {dbConnection, dbPreparation} from './database'
import {auth} from './auth'
import {formatError} from './error'
import {handleUpload, handleMediaDumpUpload, handleDbDumpUpload} from './upload'
import Hook from 'util/hook'
import compression from 'compression'
import {pubsub} from './subscription'

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


export const start = (done) => {


    dbConnection((err, db, client) => dbPreparation(db, () => {

        if (!db) {
            console.error(err)
        } else {

            // Initialize http api
            const app = express()

            app.use(compression())

            // delay response
            /* app.use(function (req, res, next) {
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
            /*const typeDefs = gql(schemaString)
            const apolloServer = new ApolloServer({
                typeDefs, resolvers, formatError,
                context: ({req, res}) => {
                }
            })
            apolloServer.applyMiddleware({app, path: '/graphql2'})*/

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

            app.use('/graphql', (req, res, next) => {

                /*var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

                console.log(ip)*/

                // TODO: replace with ApolloServer so with can use batch queries
                graphqlHTTP({
                    schema,
                    rootValue,
                    graphiql: true,
                    customFormatErrorFn: formatError,
                    extensions({document, variables, operationName, result}) {
                        //UserStats.addData(req, {operationName})
                    }
                })(req, res, next).then(() => {
                    if( req.context ) {
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
            const appWs = createServer(app)


            // Bind it to port and start listening
            const server = appWs.listen(PORT, () => {
                console.log(`Server/Websocket is now running on http://localhost:${PORT}`)
                if (typeof done === 'function') {
                    done(server)
                }
            })

            server.setTimeout(10 * 60 * 1000)

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
                        context.session = payload.session
                        return {context, schema}
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
