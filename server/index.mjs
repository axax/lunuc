/*'use strict'

// Use ES6 module syntax with node.js
require('@babel/register')({
    presets: ['@babel/preset-env'],
    plugins: ['@babel/plugin-transform-runtime']
})


// Entry point for our server
require('./server')*/

global._app_ = {start: new Date()}

import './server.mjs'
