'use strict'

// Use ES6 module syntax with node.js
require("@babel/register")
require('./util/localStorage')

const fetch = require('node-fetch')
const config = require('../gensrc/config').default

globalThis.fetch = fetch
globalThis.window = {location:{href:'',origin: ''}}

// define some global vars for server side rendering
global.document = {documentElement: {}, referrer:''}
global._app_ = {lang: 'en', ssr: true, tr: {}, JsonDom: {}, start: new Date(), config}

// Entry point for our server
const server = require('./server')

server.start()
