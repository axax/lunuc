import GenericResolver from 'api/resolver/generic/genericResolver'

const UtilCms = {
    resolveData: async (db, context, dataResolver, scope) => {
        const resolvedData = {}, subscriptions = []

        if (dataResolver) {

            try {

                const tpl = new Function('return `' + dataResolver.replace(/\${(?!this\.)/g, '${this.') + '`;')
                const dataResolverReplaced =  tpl.call(scope)
                const json = JSON.parse(dataResolverReplaced)

                for (let i = 0; i < json.length; i++) {
                    const {t, f, l, o,p} = json[i]
                    /*
                    t = type
                    f = fields
                    l = limit of results
                    o = offset
                    p = page (if no offset is defined, offset is limit * (page -1) )
                     */
                    if( t ) {
                        let type
                        if (t.indexOf('$') === 0) {
                            type = t.substring(1)
                            subscriptions.push(type)
                        } else {
                            type = t
                        }
                        const result = await GenericResolver.entities(db, context, type, f, {
                            limit: l,
                            page: p,
                            offset: o,
                            match: {}
                        })
                        resolvedData[type] = result
                    }

                }
            } catch (e) {
                resolvedData.error = e.message
            }
        }
        return {resolvedData, subscriptions}
    }
}

export default UtilCms