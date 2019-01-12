import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import cron from 'node-cron'
import cronjobUtil from './cronjobUtil'

let registeredCronJobs = []

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
                cronjobUtil.runScript({cronjobId: cronJob._id, script: cronJob.script, context, db})

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
    const newResolvers = {...resolverGen(db), ...resolver(db)}

    // add new resolvers
    for (const n in newResolvers) {
        resolvers[n] = newResolvers[n]
    }
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
