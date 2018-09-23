import Hook from 'util/hook'
import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import cron from 'node-cron'

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
Hook.on('dbready',async ({db}) => {

    const cronJobs = (await db.collection('CronJob').find({active: true}).toArray())
    cronJobs.forEach( cronJob => {
        cron.schedule(cronJob.expression, () => {

            const tpl = new Function(cronJob.script)
            const result = tpl.call({scope:{}})

            //console.log(result);
        })
    })
})
