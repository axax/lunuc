import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import GenericResolver from '../../api/resolver/generic/genericResolver'

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
process.on('uncaughtException', (error) => {
    console.log(error)

    uncaughtExceptionCount++

    if(mydb && error) {
        GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
            type: 'uncaughtException',
            message: error.message?error.message + '\n\n' + error.stack:JSON.stringify(error)
        })
    }


    if(uncaughtExceptionCount>10){
        process.exit(1)
    }

})


process.on('unhandledRejection', (error) => {
    console.error(error)

    unhandledRejectionCount++
    if(mydb && error) {
        GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
            type: 'unhandledRejection',
            message: error.message?error.message + '\n\n' + error.stack:JSON.stringify(error)
        })
    }

    if(unhandledRejectionCount>10){
        process.exit(1)
    }
})



Hook.on('typeLoaded', async ({db, context, result, dataQuery, collectionName, aggregateTime}) => {

  if(aggregateTime > 500) {
      const explanation = await  db.collection(collectionName).aggregate(dataQuery, {allowDiskUse: true}).explain()
      GenericResolver.createEntity(mydb, {context}, 'Log', {
          location: collectionName,
          type: 'slowQuery',
          message: JSON.stringify(explanation, null, 2),
          meta: {aggregateTime, resultCount: result.results.length, resultTotal: result.total}
      })
  }
})

Hook.on('HookError', async ({entry, error}) => {
    if(mydb) {
        GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
            location: entry.name,
            type: 'hookError',
            message: error.message ? error.message + '\n\n' + error.stack : JSON.stringify(error),
            meta: {hook: entry.hook}
        })
    }
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
