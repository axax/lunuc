import express from 'express'
import graphqlHTTP from 'express-graphql'

import {schema} from './schema'
import {resolver} from './resolver'
import {dbConnection} from './database'

const PORT = 8080

// Initialize http api
const app = express()

dbConnection((db) => {


	// delay response
	/*app.use(function (req, res, next) {
	 setTimeout(next, 1000)
	 })*/

	app.use('/graphql', graphqlHTTP({
		schema: schema,
		rootValue: resolver(db),
		graphiql: true,
		extensions({document, variables, operationName, result}) {
		}
	}))


	// Launch the api
	const server = app.listen(PORT, () => {
		const {port} = server.address()
		console.log(`Running a GraphQL API server at http://localhost:${port}/graphql`)
	})

})
