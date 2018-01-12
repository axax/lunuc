import Hook from '../../util/hook'
import schema from './schema/'
import resolver from './resolver/'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    const newResolvers = resolver(db)

    // add new resolvers
    for (const n in newResolvers) {
        resolvers[n] = newResolvers[n];
    }
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})
