import Hook from 'util/hook'
import genSchema from './gensrc/schema'
import genResolver from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, genResolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(genSchema)
})
