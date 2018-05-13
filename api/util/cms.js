import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'

const UtilCms = {
    resolveData: async (db, context, dataResolver, scope) => {
        const resolvedData = {}, subscriptions = []

        if (dataResolver) {
            let debugInfo = null
            try {
                const tpl = new Function('const {'+Object.keys(scope).join(',')+'} = this; return `' + dataResolver + '`;')
                const dataResolverReplaced =  tpl.call(scope)
                const json = JSON.parse(dataResolverReplaced)

                for (let i = 0; i < json.length; i++) {
                    debugInfo = ''
                    const {t, f, l, o,p, d,restriction} = json[i]
                    /*
                    f = filter for the query
                    t = type
                    d = the data / fields you want to access
                    l = limit of results
                    o = offset
                    p = page (if no offset is defined, offset is limit * (page -1) )
                    restriction = if it is set to "user" only entries that belongs to the user are returned
                     */
                    if( t ) {
                        let type, match
                        if (t.indexOf('$') === 0) {
                            type = t.substring(1)
                            subscriptions.push(type)
                        } else {
                            type = t
                        }

                        if( restriction && restriction === 'user'){
                            match = {createdBy: ObjectId(context.id)}
                        }else{
                            match = {}
                        }

                        debugInfo += ' type='+type
                        const result = await GenericResolver.entities(db, context, type, d, {
                            filter: f,
                            limit: l,
                            page: p,
                            offset: o,
                            match
                        })

                        debugInfo += ' result=true'
                        //TODO: only return fields that are request and remove sensitiv data

                        if( result.results ) {
                            result.results.map(e => {
                                // return only user _id and username
                                if ( e.createdBy ) {
                                    e.createdBy = {_id: e.createdBy._id, username: e.createdBy.username}
                                }
                            })
                        }

                        resolvedData[type] = result
                    }

                }
            } catch (e) {
                resolvedData.error = e.message + ' -> scope='+JSON.stringify(scope)+debugInfo
            }
        }
        return {resolvedData, subscriptions}
    }
}

export default UtilCms