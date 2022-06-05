import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import schema from './schema/index.mjs'
import resolverGen from './gensrc/resolver.mjs'
import resolver from './resolver/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import config from '../../gensrc/config.mjs'

const {LANGUAGES} = config

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
    schemas.push(schemaGen)
})
