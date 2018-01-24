import GenericResolver from 'api/resolver/generic/genericResolver'
import Cache from 'util/cache'

const UtilCms = {
    resolveData: async (db, context, dataResolver) => {
        const resolvedData = {}, subscriptions = []

        if (dataResolver) {

            try {
                const json = JSON.parse(dataResolver)

                for (let i = 0; i < json.length; i++) {
                    const {t, f, l, o} = json[i]
                    let type
                    if (t.indexOf('$') === 0) {
                        type = t.substring(1)
                        subscriptions.push(type)
                    } else {
                        type = t
                    }
                    //const cacheKey = (c+f+l+o)
                    /*const cachedResult = Cache.get(cacheKey)
                     if( cachedResult ){
                     results[c] = cachedResult
                     }else {*/
                    const result = await GenericResolver.entities(db, context, type, f, {limit: l, offset: o, match:{}})
                    resolvedData[type] = result
                    /* Cache.set(cacheKey,result,10000)
                     }*/

                }
            } catch (e) {
                resolvedData.error = e.message
            }
        }
        return {resolvedData, subscriptions}
    }
}

export default UtilCms