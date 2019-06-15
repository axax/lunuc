'use strict'

// Use ES6 module syntax with node.js
require("@babel/register");

// define some global vars for server side rendering
global.document = {documentElement: {}}
global._app_ = {lang: 'en', ssr: true}

// Entry point for our server
const server = require('./server')

server.start()
