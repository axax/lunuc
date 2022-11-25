import Util from 'api/util/index.mjs'
import GenericResolver from 'api/resolver/generic/genericResolver.mjs'

export const typeResolver = async ({segment, resolvedData, scope, db, req, context, subscriptions, debugInfo}) => {
    const {t, f, l, o, g, p, d, s, $if, cache, includeCount, resultFilter, ...other} = segment
    /*
     f = filter for the query
     t = type
     s = sort
     d = the data / fields you want to access
     l = limit of results
     o = offset
     g = group
     p = page (if no offset is defined, offset is limit * (page -1) )

     cache = defines cache policy
     includeCount = whether to return the total number of results
     */

    if ($if) {
        // check condition
        try {
            const tpl = new Function(`const {${Object.keys(scope).join(',')}} = this.scope;const {data} = this;return ${$if}`)
            if (!tpl.call({scope, data: resolvedData})) {
                return
            }
        } catch (e) {
            console.log(e, scope)
        }
    }
    let fields
    if (d && d.constructor === String) {
        try {
            fields = Function(`const {${Object.keys(scope).join(',')}} = this.scope;const {data} = this;return ${d}`).bind({
                scope,
                data: resolvedData
            })()
        } catch (e) {
            if (!segment.ignoreError)
                throw e
        }
    } else {
        fields = d
    }

    let type, match
    if (t.indexOf('$') === 0) {
        type = t.substring(1)
        subscriptions.push({type, callback: false, autoUpdate: segment.key || type})
    } else {
        type = t
    }

    // restriction = if it is set to 'user' only entries that belongs to the user are returned
    if (segment.restriction) {
        const restriction = segment.restriction.constructor === String ? {type: segment.restriction} : segment.restriction
        match = await Util.getAccessFilter(db, context, restriction)
    } else {
        match = {}
    }
    debugInfo.message = ' type=' + type
    const result = await GenericResolver.entities(db, {headers: req.headers, context}, type, fields, {
        filter: f,
        resultFilter,
        limit: l,
        page: p,
        sort: s,
        offset: o,
        group: g,
        match,
        cache,
        includeCount,
        projectResult: true,
        postConvert: false,
        ...other,
    })
    debugInfo.message += ' result=true'

    resolvedData[segment.key || type] = result
}