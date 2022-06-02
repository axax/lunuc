'use strict'

// Use ES6 module syntax with node.js
require('@babel/register')({
    presets: ['@babel/preset-env']
})
require('./util/localStorage')

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const config = require('../gensrc/config').default

globalThis.fetch = fetch
globalThis.window = {location:{href:'',origin: ''}}

// define some global vars for server side rendering
global.document = {documentElement: {}, referrer:''}
global._app_ = {lang: config.DEFAULT_LANGUAGE || 'en', ssr: true, tr: {}, JsonDom: {}, start: new Date(), config}

// Entry point for our server
const server = require('./server')

server.start()
