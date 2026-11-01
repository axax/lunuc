import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import {clientAddress, getHostFromHeaders} from '../../util/host.mjs'
import config from '../../gensrc/config.mjs'
import os from 'os'
import {
    TRACK_REFERER_HEADER,
    TRACK_USER_AGENT_HEADER
} from '../../api/constants/index.mjs'
import Util from '../../api/util/index.mjs'
import {parseOrElse} from '../../client/util/json.mjs'
import {analyseQueryPlan} from '../../api/util/queryPlanAnalysis.mjs'
import util from 'node:util'
import {SLOW_QUERY_THRESHOLD_MS, shapeKeyOf, claimSlowQueryLog} from './slowQueryThrottle.mjs'
import {getEventLoopDelay, eventLoopFinding} from './eventLoopMonitor.mjs'

let mydb
Hook.on('dbready', ({db}) => {
    mydb=db
})

Hook.on('resolver', ({db, resolvers}) => {
    mydb=db
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


/*
 Process level errors.
 Before, the process exited after 21 uncaught exceptions / 11 unhandled rejections in total (over
 the whole uptime). Anybody who found a request that causes one of them could stop the api with
 a few requests. Now:
 - unhandled rejections are logged only (the process state is not affected)
 - uncaught exceptions end the process only if there are many within a short time
 - at most MAX_DB_LOG_ENTRIES_PER_MINUTE entries per type are written into the db, so an error
   that is triggered by requests can't flood the Log collection
 */
const ERROR_WINDOW_MS = 60 * 1000
const MAX_UNCAUGHT_EXCEPTIONS_PER_WINDOW = 20
const MAX_DB_LOG_ENTRIES_PER_MINUTE = 30

const createWindowCounter = () => {
    let windowStart = 0, count = 0
    return () => {
        const now = Date.now()
        if (now - windowStart > ERROR_WINDOW_MS) {
            windowStart = now
            count = 0
        }
        return ++count
    }
}
const countUncaughtException = createWindowCounter()
const countDbLogUncaught = createWindowCounter()
const countDbLogRejection = createWindowCounter()

process.on('uncaughtException', async (error, origin) => {

    // errors of the imap library are ignored for the exit decision
    const count = error?.stack?.indexOf('imap-composer.js') >= 0 ? 0 : countUncaughtException()

    if(mydb && error && countDbLogUncaught() <= MAX_DB_LOG_ENTRIES_PER_MINUTE) {
        // A failing write here would raise a fresh unhandledRejection.
        try {
            await GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
                type: 'uncaughtException',
                message: (error.message?error.message + '\n\n' + error.stack:JSON.stringify(error))+'\n\n'+origin,
                meta: {
                    ...(error.debugData ? {debug: error.debugData} : {}),
                    inspect: util.inspect(error, {depth: 5, showHidden: true}),
                    systemName: os.hostname()
                }
            })
        } catch (logError) {
            console.error('log: could not persist uncaughtException', logError.message)
        }
    }

    if(count > MAX_UNCAUGHT_EXCEPTIONS_PER_WINDOW){
        console.error(`log: more than ${MAX_UNCAUGHT_EXCEPTIONS_PER_WINDOW} uncaught exceptions within ${ERROR_WINDOW_MS / 1000}s - exit process`)
        process.exit(1)
    }

})


process.on('unhandledRejection', async (error) => {
    console.error(error)

    if(mydb && error && countDbLogRejection() <= MAX_DB_LOG_ENTRIES_PER_MINUTE) {
        // Without this catch a failing write turns into another
        // unhandledRejection, re-entering this very handler.
        try {
            await GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
                type: 'unhandledRejection',
                message: error.message?error.message + '\n\n' + error.stack:JSON.stringify(error),
                meta: {
                    ...(error.debugData ? {debug: error.debugData} : {}),
                    inspect: util.inspect(error, {depth: 5, showHidden: true}),
                    systemName: os.hostname()
                }
            })
        } catch (logError) {
            console.error('log: could not persist unhandledRejection', logError.message)
        }
    }
})



/**
 * Makes a pipeline safe to store and to replay.
 *
 * JSON.stringify turns a RegExp into {} and an ObjectId into a bare hex string,
 * so a logged query silently loses its regex predicates and an ObjectId can no
 * longer be told apart from an ordinary string. Both are rewritten into the
 * forms MongoDB understands - {$regex,$options} is even a valid predicate, so
 * the logged pipeline stays copy-pasteable.
 */
