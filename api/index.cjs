'use strict'

// Use ES6 module syntax with node.js
require('@babel/register')({
    presets: ['@babel/preset-env'],

  ignore: [/node_modules/]
})
require('./util/localStorage')


const config = require('../gensrc/config').default

globalThis.window = {location:{href:'',origin: ''}}

// define some global vars for server side rendering
global.document = {documentElement: {}, referrer:''}
global._app_ = {lang: config.DEFAULT_LANGUAGE || 'en', ssr: true, tr: {}, JsonDom: {}, start: new Date(), config}

// Entry point for our server
const server = require('./server')

server.start()
