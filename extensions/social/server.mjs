import Hook from '../../util/hook.cjs'
import schema from './schema/'
import resolver from './resolver/'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})
