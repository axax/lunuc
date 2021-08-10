'use strict'

// Use ES6 module syntax with node.js
require("@babel/register")({
    plugins: [
        "@babel/plugin-transform-runtime",
        "dynamic-import-node",
        [
            "css-modules-transform",
            {
                "preprocessCss": "api/render/preprocessor.js",
                "extensions": [
                    ".css",
                    ".less"
                ]
            }
        ]
    ]
})
const config = require('../gensrc/config').default

// define some global vars for server side rendering
global.document = {documentElement: {}}
global._app_ = {lang: config.DEFAULT_LANGUAGE || 'en', ssr: true}

// Entry point for our server
const server = require('./api/server')
server.start()


require('./server/server')




/*const exec = require('child_process').exec
const childApi = exec('npm run api')
const childServer = exec('npm run client')

childApi.stderr.pipe(process.stderr)
childApi.stdout.pipe(process.stdout)

childServer.stderr.pipe(process.stderr)
childServer.stdout.pipe(process.stdout)*/
