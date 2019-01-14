import Hook from 'util/hook'
import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})
