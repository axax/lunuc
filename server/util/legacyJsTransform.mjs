/**
 * ES2017+ -> ES5 conversion of CMS scripts with async/await for very old browsers (e.g. Android 4.4 / Chrome 30).
 * buble (static/legacyjs-buble.js) can't convert async functions, so static/legacyjs.js sends such code to the
 * server (server/util/legacyJs.mjs), which runs this module in a worker thread.
 * The code is a function body (it is executed with new Function), so return outside of a function is allowed and
 * no wrapper is needed: babel helpers (regenerator runtime, ...) are inserted on top of the body.
 */
import babel from '@babel/core'
import presetEnv from '@babel/preset-env'
import {isMainThread, parentPort} from 'worker_threads'

const BABEL_OPTIONS = {
    babelrc: false,
    configFile: false,
    sourceType: 'script',
    comments: false,
    parserOpts: {allowReturnOutsideFunction: true},
    // ie 9 = no ES2015+ at all -> plain ES5 for every old browser
    presets: [[presetEnv, {targets: {ie: '9'}, modules: false}]]
}

export const transformLegacyJs = (code) => babel.transformSync(code, BABEL_OPTIONS).code

if (!isMainThread && parentPort) {
    parentPort.on('message', ({id, code}) => {
        try {
            parentPort.postMessage({id, code: transformLegacyJs(code)})
        } catch (e) {
            parentPort.postMessage({id, error: e.message})
        }
    })
}
