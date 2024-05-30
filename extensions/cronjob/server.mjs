import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import cron from 'node-cron'
import cronjobUtil from './cronjobUtil.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'

let registeredCronJobs = []
let cronJobQueue = []
let isQueueProcessing = false
const processCronJobQueue = async (job) => {
    cronJobQueue.push(job)
    if (!isQueueProcessing) {
        isQueueProcessing = true
        while (cronJobQueue.length > 0) {

            await new Promise(resolve => {
                cronjobUtil.runCronJob(cronJobQueue[0], resolve)
            })

            cronJobQueue.shift()
        }
        isQueueProcessing = false
    }
}

const registerCronJobs = async (db) => {
    const cronJobs = (await db.collection('CronJob').find({active: true}).toArray())
    cronJobs.forEach(cronJob => {
        if (cronJob.expression && (!cronJob.execfilter || Util.execFilter(cronJob.execfilter))) {

            console.log(`register cronjob ${cronJob.name}`)
            const task = cron.schedule(cronJob.expression, () => {

                console.log('_________________________________________')
                console.log('Run CronJob: ' +cronJob.name)
                console.log('_________________________________________')

                const context = {lang: 'en', id: cronJob.createdBy, username: 'unknown'}

                processCronJobQueue({
                    cronjobId: cronJob._id,
                    script: cronJob.script,
                    noEntry: cronJob.noEntry,
                    context,
                    db
                })

            })

            registeredCronJobs.push(task)
        }
    })
}


const unregisterCronJobs = (db) => {

    for(let i = registeredCronJobs.length-1; i>=0; i--){
        console.log(`stop job`)
        registeredCronJobs[i].stop()
        delete registeredCronJobs[i]
    }

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