const toLoggableQuery = (value) => {
    if (value === null || value === undefined) return value
    if (Array.isArray(value)) return value.map(toLoggableQuery)
    if (value instanceof RegExp) return {$regex: value.source, $options: value.flags}
    if (value instanceof Date) return {$date: value.toISOString()}
    // BSONRegExp carries pattern/options instead of source/flags
    if (typeof value.pattern === 'string' && typeof value.options === 'string') {
        return {$regex: value.pattern, $options: value.options}
    }
    // ObjectId and anything else BSON that knows its hex form
    if (typeof value.toHexString === 'function') return {$oid: value.toHexString()}
    if (value.constructor === Object) {
        const converted = {}
        for (const key of Object.keys(value)) converted[key] = toLoggableQuery(value[key])
        return converted
    }
    return value
}

// ─── slow query log ──────────────────────────────────────────────────────────
//
// Each entry costs an explain, an estimatedDocumentCount and an insert - and
// slow queries come in bursts exactly when the server is already under load
// (crawlers hitting many pages at once). So:
//   - one entry per query shape and SLOW_QUERY_LOG_INTERVAL_MS; repeats in
//     between are only counted and reported with the next entry (suppressed)
//   - never more than one explain per shape at the same time
//   - the work runs detached: the request that was slow no longer waits for it

const logSlowQuery = async ({claim, db, dataQuery, collectionName, hint, info}) => {
    try {
        // 'queryPlanner' MUST be passed explicitly: without a verbosity the driver
        // sends allPlansExecution, which re-runs the pipeline for EVERY candidate
        // plan. On an already slow query that is the most expensive thing the
        // server can be asked to do - it was turning slow searches into OOMs.
        // queryPlanner does not execute anything and still shows the chosen index.
        const explanation = await db.collection(collectionName)
            .aggregate(dataQuery, hint ? {allowDiskUse: true, hint} : {allowDiskUse: true}).explain('queryPlanner')

        // A collection scan is only worth reporting on a collection big enough for
        // it to hurt. estimatedDocumentCount reads collection metadata and does not
        // touch any document.
        let documentCount
        try {
            documentCount = await db.collection(collectionName).estimatedDocumentCount()
        } catch (e) {
            console.warn(`log: could not count ${collectionName}`, e.message)
        }

        // Turns the plan into concrete hints. Reads the explain that was fetched
        // above - no further query, nothing executed.
        const findings = analyseQueryPlan(explanation, dataQuery, {
            documentCount,
            resultTotal: info.resultTotal,
            resultCount: info.resultCount
        })
        const loopFinding = eventLoopFinding(info.eventLoop, info.queryTime)
        if (loopFinding) findings.unshift(loopFinding)

        await GenericResolver.createEntity(mydb, {context: info.context}, 'Log', {
            location: collectionName,
            type: 'slowQuery',
            message: JSON.stringify(explanation, null, 2),
            meta: {
                aggregateTime: info.aggregateTime,
                queryTime: info.queryTime,
                findings,
                documentCount,
                hint,
                // Node event loop delay around the query - high = the time was lost in Node, not MongoDB
                eventLoop: info.eventLoop,
                // slow runs of the same query shape since the last entry that got no entry of their own
                suppressed: claim.suppressed,
                resultCount: info.resultCount,
                resultTotal: info.resultTotal,
                type: info.type,
                host: info.host,
                cacheKey: info.cacheKey,
                agent: info.agent,
                referer: info.referer,
                query: toLoggableQuery(dataQuery)
            }
        })
    } catch (e) {
        console.error('log: could not write slow query entry', e.message)
    } finally {
        claim.done()
    }
}

Hook.on('typeLoaded', async ({type, cacheKey, db, req, context, result, dataQuery, collectionName, aggregateTime, queryTime, hint}) => {

    if (aggregateTime <= SLOW_QUERY_THRESHOLD_MS || !mydb || type === 'Log') return

    const claim = claimSlowQueryLog(shapeKeyOf(collectionName, dataQuery))
    if (!claim) return

    // Everything the entry needs is read NOW - the response object is changed
    // further (meta, serialisation) after this hook returns.
    const headers = req?.headers || {}
    const info = {
        type, cacheKey, context, aggregateTime, queryTime,
        // read immediately - later the window may no longer cover this query
        eventLoop: getEventLoopDelay(),
        resultCount: result?.results?.length ?? 0,
        resultTotal: result?.total,
        host: getHostFromHeaders(headers),
        agent: headers[TRACK_USER_AGENT_HEADER] || headers['user-agent'] || '',
        referer: headers[TRACK_REFERER_HEADER] || headers['referer'] || ''
    }

    // detached on purpose: the slow request must not also wait for the log entry
    logSlowQuery({claim, db, dataQuery, collectionName, hint, info})
})

