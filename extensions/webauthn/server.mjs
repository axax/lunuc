import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schema from './schema/'
import resolver from './resolver/'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {registerTrs} from '../../util/i18nServer.mjs'
import {translations} from './translations/server.mjs'

registerTrs(translations)


Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})