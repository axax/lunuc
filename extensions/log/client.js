import React from 'react'
import Hook from 'util/hook.cjs'
import {getTypeQueries} from 'util/types.mjs'
import {client} from 'client/middleware/graphql'

export default () => {

    // add routes for this extension
    Hook.on('JsonDomError', ({error, editMode}) => {

        if (!editMode && error) {
            const queries = getTypeQueries('Log')
            return client.mutate({
                mutation: queries.create,
                variables: {
                    location: 'JsonDom',
                    type: 'error',
                    message: error.type + ': ' + (error.e ? error.e.message + '\n\n' + error.e.stack : error.msg),
                    meta: JSON.stringify({
                        agent: navigator.userAgent,
                        href: location.href
                    })
                }
            })
        }
    })

    // add routes for this extension
    Hook.on('AsyncError', ({error}) => {
        const queries = getTypeQueries('Log')
        return client.mutate({
            mutation: queries.create,
            variables: {
                location: 'Async',
                type: 'error',
                message: error.message + '\n\n' + error.stack,
                meta: JSON.stringify({
                    agent: navigator.userAgent,
                    href: location.href
                })
            }
        })
    })
}
