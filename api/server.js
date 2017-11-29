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

const PORT = (process.env.PORT || 3000)

export const start = (done) => {


    dbConnection((err, db) => dbPreparation(db, () => {

        if (!db) {
            reject(err)
        } else {
            // Initialize http api
            const app = express()

            // delay response
            /*app.use(function (req, res, next) {
             setTimeout(next, 1000)
             })*/

            // Authentication
            auth.initialize(app, db)


            const rootValue = resolver(db)

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

            // attach db reference to server
            server._db=db

            const subscriptionServer = SubscriptionServer.create(
                {
                    schema,
                    execute,
                    subscribe,
                    rootValue
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
        server._db.close(()=> {
            server.close(() => {
                done()
            })
        })
    }else {
        done()
    }
}

export default {start, stop}