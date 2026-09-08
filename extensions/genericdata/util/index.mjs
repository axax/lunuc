import Cache from '../../../util/cache.mjs'
import {ObjectId} from 'mongodb'

// How long a definition (including its structure) stays cached. Note that an
// edit to a GenericDataDefinition therefore takes up to this long to take
// effect on a running server.
const DEFINITION_CACHE_TTL_MS = 86400000 // 24 hours

// findOne returns null for a definition that does not exist, and null is a
// perfectly cacheable value - so a lookup that happened before the definition
// was created would keep it invisible for a whole day. Negative results get a
// short TTL instead.
const DEFINITION_MISSING_CACHE_TTL_MS = 60000 // 1 minute

export const getGenericTypeDefinitionWithStructure = async (db, {name, id}) => {

    if (!id && !name) {
        return
    }


    const cacheKeyPrefix = 'GenericDataDefinition-WithStructure-', cacheKey = cacheKeyPrefix + (id ? id : name)

    let definition = Cache.get(cacheKey)
    if (definition === undefined) {
        definition = await db.collection('GenericDataDefinition').findOne({$or: [{_id: id && new ObjectId(id)}, {name}]})

        // Only reached on a cache miss. If this line shows up on every request,
        // the cache is not working and each query pays an extra findOne.
        console.log(
            `GenericDataDefinition cache miss for ${id ? `id=${id}` : `name=${name}`} -> ` +
            (definition
                ? `${definition.name} (_id=${definition._id}, ${definition.structure?.fields?.length ?? 0} structure fields)`
                : 'not found')
        )

        // put in cache with both name and id as key
        Cache.set(cacheKey, definition, definition ? DEFINITION_CACHE_TTL_MS : DEFINITION_MISSING_CACHE_TTL_MS)
        if (definition) {
            Cache.setAlias(cacheKeyPrefix + (id ? definition.name : definition._id), cacheKey)
        }
    }

    return definition
}
