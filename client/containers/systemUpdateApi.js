import {client} from '../middleware/graphql'
import Util from 'client/util/index.mjs'

/**
 * Shared by SystemUpdatePanel and SystemRuntimeSection (/admin/system -> Update).
 *
 * silent: while the api restarts every request fails, no error message for each of them.
 * Graphql errors are rejected with "errors", network errors without.
 */
export const isNetworkError = e => !e || !e.errors
export const errorMessage = e => (e && e.error && e.error.message) || (e && e.message) || String(e)
export const formatDate = date => date ? Util.formattedDatetime(date) : ''

export const silentQuery = (query, variables = {}) =>
    client.query({query, variables, fetchPolicy: 'no-cache', silent: true}).then(response => response.data)

export const silentMutation = (mutation, variables = {}) =>
    client.mutate({mutation, variables, silent: true}).then(response => response.data)
