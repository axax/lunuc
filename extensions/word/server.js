import Hook from 'util/hook'
import schema from './schema/'
import resolver from './resolver/'
import genSchema from './gensrc/schema'
import genResolver from './gensrc/resolver'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    const newResolvers = resolver(db)

    for (const n in newResolvers) {
        resolvers[n] = newResolvers[n]
    }

    const newGenResolvers = genResolver(db)

    for (const n in newGenResolvers) {
        resolvers[n] = newGenResolvers[n]
    }
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
    schemas.push(genSchema)
})


Hook.on('cmsCustomResolver', ({resolver, resolvedData}) => {
    resolvedData.test = 'test custom resolver'
})