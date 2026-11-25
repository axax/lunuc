import Cache from '../../../util/cache.mjs'
import Util from '../../../api/util/index.mjs'

/*
 Public read filter of a GenericData type (structure.access.read):

   "access": {"read": {"type": "role", "role": "anonymous", "force": true,
                       "publicFilter": {"data.draft": {"$ne": true}},
                       "except": "manage_types"}}

 publicFilter is a mongodb condition every reader has to meet - also guests and the search - except users with the
 capability "except" (e.g. the editors, who have to see drafts). Without "except" it applies to everybody.

 {"$inRef": {"type": "<GenericData type>", "match": {...}}} inside the filter is replaced by {"$in": [ids]} with the ids of
 the entries of that type matching "match", e.g. only entries of a published report:
   {"data.bericht": {"$inRef": {"type": "ThalGeschaeftsbericht", "match": {"data.status": "published"}}}}
 These ids are cached for REF_CACHE_MS (a newly published report shows up after at most that long). An unknown type
 resolves to no ids, so nothing is readable (safe default).
 */
const REF_CACHE_MS = 60 * 1000
const CACHE_PREFIX = 'GenericDataPublicFilterRef-'

const resolveRefs = async (db, value) => {
    if (Array.isArray(value)) {
        return Promise.all(value.map(v => resolveRefs(db, v)))
    }
    if (!value || value.constructor !== Object) {
        return value
    }
    if (value.$inRef) {
        const {type, match = {}} = value.$inRef
        const cacheKey = CACHE_PREFIX + JSON.stringify(value.$inRef)
        let ids = Cache.get(cacheKey)
        if (!ids) {
            const definition = type ? await db.collection('GenericDataDefinition').findOne({name: type}, {projection: {_id: 1}}) : null
            // references are stored as ObjectId or as string: both are matched
            ids = definition
                ? (await db.collection('GenericData').find({$and: [{definition: definition._id}, match]}, {projection: {_id: 1}}).toArray())
                    .flatMap(d => [d._id, d._id.toString()])
                : []
            Cache.set(cacheKey, ids, REF_CACHE_MS)
        }
        return {$in: ids}
    }
    const result = {}
    for (const key of Object.keys(value)) {
        result[key] = await resolveRefs(db, value[key])
    }
    return result
}

/**
 * The public filter of a type for this user, ready for $match - null if there is none or the user is excepted.
 * @param structure structure of the GenericDataDefinition
 */
export const getPublicReadFilter = async (db, context, structure) => {
    const read = structure && structure.access && structure.access.read
    if (!read || read.constructor !== Object || !read.publicFilter) {
        return null
    }
    if (read.except && await Util.userHasCapability(db, context, read.except)) {
        return null
    }
    return resolveRefs(db, read.publicFilter)
}
