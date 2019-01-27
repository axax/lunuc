import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import Hook from 'util/hook'
import Util from 'api/util'
import Cache from 'util/cache'
import {
    CAPABILITY_MANAGE_KEYVALUES
} from 'util/capabilities'

const UtilCms = {
    getCmsPage: async (db, context, slug, _version) => {
        const userIsLoggedIn = Util.isUserLoggedIn(context)
        const cacheKey = 'cmsPage' + slug + userIsLoggedIn
        let cmsPages
        if (!userIsLoggedIn) {
            // get page from cache
            cmsPages = Cache.get(cacheKey)
        }
        if (!cmsPages) {
            let match
            if (!userIsLoggedIn) {
                // if no user only match public entries
                match = {$and: [{slug}, {public: true}]}
            } else {
                match = {slug}
            }
            cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver', 'ssr', 'public', 'urlSensitiv'], {
                match,
                _version
            })

            // minify template if no user is logged in
            if (!userIsLoggedIn && cmsPages.results && cmsPages.results.length) {

                // TODO: maybe it is better to store the template already minified in the collection instead of minify it here
                console.log(cmsPages.results[0].template)
                try {
                    cmsPages.results[0].template = JSON.stringify(JSON.parse(cmsPages.results[0].template), null, 0)
                } catch (e) {
                }
            }
            Cache.set(cacheKey, cmsPages, 60000) // cache expires in 1 min
        }
        return cmsPages
    },
    resolveData: async (db, context, dataResolver, scope, nosession) => {
        const resolvedData = {_meta: {}}, subscriptions = []

        if (dataResolver) {
            let debugInfo = null
            try {
                let segments = JSON.parse(dataResolver)
                if (segments.constructor === Object) segments = [segments]

                for (let i = 0; i < segments.length; i++) {

                    debugInfo = ''
                    const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope;const {data} = this; return `' + JSON.stringify(segments[i]) + '`;')
                    const replacedSegmentStr = tpl.call({scope, data: resolvedData})
                    const segment = JSON.parse(replacedSegmentStr)
                    if (segment.data) {
                        Object.keys(segment.data).forEach(k => {
                            resolvedData[k] = segment.data[k]
                        })
                    } else if (segment.t) {
                        const {t, f, l, o, p, d} = segment
                        /*
                         f = filter for the query
                         t = type
                         d = the data / fields you want to access
                         l = limit of results
                         o = offset
                         p = page (if no offset is defined, offset is limit * (page -1) )
                         */

                        let type, match
                        if (t.indexOf('$') === 0) {
                            type = t.substring(1)
                            subscriptions.push(type)
                        } else {
                            type = t
                        }

                        // restriction = if it is set to 'user' only entries that belongs to the user are returned
                        if (segment.restriction && segment.restriction === 'user') {
                            match = {createdBy: ObjectId(context.id)}
                        } else {
                            match = {}
                        }

                        debugInfo += ' type=' + type
                        const result = await GenericResolver.entities(db, context, type, d, {
                            filter: f,
                            limit: l,
                            page: p,
                            offset: o,
                            match,
                            projectResult: true
                        })
                        debugInfo += ' result=true'

                        resolvedData[segment.key || type] = result
                    } else if (segment.eval) {
                        debugInfo += ' in eval'
                        try {
                            const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
                            tpl.call({data: resolvedData, scope, context})
                        } catch (e) {
                            if (!segment.ignoreError)
                                throw e
                        }
                    } else if (segment.system) {
                        const system = Util.systemProperties()
                        resolvedData._meta.system = segment.key || 'system'
                        resolvedData[resolvedData._meta.system] = system
                    } else if (segment.keyValueGlobals) {
                        const match = {key: {$in: segment.keyValueGlobals}}

                        // if user don't have capability to manage keys he can only see the public ones
                        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)) {
                            match.ispublic = true
                        }

                        const result = await GenericResolver.entities(db, context, 'KeyValueGlobal', ['key', 'value'], {
                            match
                        })
                        const map = {}
                        if (result.results) {
                            result.results.map(entry => {
                                console.log(entry)
                                try {
                                    map[entry.key] = JSON.parse(entry.value)
                                } catch (e) {
                                    map[entry.key] = entry.value
                                }
                            })
                        }
                        resolvedData._meta.keyValueGlobalKey = segment.key || 'keyValueGlobals'
                        resolvedData[resolvedData._meta.keyValueGlobalKey] = map
                    } else if (segment.keyValues) {

                        const map = {}

                        if (Util.isUserLoggedIn(context)) {
                            const match = {createdBy: ObjectId(context.id), key: {$in: segment.keyValues}}
                            const result = await GenericResolver.entities(db, context, 'KeyValue', ['key', 'value'], {
                                match
                            })

                            if (result.results) {
                                result.results.map(entry => {
                                    try {
                                        map[entry.key] = JSON.parse(entry.value)
                                    } catch (e) {
                                        map[entry.key] = entry.value
                                    }
                                })
                            }
                        } else if (nosession) {
                            let nosessionJson
                            try {
                                nosessionJson = JSON.parse(nosession)
                            } catch (e) {
                                nosessionJson = {}
                            }
                            segment.keyValues.forEach(key => {
                                if (nosessionJson[key]) {
                                    try {
                                        map[key] = JSON.parse(nosessionJson[key])
                                    } catch (e) {
                                        map[key] = nosessionJson[key]
                                    }
                                }
                            })
                        }

                        resolvedData._meta.keyValueKey = segment.key || 'keyValues'
                        resolvedData[resolvedData._meta.keyValueKey] = map

                    } else {
                        console.log('call cmsCustomResolver', segment)
                        Hook.call('cmsCustomResolver', {resolvedData, resolver: segment})
                    }

                }
            } catch (e) {
                resolvedData.error = e.message + ' -> scope=' + JSON.stringify(scope) + debugInfo
            }
        }
        return {resolvedData, subscriptions}
    }
}

export default UtilCms