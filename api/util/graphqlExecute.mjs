import {execute, specifiedRules, validateSchema, Source, GraphQLError} from 'graphql'
import {cachedParse, cachedValidate} from './graphqlDocumentCache.mjs'

/*
 GraphQL over HTTP for /graphql (replaces express-graphql, which is no longer maintained and
 built its options and parsed the parameters again on every request).
 Same behaviour as express-graphql 0.12 (see the tests in test/unit/graphqlExecute.test.js):
 - parameters (query, variables, operationName) from the url and the request body
 - 400 for a missing query, invalid variables, syntax and validation errors and execution
   context errors, 500 if the result has no data
 - context = req, response via res.json, errors formatted with formatError
 GraphiQL is not offered (the route only accepts POST, GraphiQL needs GET).
 */

const httpError = (status, message, graphqlErrors) => {
    const error = new Error(message)
    error.status = status
    error.graphqlErrors = graphqlErrors
    return error
}

// body of "Content-Type: application/graphql" (not read by the json / urlencoded parsers)
const readGraphqlBody = (req) => new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', chunk => data += chunk)
    req.on('end', () => resolve({query: data}))
    req.on('error', reject)
})

const getParams = async (req) => {
    let body = req.body
    if ((!body || typeof body !== 'object' || Object.keys(body).length === 0) &&
        (req.headers['content-type'] || '').startsWith('application/graphql') && req.readable) {
        body = await readGraphqlBody(req)
    }
    if (!body || typeof body !== 'object' || Buffer.isBuffer(body)) {
        body = {}
    }
    const queryIndex = req.url.indexOf('?')
    const urlData = queryIndex >= 0 ? new URLSearchParams(req.url.substring(queryIndex + 1)) : null

    let query = urlData?.get('query') ?? body.query
    if (typeof query !== 'string') {
        query = null
    }
    let variables = urlData?.get('variables') ?? body.variables
    if (typeof variables === 'string') {
        try {
            variables = JSON.parse(variables)
        } catch (e) {
            throw httpError(400, 'Variables are invalid JSON.')
        }
    } else if (typeof variables !== 'object') {
        variables = null
    }
    let operationName = urlData?.get('operationName') ?? body.operationName
    if (typeof operationName !== 'string') {
        operationName = null
    }
    return {query, variables, operationName}
}

export const executeGraphqlRequest = async (req, res, {schema, rootValue, formatError}) => {
    let result
    try {
        const {query, variables, operationName} = await getParams(req)
        if (query == null) {
            throw httpError(400, 'Must provide query string.')
        }

        // cached by graphql-js on the schema object
        const schemaValidationErrors = validateSchema(schema)
        if (schemaValidationErrors.length > 0) {
            throw httpError(500, 'GraphQL schema validation error.', schemaValidationErrors)
        }

        let document
        try {
            document = cachedParse(new Source(query, 'GraphQL request'))
        } catch (syntaxError) {
            throw httpError(400, 'GraphQL syntax error.', [syntaxError])
        }

        const validationErrors = cachedValidate(schema, document, specifiedRules)
        if (validationErrors.length > 0) {
            throw httpError(400, 'GraphQL validation error.', validationErrors)
        }

        try {
            result = await execute({
                schema,
                document,
                rootValue,
                contextValue: req,
                variableValues: variables,
                operationName
            })
        } catch (contextError) {
            throw httpError(400, 'GraphQL execution context error.', [contextError])
        }
    } catch (rawError) {
        const error = rawError instanceof Error ? rawError : new Error(String(rawError))
        res.statusCode = error.status || 500
        result = {
            data: undefined,
            errors: error.graphqlErrors || [new GraphQLError(error.message, {originalError: error})]
        }
    }

    // no data = runtime error (the error itself is in the payload)
    if (res.statusCode === 200 && result.data == null) {
        res.statusCode = 500
    }

    res.json({
        ...result,
        errors: result.errors ? result.errors.map(formatError) : undefined
    })
}
