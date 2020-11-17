'use strict'

// Use ES6 module syntax with node.js
require('@babel/register')({
    plugins: ['@babel/plugin-transform-runtime']
})


// Entry point for our server
require('./server')
