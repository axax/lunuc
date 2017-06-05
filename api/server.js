import express from 'express'
import graphqlHTTP from 'express-graphql'
import {createServer} from 'http'
import {SubscriptionServer} from 'subscriptions-transport-ws'

import {schema} from './schema/index'
import {resolver} from './resolver/index'
import {dbConnection, dbPreparation} from './database'
import {auth} from './auth'
import {formatError} from './error'
import {subscriptionManager} from './subscription'

const PORT = 8080
const WS_PORT = 5000

dbConnection((db) => dbPreparation(db, () => {

		// Initialize http api
		const app = express()

		// delay response
		/*app.use(function (req, res, next) {
		 setTimeout(next, 2000)
		 })*/

		// Authentication
		auth.initialize(app, db)


		app.use('/graphql', graphqlHTTP((req) => ({
				schema: schema,
				rootValue: resolver(db),
				graphiql: true,
				formatError: formatError,
				extensions({document, variables, operationName, result}) {
				}
			}))
		)

		// Launch the api
		const server = app.listen(PORT, () => {
			const {port} = server.address()
			console.log(`Running a GraphQL API server at http://localhost:${port}/graphql`)
		})


		// Create WebSocket listener server
		const appWs = createServer((request, response) => {
			response.writeHead(404)
			response.end()
		})


		// Bind it to port and start listening
		appWs.listen(WS_PORT, () => console.log(
			`Websocket Server is now running on http://localhost:${WS_PORT}`
		))

		const subscriptionServer = new SubscriptionServer(
			{
				subscriptionManager: subscriptionManager
			},
			{
				server: appWs
			}
		)
	}))
