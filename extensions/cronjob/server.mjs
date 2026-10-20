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
/*
 Queue for scheduled cronjobs.
 - a cronjob is queued at most once (further ticks while it is queued are dropped)
 - the same cronjob never runs twice in parallel
 - up to CRONJOB_CONCURRENCY different cronjobs run at the same time
   (LUNUC_CRONJOB_CONCURRENCY, default 2, 1 = strictly one after another as before)
 */
const envConcurrency = parseInt(process.env.LUNUC_CRONJOB_CONCURRENCY)
const CRONJOB_CONCURRENCY = isNaN(envConcurrency) ? 2 : Math.max(1, envConcurrency)
const cronJobQueue = []           // runners waiting to be started
const queuedCronJobIds = new Set() // ids in cronJobQueue
const activeCronJobIds = new Set() // ids started from the queue and not yet ended

const processCronJobQueue = (job) => {
    const id = job.cronjobId ? job.cronjobId.toString() : ''
    if (queuedCronJobIds.has(id)) {
        console.log(`cronjob ${id} is already queued - skip this run`)
        return
    }
    queuedCronJobIds.add(id)
    cronJobQueue.push(job)
    startQueuedCronJobs()
}

const startQueuedCronJobs = () => {
    for (let i = 0; i < cronJobQueue.length && activeCronJobIds.size < CRONJOB_CONCURRENCY;) {
        const job = cronJobQueue[i]
        const id = job.cronjobId ? job.cronjobId.toString() : ''
        if (activeCronJobIds.has(id)) {
            // previous run of the same job is still active -> keep it queued
            i++
            continue
        }
        cronJobQueue.splice(i, 1)
        queuedCronJobIds.delete(id)
        activeCronJobIds.add(id)

        let done = false
        const finish = () => {
            if (done) {
                return
            }
            done = true
            activeCronJobIds.delete(id)
            startQueuedCronJobs()
        }
        Promise.resolve(cronjobUtil.runCronJob(job, finish)).catch(e => {
            console.error(`Error in cronjob ${id}`, e)
            finish()
        })
    }
}

function createCronjobRunner(cronJob, db) {
    return {
        cronjobId: cronJob._id,
        script: cronJob.script,
        noEntry: cronJob.noEntry,
        workerThread: cronJob.workerThread,
        context: {
            lang: 'en',
            id: cronJob.createdBy ? cronJob.createdBy.toString() : '',
            username: 'unknown'
        },
        db
    }
}

const registerCronJobs = async (db, startup) => {
    const cronJobs = (await db.collection('CronJob').find({active: true}).toArray())
    cronJobs.forEach(cronJob => {
        if (cronJob.expression && (!cronJob.execfilter || Util.execFilter(cronJob.execfilter))) {
            if(cronJob.expression==='STARTUP'){
                if(startup) {
                    console.log(`run cronjob ${cronJob.name} on startup`)
                    cronjobUtil.runCronJob(createCronjobRunner(cronJob, db))
                }
            }else {
                console.log(`register cronjob ${cronJob.name}`)
                const task = cron.schedule(cronJob.expression, () => {

                    console.log('_________________________________________')
                    console.log('Run CronJob: ' + cronJob.name)
                    console.log('_________________________________________')

                    processCronJobQueue(createCronjobRunner(cronJob, db))

                })

                registeredCronJobs.push(task)
            }
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
    cronjobUtil.cleanupStaleExecutions(db)
    registerCronJobs(db, true)
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_CronJob', ({db, result}) => {
    unregisterCronJobs()
    registerCronJobs(db)
})
