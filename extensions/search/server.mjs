import Hook from '../../util/hook.cjs'
import {INDEXED_TYPES} from './util/config.mjs'
import {ensureIndexes, queueReindex, queueRemove, queueDefinition} from './util/sync.mjs'

/*
 Search extension: keeps the collection SearchIndex in sync with GenericData, CmsPage and Media.
 Changes are queued and written a moment later, so saving a document does not wait for the index.
 Changes that bypass the GenericResolver (direct db writes) are picked up by a periodic
 rebuild (cronjob, see util/sync.mjs rebuild with since).
 */

Hook.on('index', ({db}) => {
    ensureIndexes(db)
})

Hook.on('typeCreated', ({type, result, db}) => {
    if (INDEXED_TYPES.includes(type) && result && result._id) {
        queueReindex(db, type, result._id)
    }
})

Hook.on('typeUpdated', ({type, data, db}) => {
    if (!data || !data._id) return
    if (type === 'GenericDataDefinition') {
        // other searchable fields or access rules: reindex all entries of the type
        queueDefinition(db, data._id)
    } else if (INDEXED_TYPES.includes(type)) {
        queueReindex(db, type, data._id)
    }
})

Hook.on('typeDeleted', ({type, ids, db}) => {
    if (INDEXED_TYPES.includes(type)) {
        queueRemove(db, type, ids)
    }
})
