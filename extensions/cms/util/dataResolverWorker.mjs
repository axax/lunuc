// extensions/cms/util/dataResolverWorker.mjs
//
// Worker thread for dataResolvers that opt in with {"worker": "<pool>"} on
// their first segment (see dataResolverWorkerPool.mjs). It runs the leading
// "pure" segments (data, _data, eval, reduce, keyValueGlobals) with exactly
// the same code as the api thread (dataResolverCore.mjs) and keeps its own
// cache - so large KeyValueGlobals (e.g. a big product json) live here and
// not in the heap of the api, and filtering/sorting them does not block the
// api event loop.
//
// Loaded as native ESM (no babel).

import {parentPort, workerData} from 'node:worker_threads'
import config from '../../../gensrc/config.mjs'

// same global as api/index.cjs - several shared modules read it
globalThis._app_ = {
    lang: workerData.appLang || config.DEFAULT_LANGUAGE || 'en',
    ssr: true,
    tr: workerData.appTr || {},
    JsonDom: {},
    start: new Date(),
    config
}

// console.debug only with DEBUG=true in the dynamic config (like api/server.mjs)
const {getDynamicConfig} = await import('../../../util/config.mjs')
const dynamicConfig = getDynamicConfig()
const originalDebug = console.debug
console.debug = (...args) => {
    if (dynamicConfig.DEBUG) {
        originalDebug(...args)
    }
}

const Cache = (await import('../../../util/cache.mjs')).default
const core = await import('./dataResolverCore.mjs')
const {prepareForTransfer, UnsupportedTransferError} = await import('./dataResolverTransfer.mjs')

const POOL = workerData.poolName || 'default'

// the db connection of this worker failed: not a data error, the api thread
// (which has its own, working connection) resolves the request instead
class WorkerDbError extends Error {}

/* db connection (lazy, own connection of this thread) */
let dbPromise = null
const getDb = () => {
    if (!dbPromise) {
        dbPromise = (async () => {
            const {MONGO_URL, dbConnection} = await import('../../../api/database.mjs')
            return await new Promise((resolve, reject) => {
                dbConnection(MONGO_URL, (err, db) => err ? reject(err) : resolve(db))
            })
        })()
        dbPromise.catch(() => {
            dbPromise = null // retry with the next request
        })
    }
    return dbPromise
}

/**
 * Same loop as resolveData, restricted to the pure segment types. Stops at
 * the first segment of another type and hands it (already templated) back
 * to the api thread, which continues from there.
 */
const runSegments = async ({segments, scope, context, editmode, dynamic, startTime, resolvedData, subscriptions, timings}) => {
    for (let i = 0; i < segments.length; i++) {
        const mark = timings ? {index: i, key: segments[i].key, startAbs: performance.timeOrigin + performance.now()} : null

        const debugLog = []
        const startTimeSegment = Date.now()

        const segment = core.templateSegment(segments[i], {scope, resolvedData, context, editmode, dynamic})

        if (segment.if === false || segment.if === 'false') {
            if (mark) timings.push(mark)
            if(segment.debug){
                debugLog.push({type:'info', message:'segment is skipped because if is false'})
                core.addDebugInfos(resolvedData, segment, startTime, startTimeSegment, debugLog)
            }
            continue
        }

        const kind = core.segmentKind(segment)
        if (!core.WORKER_SEGMENT_KINDS.has(kind)) {
            // the api thread takes over from here (its own timing mark)
            return {nextIndex: i, nextSegment: segment}
        }
        if (mark) timings.push(mark)

        if (kind === '_data') {
            resolvedData._data = segment._data
        } else if (kind === 'data') {
            core.resolveDataSegment(segment, resolvedData)
        } else if (kind === 'eval') {
            core.resolveEvalSegment(segment, resolvedData, scope, context)
        } else if (kind === 'reduce') {
            core.resolveReduceSegment(segment, resolvedData, debugLog)
        } else if (kind === 'keyValueGlobals') {
            let db
            try {
                db = await getDb()
            } catch (e) {
                throw new WorkerDbError(e.message)
            }
            await core.resolveKeyValueGlobalsSegment({segment, db, context, resolvedData, subscriptions})
        }

        if(segment.debug){
            core.addDebugInfos(resolvedData, segment, startTime, startTimeSegment, debugLog)
        }
    }
    return {nextIndex: segments.length, nextSegment: null}
}

const handleRun = async (msg) => {
    const {id, dataResolver, scope, context, editmode, dynamic, startTime, wantTimings} = msg
    const resolvedData = {_meta: {}}, subscriptions = []
    const timings = wantTimings ? [] : null
    let next = {nextIndex: 0, nextSegment: null}, error = null
    try {
        let segments = JSON.parse(dataResolver)
        if (segments.constructor === Object) segments = [segments]
        next = await runSegments({segments, scope, context, editmode, dynamic, startTime, resolvedData, subscriptions, timings})
    } catch (e) {
        if (e instanceof WorkerDbError) {
            parentPort.postMessage({id, unsupported: 'db not available: ' + e.message})
            return
        }
        error = {message: e.message, stack: e.stack}
    }

    let prepared
    try {
        prepared = prepareForTransfer({resolvedData, subscriptions, nextSegment: next.nextSegment})
    } catch (e) {
        parentPort.postMessage({id, unsupported: e instanceof UnsupportedTransferError ? e.message : String(e)})
        return
    }
    try {
        parentPort.postMessage({
            id,
            result: prepared.value,
            hasObjectIds: prepared.hasObjectIds,
            nextIndex: next.nextIndex,
            timings,
            error
        })
    } catch (e) {
        // e.g. DataCloneError
        parentPort.postMessage({id, unsupported: e.message})
    }
}

parentPort.on('message', (msg) => {
    if (!msg) return
    if (msg.type === 'clear') {
        // cache invalidation forwarded from the api thread
        try {
            Cache.clearStartWith(msg.prefixes)
        } catch (e) {
            console.warn(`[dataResolverWorker:${POOL}] cache clear failed`, e)
        }
    } else if (msg.type === 'run') {
        handleRun(msg).catch(e => {
            try {
                parentPort.postMessage({id: msg.id, unsupported: 'worker error: ' + e.message})
            } catch (e2) {
                // ignore
            }
        })
    }
})

parentPort.postMessage({ready: true})
