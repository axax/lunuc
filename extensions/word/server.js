import Hook from 'util/hook'
import schema from './schema/'
import resolver from './resolver/'
import genSchema from './gensrc/schema'
import genResolver from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), genResolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
    schemas.push(genSchema)
})
