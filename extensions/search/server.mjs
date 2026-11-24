import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {isIndexedType} from './util/config.mjs'
import {queueReindex, queueRemove, queueDefinition} from './util/sync.mjs'

/*
 Search extension: keeps the collection SearchIndex (type and indexes in build.json) in sync with
 all types with "searchIndex" in their type definition (build.json). Changes are queued and written a moment later, so saving a document
 does not wait for the index. Changes that bypass the GenericResolver (direct db writes) are picked up
 by a periodic rebuild (cronjob, see util/sync.mjs rebuild with since).
 */

Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

Hook.on('typeCreated', ({type, result, db}) => {
    if (isIndexedType(type) && result && result._id) {
        queueReindex(db, type, result._id)
    }
})

Hook.on('typeUpdated', ({type, data, db}) => {
    if (!data || !data._id) return
    if (type === 'GenericDataDefinition') {
        // other searchable fields or access rules: reindex all entries of the type
        queueDefinition(db, data._id)
    } else if (isIndexedType(type)) {
        queueReindex(db, type, data._id)
    }
})

Hook.on('typeDeleted', ({type, ids, db}) => {
    if (isIndexedType(type)) {
        queueRemove(db, type, ids)
    }
})
