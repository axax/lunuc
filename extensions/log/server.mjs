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


let uncaughtExceptionCount=0, unhandledRejectionCount=0
process.on('uncaughtException', async (error, origin) => {

    if(error?.stack?.indexOf('imap-composer.js')>=0) {
        //ignore
    }else{
        uncaughtExceptionCount++
    }

    if(mydb && error) {
        // A failing write here would raise a fresh unhandledRejection, which
        // feeds the counter below and can drive the process into process.exit(1)
        // on the logger's account rather than on the original error's.
        try {
            await GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
                type: 'uncaughtException',
                message: (error.message?error.message + '\n\n' + error.stack:JSON.stringify(error))+'\n\n'+origin,
                meta: {debug:error.debugData, globalDebug: _app_.errorDebug, systemName: os.hostname()}
            })
        } catch (logError) {
            console.error('log: could not persist uncaughtException', logError.message)
        }
    }


    if(uncaughtExceptionCount>20){
        process.exit(1)
    }

})


process.on('unhandledRejection', async (error) => {
    console.error(error)

    unhandledRejectionCount++
    if(mydb && error) {
        // Without this catch a failing write turns into another
        // unhandledRejection, re-entering this very handler.
        try {
            await GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
                type: 'unhandledRejection',
                message: error.message?error.message + '\n\n' + error.stack:JSON.stringify(error),
                meta: error.debugData
            })
        } catch (logError) {
            console.error('log: could not persist unhandledRejection', logError.message)
        }
    }

    if(unhandledRejectionCount>10){
        process.exit(1)
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

Hook.on('typeLoaded', async ({type,cacheKey,db, req, context, result, dataQuery, collectionName, aggregateTime, queryTime}) => {

  if(aggregateTime > 1000) {

      // 'queryPlanner' MUST be passed explicitly: without a verbosity the driver
      // sends allPlansExecution, which re-runs the pipeline for EVERY candidate
      // plan. On an already slow query that is the most expensive thing the
      // server can be asked to do - it was turning slow searches into OOMs.
      // queryPlanner does not execute anything and still shows the chosen index.
      const explanation = await db.collection(collectionName)
          .aggregate(dataQuery, {allowDiskUse: true}).explain('queryPlanner')

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
      const findings = analyseQueryPlan(explanation, dataQuery, {documentCount})

      const headers =  req.headers || {}

      const host = getHostFromHeaders(headers)
      //const stackTrace = Error().stack.substring(6).replace(/\n/g,'').split('    at ').filter(n => n.trim())


      await GenericResolver.createEntity(mydb, {context}, 'Log', {
          location: collectionName,
          type: 'slowQuery',
          message: JSON.stringify(explanation, null, 2),
          meta: {
              aggregateTime,
              queryTime,
              findings,
              documentCount,
              resultCount: result.results.length,
              resultTotal: result.total,
              type,
              host,
              cacheKey,
              agent: headers[TRACK_USER_AGENT_HEADER] || headers['user-agent'] || '',
              referer: headers[TRACK_REFERER_HEADER] || headers['referer'] || '',
              query: toLoggableQuery(dataQuery)
          }
      })
  }
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
