import Hook from '../../util/hook.cjs'
import genSchema from './gensrc/schema.mjs'
import genResolver from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, genResolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(genSchema)
})
