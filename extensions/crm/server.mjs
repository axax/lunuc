import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook.cjs'
import {deepMergeToFirst} from 'util/deepMerge.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})
