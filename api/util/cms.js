import GenericResolver from 'api/resolver/generic/genericResolver'


const UtilCms = {
    resolveData: async (db, context, dataResolver) => {
        if (!dataResolver) return ''
        const results = {}

        try {
            const json = JSON.parse(dataResolver)

            for (let i = 0; i < json.length; i++) {
                const {c, f, l, o} = json[i]
                const result = await GenericResolver.entities(db, context, c, f, {limit: l, offset: o})
                results[c] = result

            }
        }catch (e){
            results.error = e.message
        }
        return results
    }
}

export default UtilCms