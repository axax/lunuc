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

    // add routes for this extension
    Hook.on('AsyncError', ({error}) => {
        sendError({
            location:'Async',
            message: error.message + '\n\n' + error.stack
        })
    })
}
