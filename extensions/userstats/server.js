import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import createUserStats from './userStats'
import Hook from 'util/hook'


let userStats

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
Hook.on('appready', ({db, app}) => {
    userStats = createUserStats(db)
    app.use(userStats.initialize)
})

// Hook when db is ready
Hook.on('appexit', () => {
    userStats.exit()
})