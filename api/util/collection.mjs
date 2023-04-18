import Cache from '../../util/cache.mjs'

export const getCollections = async ({filter, db}) => {
    const cacheKey = 'system-collections-' + filter

    let collections = Cache.get(cacheKey)
    if (!collections) {
        collections = await db.listCollections({name: {$regex: new RegExp(filter), $options: 'i'}}).toArray()
        Cache.set(cacheKey, collections, 86400000) // cache expires in 1 day
    }

    return collections
}