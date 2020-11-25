import React from 'react'
import Hook from 'util/hook'
import {getTypeQueries} from 'util/types'
import {client} from 'client/middleware/graphql'

export default () => {

    // add routes for this extension
    Hook.on('JsonDomError', ({error, editMode}) => {

        if (!editMode && error) {
            const queries = getTypeQueries('Log')
            return client.mutate({
                mutation: queries.create,
                variables: {
                    agent: navigator.userAgent,
                    href: location.href,
                    location: 'JsonDom',
                    type: 'error',
                    message: error.type +': '+(error.e ? error.e.message + '\n\n' + error.e.stack : error.msg)
                }
            })
        }
    })
}
