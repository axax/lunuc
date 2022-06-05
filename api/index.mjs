import './util/localStorage.js'
import config from '../gensrc/config.mjs'


const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))


globalThis.fetch = fetch
globalThis.window = {location:{href:'',origin: ''}}

// define some global vars for server side rendering
global.document = {documentElement: {}, referrer:''}
global._app_ = {lang: config.DEFAULT_LANGUAGE || 'en', ssr: true, es6Module:true, tr: {}, JsonDom: {}, start: new Date(), config}

// Entry point for our server
import('./server.mjs').then(server=>{
    server.start()
})

