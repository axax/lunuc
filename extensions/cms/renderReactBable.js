'use strict'

// Use ES6 module syntax with node.js
const babelCore = require('@babel/core')
const path = require('path')
const fs = require('fs')

const filename = path.join(path.resolve(),'./extensions/cms/renderReact.mjs')
const { code } = babelCore.transformFileSync(filename)

/*
const filenameOut = path.join(path.resolve(),'./extensions/cms/renderReact.cjs')
fs.writeFileSync(filenameOut, code, 'utf-8')

const renderReact = require(filenameOut)


console.log(renderReact)*/

//const renderReact = module._compile(code,filename)

//console.log(renderReact)

/*require('@babel/register')({
    presets: ['@babel/preset-env']
})*/
//const renderReact =  babel.transformFileSync(path.join(path.resolve(),'./extensions/cms/renderReact.mjs'))
//console.log('cxxc',renderReact)
//module.export = renderReact


/*
require('@babel/register')({
    presets: ['@babel/preset-env']
})
const renderReact = require('./renderReact')
console.log('cxxc',renderReact)*/
/*const renderReact = require('./renderReact.mjs')

module.export = renderReact*/

