import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import {getTypeQueries} from '../../util/types'
import {client} from '../../client/middleware/graphql'
import GenericResolver from '../../api/resolver/generic/genericResolver'

let mydb
// Hook to add mongodb resolver
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

    if(mydb) {
        GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
            type: 'uncaughtException',
            message: error.message + '\n\n' + error.stack
        })
    }


    if(uncaughtExceptionCount>10){
        process.exit(1)
    }

})


process.on('unhandledRejection', (reason) => {
    console.log(reason)
    unhandledRejectionCount++
    if(mydb) {
        GenericResolver.createEntity(mydb, {context: {lang: 'en'}}, 'Log', {
            type: 'unhandledRejection',
            message: JSON.stringify(reason)
        })
    }

    if(unhandledRejectionCount>10){
        process.exit(1)
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
