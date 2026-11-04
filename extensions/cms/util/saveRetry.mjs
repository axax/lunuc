/*
 * Automatic retry of a failed cms page save.
 *
 * Only failures where the server did not answer are retried (no connection, timeout, gateway error).
 * A graphql error (conflict, missing permission, validation) is an answer of the server: a retry would
 * get the same answer, so it is never retried.
 *
 * A retry is safe: saveCmsPage keeps the unsaved values and sends complete values (no increments).
 * If the first request did reach the server and only the answer got lost, the server already has the
 * same value, which checkCmsPageConflicts does not count as conflict.
 */

// NetworkStatus.error of client/middleware/graphql.js (a graphql error has NetworkStatus.ready)
const NETWORK_STATUS_ERROR = 8

export const SAVE_RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000]
export const SAVE_RETRY_MAX = 10

export const isRetryableSaveError = (error) => {
    if (!error || typeof error !== 'object') {
        return false
    }
    // intentional abort (e.g. unmount)
    if (error.aborted) {
        return false
    }
    return error.networkStatus === NETWORK_STATUS_ERROR
}

/**
 * delay before retry number `attempt` (0 based), the last delay is repeated
 */
export const getSaveRetryDelay = (attempt) => {
    const idx = Math.max(0, Math.min(attempt | 0, SAVE_RETRY_DELAYS.length - 1))
    return SAVE_RETRY_DELAYS[idx]
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false
