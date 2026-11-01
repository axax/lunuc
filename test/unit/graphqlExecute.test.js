/*
 * GraphQL handler (api/util/graphqlExecute.mjs). It replaced express-graphql - the expected answers
 * were recorded with express-graphql 0.12 (status code and body), so the behaviour stays the same.
 */
import assert from 'node:assert'
import http from 'http'
import express from 'express'
import bodyParser from 'body-parser'
import {buildSchema} from 'graphql'
import {executeGraphqlRequest} from '../../api/util/graphqlExecute.mjs'

const schema = buildSchema(`
    type Entry { value: String! name: String }
    type Query { list(x: String): [Entry] fails: [Entry] }
`)
const rootValue = {
    list: () => [{value: 'a', name: 'A'}, {value: 'b', name: null}],
    fails: () => { throw new Error('resolver failed') }
}
const formatError = e => ({message: e.message, locations: e.locations, path: e.path})

// request: [body, query string, content type]
const cases = {
    ok: {
        request: [{query: '{list{value name}}'}],
        expected: {status: 200, body: "{\"data\":{\"list\":[{\"value\":\"a\",\"name\":\"A\"},{\"value\":\"b\",\"name\":null}]}}"}
    },
    variablesAsString: {
        request: [{query: 'query q($x:String){list(x:$x){value}}', variables: '{"x":"a"}'}],
        expected: {status: 200, body: "{\"data\":{\"list\":[{\"value\":\"a\"},{\"value\":\"b\"}]}}"}
    },
    invalidVariables: {
        request: [{query: '{list{value}}', variables: '{bad'}],
        expected: {status: 400, body: "{\"errors\":[{\"message\":\"Variables are invalid JSON.\"}]}"}
    },
    syntaxError: {
        request: [{query: '{list{'}],
        expected: {status: 400, body: "{\"errors\":[{\"message\":\"Syntax Error: Expected Name, found <EOF>.\",\"locations\":[{\"line\":1,\"column\":7}]}]}"}
    },
    validationError: {
        request: [{query: '{list{nope}}'}],
        expected: {status: 400, body: "{\"errors\":[{\"message\":\"Cannot query field \\\"nope\\\" on type \\\"Entry\\\". Did you mean \\\"name\\\"?\",\"locations\":[{\"line\":1,\"column\":7}]}]}"}
    },
    resolverError: {
        request: [{query: '{fails{value}}'}],
        expected: {status: 200, body: "{\"errors\":[{\"message\":\"resolver failed\",\"locations\":[{\"line\":1,\"column\":2}],\"path\":[\"fails\"]}],\"data\":{\"fails\":null}}"}
    },
    partialResult: {
        request: [{query: '{list{value} fails{value}}'}],
        expected: {status: 200, body: "{\"errors\":[{\"message\":\"resolver failed\",\"locations\":[{\"line\":1,\"column\":14}],\"path\":[\"fails\"]}],\"data\":{\"list\":[{\"value\":\"a\"},{\"value\":\"b\"}],\"fails\":null}}"}
    },
    unknownOperation: {
        request: [{query: 'query a{list{value}}', operationName: 'b'}],
        expected: {status: 500, body: "{\"errors\":[{\"message\":\"Unknown operation named \\\"b\\\".\"}]}"}
    },
    twoOperationsWithoutName: {
        request: [{query: 'query a{list{value}} query b{list{value}}'}],
        expected: {status: 500, body: "{\"errors\":[{\"message\":\"Must provide operation name if query contains multiple operations.\"}]}"}
    },
    missingQuery: {
        request: [{variables: {}}],
        expected: {status: 400, body: "{\"errors\":[{\"message\":\"Must provide query string.\"}]}"}
    },
    queryInUrl: {
        request: [{}, '?query=' + encodeURIComponent('{list{value}}')],
        expected: {status: 200, body: "{\"data\":{\"list\":[{\"value\":\"a\"},{\"value\":\"b\"}]}}"}
    },
    rawGraphqlBody: {
        request: ['{list{name}}', '', 'application/graphql'],
        expected: {status: 200, body: "{\"data\":{\"list\":[{\"name\":\"A\"},{\"name\":null}]}}"}
    },
    formEncoded: {
        request: ['query=' + encodeURIComponent('{list{value}}'), '', 'application/x-www-form-urlencoded'],
        expected: {status: 200, body: "{\"data\":{\"list\":[{\"value\":\"a\"},{\"value\":\"b\"}]}}"}
    }
}

describe('graphql handler', () => {
    let server, port
    beforeAll(() => new Promise(done => {
        const app = express()
        app.use(bodyParser.json())
        app.use(express.urlencoded({extended: true}))
        app.post('/graphql', (req, res) => executeGraphqlRequest(req, res, {schema, rootValue, formatError}))
        server = app.listen(0, () => {
            port = server.address().port
            done()
        })
    }))
    afterAll(() => server.close())

    const call = ([body, queryString = '', type = 'application/json']) => new Promise(resolve => {
        const req = http.request({port, path: '/graphql' + queryString, method: 'POST', headers: {'content-type': type}}, res => {
            let data = ''
            res.on('data', d => data += d)
            res.on('end', () => resolve({status: res.statusCode, type: res.headers['content-type'], body: data}))
        })
        req.end(typeof body === 'string' ? body : JSON.stringify(body))
    })

    for (const [name, {request, expected}] of Object.entries(cases)) {
        it(`same answer as express-graphql: ${name}`, async () => {
            const result = await call(request)
            assert.strictEqual(result.status, expected.status)
            assert.strictEqual(result.type, 'application/json; charset=utf-8')
            assert.strictEqual(result.body, expected.body)
        })
    }
})
