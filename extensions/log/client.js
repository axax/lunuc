import React from 'react'
import Hook from 'util/hook.cjs'
import {getTypeQueries} from 'util/types.mjs'
import {client} from 'client/middleware/graphql'

const sendError = ({location, message, meta}) =>{

    const queries = getTypeQueries('Log')
    return client.mutate({
        mutation: queries.create,
        variables: {
            location,
            type:'error',
            message,
            meta: JSON.stringify({
                agent: navigator.userAgent,
                href: window.location.href,
                parser: window._lunucWebParser,
                ...meta
            })
        }
    })

}
export default () => {
    // other js error
    window.addEventListener('error', (e) => {
        // Script error ohne Details = cross-origin oder Extension → ignorieren
        if (e.message === 'Script error.' && !e.filename && e.lineno === 0) return
        sendError({
            location:'window',
            message: [
                e.message,
                'URL: ' + e.filename,
                'Line: ' + e.lineno + ', Column: ' + e.colno,
                'Stack: ' + (e.error && e.error.stack || '(no stack trace)')
            ].join('\n')
        })
    })

    _app_.sendError = sendError

    // CSP violation error
    document.addEventListener("securitypolicyviolation", (e) => {
        sendError({
            location:'securitypolicyviolation',
            message: [
                'blockedURI: ' + e.blockedURI,
                'violatedDirective: ' + e.violatedDirective,
                'originalPolicy: ' + e.originalPolicy
            ].join('\n')
        })
    })

    // add routes for this extension
    Hook.on('JsonDomError', ({error, editMode, slug}) => {
        if (!editMode && error) {
            sendError({
                location:'JsonDom',
                message: error.type + ': ' + (error.e ? error.e.message + '\n\n' + error.e.stack : error.msg),
                meta:{
                    slug: slug,
                    ...error.meta
                }
            })
        }
    })


    Hook.on('JsonDomStyleError', ({error, style, editMode, slug}) => {
        if (!editMode && error) {
            sendError({
                location:'JsonDomStyle',
                message: error.message + '\n\n' + error.stack,
                meta:{
                    slug,
                    style
                }
            })
        }
    })

    // add routes for this extension
    Hook.on('AsyncError', ({error}) => {
        sendError({
            location:'Async',
            message: error.message + '\n\n' + error.stack
        })
    })

    // add routes for this extension
    Hook.on('dispatcherAddError', (payload) => {
        if(payload.meta && payload.meta.query && payload.meta.variables) {
            if(payload.meta.query.startsWith('mutation createLog')) return

            sendError({
                location: 'dispatcherAddError',
                message: payload.msg,
                meta: payload.meta,
                type: payload.key
            })
        }
    })
}
