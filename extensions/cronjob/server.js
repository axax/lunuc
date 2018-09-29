import Hook from 'util/hook'
import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import cron from 'node-cron'

let registeredCronJobs = []

const registerCronJobs =async (db) => {
    const cronJobs = (await db.collection('CronJob').find({active: true}).toArray())
    cronJobs.forEach( cronJob => {
        registeredCronJobs.push(cron.schedule(cronJob.expression, () => {
            const tpl = new Function('const require = this.require;'+cronJob.script)
            const result = tpl.call({require, db})

        }))
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
    const newResolvers = resolver(db)

    // add new resolvers
    for (const n in newResolvers) {
        resolvers[n] = newResolvers[n]
    }
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})


// Hook when db is ready
Hook.on('dbready',({db}) => {
    registerCronJobs(db)
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_CronJob',({db, result}) => {
    unregisterCronJobs()
    registerCronJobs(db)
})
