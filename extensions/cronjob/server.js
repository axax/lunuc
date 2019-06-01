import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import cron from 'node-cron'
import cronjobUtil from './cronjobUtil'
import {deepMergeToFirst} from 'util/deepMerge'

let registeredCronJobs = []
let cronJobQueue = []
let isQueueProcessing = false
const processCronJobQueue = async (job) => {
    cronJobQueue.push(job)
    if (!isQueueProcessing) {
        isQueueProcessing = true
        while (cronJobQueue.length > 0) {

            await new Promise(resolve => {
                cronjobUtil.runScript(cronJobQueue[0], resolve)
            })

            cronJobQueue.shift()
        }
        isQueueProcessing = false
    }
}

const registerCronJobs = async (db) => {
    const cronJobs = (await db.collection('CronJob').find({active: true}).toArray())
    cronJobs.forEach(cronJob => {

        let match = true
        if (cronJob.execfilter) {
            match = cronjobUtil.execFilter(cronJob.execfilter)
        }

        if (match) {

            registeredCronJobs.push(cron.schedule(cronJob.expression, () => {

                const context = {lang: 'en', id: cronJob.createdBy, username: 'unknown'}

                processCronJobQueue({cronjobId: cronJob._id, script: cronJob.script, context, db})

            }))
        }
    })
}


const unregisterCronJobs = (db) => {
    registeredCronJobs.forEach(job => {
        job.destroy()
    })

    registeredCronJobs = []
}

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})


// Hook when db is ready
Hook.on('appready', ({db}) => {
    registerCronJobs(db)
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_CronJob', ({db, result}) => {
    unregisterCronJobs()
    registerCronJobs(db)
})
