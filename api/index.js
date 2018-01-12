'use strict'

// Use ES6 module syntax with node.js
require('babel-register')

// Entry point for our server
const server = require('./server')

server.start()