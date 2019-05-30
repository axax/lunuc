import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import Hook from 'util/hook'
import Util from 'api/util'
import {getHostFromHeaders} from 'util/host'
import Cache from 'util/cache'
import {
    CAPABILITY_MANAGE_KEYVALUES
} from 'util/capabilities'
import request from 'request-promise'
import {pubsub} from "../../../api/subscription";
import translations from 'gensrc/tr'
import {openInBrowser} from './browser'

const UtilCms = {
    getCmsPage: async ({db, context, slug, editmode, _version, headers}) => {
        const host = getHostFromHeaders(headers)

        const cacheKey = 'cmsPage-' + (_version ? _version + '-' : '') + slug + (host ? '-' + host : '')

        let cmsPages
        if (!editmode) {
            cmsPages = Cache.get(cacheKey)
        }
        if (!cmsPages) {


            let match, hostRule

            const ors = []

            if (host) {
                hostRule = {$regex: `(^|;)${host.replace(/\./g, '\\.')}=${slug}($|;)`, $options: 'i'}
                ors.push({hostRule})
            }


            let tmpSlug = slug
            ors.push({slug})

            if (!Util.isUserLoggedIn(context)) {
                // if no user only match public entries
                match = {$and: [{$or: ors}, {public: true}]}
            } else {
                match = {$or: ors}
            }
            cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'name', 'template', 'script', 'serverScript', 'dataResolver', 'resources', 'ssr', 'public', 'urlSensitiv'], {
                match,
                limit: 1,
                _version
            })

            // minify template if no user is logged in
            if (cmsPages.results && cmsPages.results.length) {

                if (!editmode) {

                    //console.log(template)

                    try {
                        // TODO: Include sub CMS component to reduce number of requests
                        // TODO: also check if template is html

                        const template = JSON.parse(cmsPages.results[0].template)
                        cmsPages.results[0].template = JSON.stringify(template, null, 0)
                    } catch (e) {
                    }
                }
            }
            Cache.set(cacheKey, cmsPages, 600000) // cache expires in 10 min
        }
        return cmsPages
    },
    resolveData: async (db, context, dataResolver, scope, nosession) => {
        const resolvedData = {_meta: {}}, subscriptions = []

        if (dataResolver) {
            let debugInfo = null
            try {
                let segments = JSON.parse(dataResolver),
                    addDataResolverSubsription = false
                if (segments.constructor === Object) segments = [segments]

                for (let i = 0; i < segments.length; i++) {

                    debugInfo = ''

                    let tempBrowser
                    if (segments[i].website) {
                        // exclude pipline from replacements
                        tempBrowser = segments[i].website.pipeline
                        segments[i].website.pipeline = null
                    }
                    const tpl = new Function(`const {${Object.keys(scope).join(',')}} = this.scope
                                              const {data} = this
                                              return \`${JSON.stringify(segments[i])}\``)

                    const replacedSegmentStr = tpl.call({scope, data: resolvedData})
                    const segment = JSON.parse(replacedSegmentStr)


                    if (tempBrowser) {
                        segment.website.pipeline = tempBrowser
                    }


                    if (segment._data) {
                        resolvedData._data = segment._data
                    } else if (segment.data) {
                        Object.keys(segment.data).forEach(k => {
                            resolvedData[k] = segment.data[k]
                        })
                    } else if (segment.t) {
                        const {t, f, l, o, p, d, s, cache, includeCount} = segment
                        /*
                         f = filter for the query
                         t = type
                         s = sort
                         d = the data / fields you want to access
                         l = limit of results
                         o = offset
                         p = page (if no offset is defined, offset is limit * (page -1) )

                         cache = defines cache policy
                         includeCount = whether to return the total number of results
                         */
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
                        const result = await GenericResolver.entities(db, context, type, fields, {
                            filter: f,
                            limit: l,
                            page: p,
                            sort: s,
                            offset: o,
                            match,
                            cache,
                            includeCount,
                            projectResult: true
                        })

                        debugInfo += ' result=true'

                        resolvedData[segment.key || type] = result
                    } else if (segment.request) {

                        const dataKey = segment.key || 'request'
                        let cacheKey
                        if (segment.cache) {
                            cacheKey = segment.cache.key || segment.key
                            if (cacheKey) {
                                cacheKey = 'dataresolver_request_' + cacheKey
                                const data = Cache.get(cacheKey)
                                if (data) {
                                    resolvedData[dataKey] = data
                                    continue
                                }
                            } else {
                                console.warn('Please define a key or a cacheKey if you want to use caching')
                            }
                        }

                        if (segment.async !== false) {
                            request(segment.request).then((body) => {
                                const result = {body}
                                if (segment.meta) {
                                    result.meta = segment.meta
                                }
                                if (cacheKey) {
                                    Cache.set(cacheKey, result, segment.cache.expiresIn)
                                }

                                pubsub.publish('cmsPageData', {
                                    userId: context.id,
                                    session: context.session,
                                    cmsPageData: {resolvedData: JSON.stringify({[dataKey]: result})}
                                })

                            }).catch(function (error) {
                                pubsub.publish('cmsPageData', {
                                    userId: context.id,
                                    session: context.session,
                                    cmsPageData: {resolvedData: JSON.stringify({[dataKey]: {error}})}
                                })
                            })
                            addDataResolverSubsription = true
                            resolvedData[dataKey] = {meta: segment.meta}
                        } else {
                            let result
                            try {
                                result = {body: await request(segment.request)}
                                if (segment.meta) {
                                    result.meta = segment.meta
                                }
                            } catch (error) {
                                result = {error}
                            }
                            if (cacheKey) {
                                Cache.set(cacheKey, result, segment.cache.expiresIn)
                            }
                            resolvedData[dataKey] = result
                        }

                    } else if (segment.tr) {
                        if (!resolvedData.tr)
                            resolvedData.tr = {}
                        if (segment.tr.constructor === Array) {

                            if (translations[context.lang]) {
                                for (let i = 0; i < segment.tr.length; i++) {
                                    const key = segment.tr[i]
                                    const val = translations[context.lang][key]
                                    if (val) {
                                        resolvedData.tr[key] = val
                                    }
                                }
                            }

                        } else {
                            resolvedData.tr = Object.assign(resolvedData.tr, segment.tr[context.lang])
                        }


                    } else if (segment.eval) {
                        debugInfo += ' in eval'
                        try {
                            const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
                            tpl.call({data: resolvedData, scope, context})
                        } catch (e) {
                            if (!segment.ignoreError)
                                throw e
                        }
                    } else if (segment.subscription) {
                        if (segment.subscription.constructor === String) {
                            subscriptions.push(segment.subscription)
                        } else {
                            subscriptions.push(JSON.stringify(segment.subscription))
                        }
                    } else if (segment.system) {
                        const data = {}
                        if (segment.system.properties) {
                            data.properties = Util.systemProperties()
                            //Object.keys(Cache.cache).length
                        }
                        if (segment.system.cache) {
                            data.cache = {}
                            if (segment.system.cache.data) {
                                data.cache.data = Cache.cache
                            }
                            if (segment.system.cache.count) {
                                data.cache.count = Object.keys(Cache.cache).length
                            }
                        }
                        resolvedData._meta.system = segment.key || 'system'
                        resolvedData[resolvedData._meta.system] = data
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

                    } else if (segment.website) {

                        // headless browser

                        if (segment.if && segment.if !== 'true') {
                            continue
                        }

                        const dataKey = segment.key || 'website'

                        let cacheKey
                        if (segment.cache) {
                            cacheKey = segment.cache.key || segment.key
                            if (cacheKey) {
                                cacheKey = 'dataresolver_website_' + cacheKey
                                const data = Cache.get(cacheKey)
                                if (data) {
                                    resolvedData[dataKey] = data
                                    continue
                                }
                            } else {
                                console.warn('Please define a key or a cacheKey if you want to use caching')
                            }
                        }

                        if (segment.async !== false) {

                            addDataResolverSubsription = true
                            resolvedData[dataKey] = {meta: segment.meta}
                            setTimeout(async () => {
                                const data = await openInBrowser(segment.website, scope, resolvedData)
                                if (segment.meta) {
                                    data.meta = segment.meta
                                }
                                if (cacheKey) {
                                    Cache.set(cacheKey, data, segment.cache.expiresIn)
                                }
                                pubsub.publish('cmsPageData', {
                                    userId: context.id,
                                    session: context.session,
                                    cmsPageData: {resolvedData: JSON.stringify({[dataKey]: data})}
                                })

                            }, 0)

                        } else {
                            resolvedData[dataKey] = await openInBrowser(segment.website, scope, resolvedData)
                            if (segment.meta) {
                                resolvedData[dataKey].meta = segment.meta
                            }
                            if (cacheKey) {
                                Cache.set(cacheKey, resolvedData[dataKey], segment.cache.expiresIn)
                            }
                        }
                    } else {
                        console.log('call cmsCustomResolver', segment)
                        Hook.call('cmsCustomResolver', {resolvedData, resolver: segment})
                    }

                }
                delete resolvedData._data
                if (addDataResolverSubsription) {
                    subscriptions.push('{"cmsPageData":"resolvedData"}')
                }
            } catch (e) {
                resolvedData.error = e.message + ' -> scope=' + JSON.stringify(scope) + debugInfo
            }
        }
        return {resolvedData, subscriptions}
    }
}

export default UtilCms
