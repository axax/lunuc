import GenericResolver from 'api/resolver/generic/genericResolver'
import Cache from 'util/cache'

const UtilCms = {
    resolveData: async (db, context, dataResolver) => {
        const results = {}

        if (!dataResolver) return results

        try {
            const json = JSON.parse(dataResolver)

            for (let i = 0; i < json.length; i++) {
                const {c, f, l, o} = json[i]
                const cacheKey = (c+f+l+o)
                /*const cachedResult = Cache.get(cacheKey)
                if( cachedResult ){
                    results[c] = cachedResult
                }else {*/
                    const result = await GenericResolver.entities(db, context, c, f, {limit: l, offset: o})
                    results[c] = result
                   /* Cache.set(cacheKey,result,10000)
                }*/

            }
        }catch (e){
            results.error = e.message
        }
        return results
    }
}

export default UtilCms