/**
 * Failed aggregations from GenericResolver. The report already carries a
 * queryPlanner explain, so nothing is re-executed here.
 */
Hook.on('genericResolverAggregateError', async ({
    label, collection, code, codeName, message, filter, sort, limit, limitCount,
    hint, allowDiskUse, match, plan, planError, type, req, context
}) => {
    // Never log a failure of the Log type itself - that would loop.
    if (!mydb || type === 'Log') return

    const headers = req?.headers || {}

    try {
        await GenericResolver.createEntity(
            mydb,
            {context: context || {lang: config.DEFAULT_LANGUAGE}},
            'Log',
            {
                location: collection,
                type: 'aggregateError',
                message: `[${codeName || code || 'unknown'}] ${message}`,
                meta: {
                    label, type, code, codeName,
                    filter, sort, limit, limitCount, hint, allowDiskUse,
                    match, plan, planError,
                    host: getHostFromHeaders(headers),
                    agent: headers[TRACK_USER_AGENT_HEADER] || headers['user-agent'] || '',
                    referer: headers[TRACK_REFERER_HEADER] || headers['referer'] || '',
                    systemName: os.hostname()
                }
            }
        )
    } catch (e) {
        // The hook is fired synchronously and not awaited, so an unhandled
        // rejection here would land in the unhandledRejection counter above.
        console.error('log: could not persist aggregateError', e.message)
    }
})

Hook.on('typeBeforeCreate', ({type, data, req}) => {
    if (type === 'Log') {
        if (!data.server) {
            data.server = Util.systemProperties().hostname
        }
        const meta = parseOrElse(data.meta,{})

        if(!meta.ip){
            const ip = clientAddress(req)
            if(ip){
                meta.ip = ip
            }
        }
        data.meta = meta
    }
})

Hook.on('OnMailError', async ({db, context, error}) => {

    let finalContent
    if(context){
        finalContent = context
    }else{
        finalContent = {lang: config.DEFAULT_LANGUAGE }
    }

  await GenericResolver.createEntity(db, {context: finalContent}, 'Log', {
      location: 'mailclient',
      type: 'mailError',
      message: error.message,
      meta: {}
  })
})

Hook.on('ExtensionApiError', async ({db, req, error, slug}) => {
  await GenericResolver.createEntity(db, req, 'Log', {
      location: 'extensionApi',
      type: 'apiError',
      message: error.message + '\n' + error.stack,
      meta: {slug, url: req.url}
  })
})

Hook.on('HookError', async ({db, entry, error}) => {
    await GenericResolver.createEntity(db, {context: {lang: 'en'}}, 'Log', {
        location: entry.name,
        type: 'hookError',
        message: error.message ? error.message + '\n\n' + error.stack : JSON.stringify(error),
        meta: {hook: entry.hook}
    })
})

Hook.on('BotError', async ({db, entry, error}) => {
    await GenericResolver.createEntity(db, {context: {lang: 'en'}}, 'Log', {
        location: entry.name,
        type: 'botError',
        message: error.message ? error.message + '\n\n' + error.stack : JSON.stringify(error),
        meta: {}
    })
})

Hook.on('ServerScriptError', async ({slug, methodName, args, error}) => {
    if(mydb) {
        await GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
            location: slug,
            type: 'serverScriptError',
            message: error.message ? error.message + '\n\n' + error.stack : JSON.stringify(error),
            meta: {methodName, args}
        })
    }
})
Hook.on('CronJobError', async ({db, context, scriptLanguage, script, cronjobId, error}) => {
    await GenericResolver.createEntity(db, {context: context}, 'Log', {
        location: cronjobId,
        type: 'cronJobError',
        message: error.message ? JSON.stringify(error.message) : JSON.stringify(error),
        meta: {scriptLanguage, script}
    })

})

Hook.on('invalidLogin', async ({context, db, username, ip, domain}) => {
    await GenericResolver.createEntity(db, {context}, 'Log', {
        location: 'login',
        type: 'invalidLogin',
        message: `invalid login attempt from ${username} with ip ${ip}`,
        meta: {username, ip, domain}
    })
})

Hook.on('graphqlError', async ({db, req, type, errorContext}) => {
    await GenericResolver.createEntity(db, req, 'Log', {
        location: 'graphqlError',
        type: type,
        message: errorContext.message,
        meta: errorContext
    })
})

/*
// add routes for this extension
Hook.on('GlobalError', ({error, db, cronjobId, context}) => {

    GenericResolver.createEntity(db, {context}, 'Log', {
        location: 'CronJob',
        type: 'error',
        message: error.message,
        meta:{cronjobId}
    })

})
*/
