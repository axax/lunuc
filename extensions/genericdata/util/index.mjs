import Cache from '../../../util/cache.mjs'
import {ObjectId} from 'mongodb'

export const getGenericTypeDefinitionWithStructure = async (db, {name, id}) => {

    if (!id && !name) {
        return
    }


    const cacheKeyPrefix = 'GenericDataDefinition-WithStructure-', cacheKey = cacheKeyPrefix + (id ? id : name)

    let definition = Cache.get(cacheKey)
    if (definition === undefined) {
        definition = await db.collection('GenericDataDefinition').findOne({$or: [{_id: id && ObjectId(id)}, {name}]})

        console.log(`load GenericDataDefinition by id=${id} or by name=${name} -> ${definition}`)

        // put in cache with both name and id as key
        Cache.set(cacheKey, definition, 86400000) // cache expires in 100 min
        if (definition) {
            Cache.setAlias(cacheKeyPrefix + (id ? definition.name : definition._id), cacheKey)
        }
    }

    return definition
}
