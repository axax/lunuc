import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver'
import Cache from '../../../util/cache'
import request from 'request-promise'
import translations from 'gensrc/tr'
import Util from '../../../api/util'
import ClientUtil from 'client/util'
import {CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities'
import {addToWebsiteQueue} from './browser'
import Hook from '../../../util/hook'
import {pubsubDelayed} from '../../../api/subscription'
import fs from 'fs'
import config from 'gen/config'
import path from 'path'
import {propertyByPath, setPropertyByPath, assignIfObjectOrArray, matchExpr} from '../../../client/util/json'

export const resolveData = async ({db, context, dataResolver, scope, nosession, req, editmode}) => {
    const startTime = new Date().getTime()
    const resolvedData = {_meta: {}}, subscriptions = []

    if (dataResolver && dataResolver.trim() !== '') {
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
                                              const Util = this.ClientUtil
                                              const ObjectId = this.ObjectId
                                              return \`${JSON.stringify(segments[i])}\``)
                const replacedSegmentStr = tpl.call({
                    scope,
                    data: resolvedData,
                    context,
                    editmode,
                    ClientUtil,
                    config,
                    ObjectId
                }).replace(/"###/g, '').replace(/###"/g, '')
                const segment = JSON.parse(replacedSegmentStr)
                if (tempBrowser) {
                    segment.website.pipeline = tempBrowser
                }


                if (segment._data) {
                    resolvedData._data = segment._data
                } else if (segment.resolveFrom) {
                    if (segment.resolveFrom.KeyValueGlobal) {
                        const dataFromKey = await Util.getKeyValueGlobal(db, context, segment.resolveFrom.KeyValueGlobal, false)
                        const resolvedFromKey = await resolveData({
                            db,
                            context,
                            dataResolver: dataFromKey,
                            scope,
                            nosession,
                            req,
                            editmode
                        })
                        Object.keys(resolvedFromKey.resolvedData).forEach(k => {
                            resolvedData[k] = resolvedFromKey.resolvedData[k]
                        })
                    }
                } else if (segment.data) {
                    Object.keys(segment.data).forEach(k => {
                        resolvedData[k] = segment.data[k]
                    })
                } else if (segment.t) {
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
                                continue
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
                        subscriptions.push(type)
                    } else {
                        type = t
                    }

                    // restriction = if it is set to 'user' only entries that belongs to the user are returned
                    if (segment.restriction) {

                        const restriction = segment.restriction.constructor === String ? {type: segment.restriction} : segment.restriction

                        if (restriction.type === 'user') {
                            if (!context.id) {
                                // use anonymouse user
                                const anonymousUser = await Util.userByName(db, 'anonymous')
                                context.id = anonymousUser._id.toString()
                            }
                            match = {createdBy: ObjectId(context.id)}
                        } else if (restriction.type === 'role') {

                            if (await Util.userHasCapability(db, context, restriction.role)) {
                                match = {}
                            } else {
                                match = {createdBy: ObjectId(context.id)}
                            }
                        } else {
                            match = {}
                        }
                    } else {
                        match = {}
                    }
                    debugInfo += ' type=' + type
                    const result = await GenericResolver.entities(db, context, type, fields, {
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
                    debugInfo += ' result=true'

                    resolvedData[segment.key || type] = result
                } else if (segment.request) {
                    console.log(`resolve request ${segment.request.url}`)
                    const dataKey = segment.key || 'request'
                    const cacheKey = createCacheKey(segment, 'request')
                    if (cacheKey) {
                        const cachedData = Cache.cache[cacheKey]
                        if (cachedData) {
                            resolvedData[dataKey] = cachedData.data
                            if (Cache.isValid(cachedData)) {
                                // no need to renew cache
                                continue
                            }
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

                            pubsubDelayed.publish('cmsPageData', {
                                userId: context.id,
                                session: context.session,
                                cmsPageData: {resolvedData: JSON.stringify({[dataKey]: result})}
                            }, context)

                        }).catch(function (error) {
                            const result = {error: error.message}
                            if (segment.meta) {
                                result.meta = segment.meta
                            }
                            pubsubDelayed.publish('cmsPageData', {
                                userId: context.id,
                                session: context.session,
                                cmsPageData: {resolvedData: JSON.stringify({[dataKey]: result})}
                            }, context)
                        })
                        addDataResolverSubsription = true
                        if (!resolvedData[dataKey]) {
                            resolvedData[dataKey] = {}
                        }
                        resolvedData[dataKey].meta = segment.meta
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

                    if (segment.if === false || segment.if === 'false') {
                        continue
                    }

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
                        if (segment.defaultLanguage) {
                            resolvedData.tr = Object.assign(resolvedData.tr, segment.tr[segment.defaultLanguage], segment.tr[context.lang])
                        } else {
                            resolvedData.tr = Object.assign(resolvedData.tr, segment.tr[context.lang])
                        }

                    }


                } else if (segment['eval']) {
                    debugInfo += ' in eval'
                    try {
                        const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
                        tpl.call({data: resolvedData, scope, context})
                    } catch (e) {
                        if (!segment.ignoreError)
                            throw e
                    }
                } else if (segment.reduce) {
                    try {
                        const checkFilter = (filters, value, key)=>{
                            if (filters) {
                                for (let i = 0; i < filters.length; i++) {
                                    const filter = filters[i]
                                    if(!filter.is || filter.is==='true') {
                                        if (matchExpr(filter.expr, {key, value: value[key]})) {
                                            if (filter.elseRemove) {
                                                delete value[key]
                                            }
                                            return true
                                        }
                                    }
                                }
                            }
                            return false
                        }

                        const reduce = (reducePipe, rootData, currentData) => {
                            if (!currentData) {
                                currentData = rootData
                            }
                            reducePipe.forEach(re => {
                                if (re.path) {
                                    if (re.key) {
                                        const value = propertyByPath(re.path, currentData)
                                        resolvedData[re.key] = re.assign ? assignIfObjectOrArray(value) : value
                                    } else if (re.loop) {


                                        let value = propertyByPath(re.path, currentData, '.', re.assign)
                                        if (value.constructor === Object) {
                                            Object.keys(value).forEach(key => {
                                                if (re.loop.reduce) {
                                                    value[key] = re.assign ? assignIfObjectOrArray(value[key]) : value[key]
                                                    if (checkFilter(re.loop.filter, value, key)) {
                                                        return
                                                    }
                                                    reduce(re.loop.reduce, rootData, value[key])
                                                }
                                            })
                                        }
                                    } else if (re.reduce) {
                                        const arr = propertyByPath(re.path, currentData)

                                        reduce(re.reduce, rootData, arr)

                                    } else if (re.lookup) {
                                        const lookupData = propertyByPath(re.lookup.path, rootData)
                                        const value = propertyByPath(re.path, currentData)
                                        const lookedupData = []
                                        value.forEach(key => {
                                            if( re.lookup.facets) {
                                                const facets = propertyByPath(re.lookup.facets.path,rootData)
                                                if( facets) {
                                                    Object.keys(facets).forEach(facetKey=>{
                                                        const facet = facets[facetKey]
                                                        if( facet ){
                                                            if( facet.min === undefined || facet.min > lookupData[key][facetKey] ){
                                                                if( !isNaN(lookupData[key][facetKey])) {
                                                                    facet.min = lookupData[key][facetKey]
                                                                }
                                                            }
                                                            if( facet.max === undefined || facet.max < lookupData[key][facetKey] ){
                                                                if( !isNaN(lookupData[key][facetKey])) {
                                                                    facet.max = lookupData[key][facetKey]
                                                                }
                                                            }
                                                        }
                                                    })
                                                }
                                            }

                                            if (checkFilter(re.lookup.filter, lookupData, key)) {
                                                return
                                            }

                                            lookedupData.push(lookupData[key])
                                        })
                                        setPropertyByPath(lookedupData, re.path, currentData)

                                        // console.log(currentData, lookupData)

                                    }
                                    if (re.remove) {
                                        const parentPath = re.path.substring(0, re.path.lastIndexOf('.'))
                                        const ob = propertyByPath(parentPath, currentData)
                                        delete ob[re.path.substring(re.path.lastIndexOf('.') + 1)]
                                    }
                                }
                            })
                        }

                        reduce(segment.reduce, resolvedData)
                    } catch (e) {
                        console.warn(`segment ${segment.key} can not be reduced`, e)
                    }
                } else if (segment.subscription) {
                    if (segment.subscription.constructor === String) {
                        subscriptions.push(segment.subscription)
                    } else {
                        subscriptions.push(JSON.stringify(segment.subscription))
                    }
                } else if (segment.system) {
                    resolveSystemData(segment, req, resolvedData)
                } else if (segment.keyValueGlobals) {

                    // if user don't have capability to manage keys he can only see the public ones
                    const onlyPublic = !await Util.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)
                    const dataKey = segment.key || 'keyValueGlobals'

                    const map = await Util.keyValueGlobalMap(db, context, segment.keyValueGlobals, {
                        public: onlyPublic,
                        cache: true,
                        parse: true
                    })

                    resolvedData[dataKey] = map
                } else if (segment.user) {

                    resolvedData.user = {id: context.id}
                    if (context.id && segment.user.roles) {
                        const user = await Util.userById(db, context.id)

                        resolvedData.user.roles = await Util.getUserRoles(db, user.role)
                    }
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

                    if (segment.if === false || !segment.website.url) {
                        continue
                    }

                    const dataKey = segment.key || 'website'
                    const cacheKey = createCacheKey(segment, 'website')

                    if (addToWebsiteQueue({segment, scope, resolvedData, context, dataKey, cacheKey})) {
                        addDataResolverSubsription = true
                    }

                } else {
                    console.log('call cmsCustomResolver', segment)
                    Hook.call('cmsCustomResolver', {db, resolvedData, segment, context, scope, req, editmode})
                }

            }
            delete resolvedData._data
            if (addDataResolverSubsription) {
                subscriptions.push('{"cmsPageData":"resolvedData"}')
            }
        } catch (e) {
            console.log(e)
            resolvedData.error = e.message + ' -> scope=' + JSON.stringify(scope) + debugInfo
        }
    }
    console.log(`dataResolver for ${scope.page.slug} in ${new Date().getTime() - startTime}ms`)
    return {resolvedData, subscriptions}
}


const createCacheKey = (segment, name) => {
    let cacheKey
    if (segment.cache) {
        if (segment.cache.key) {
            cacheKey = segment.cache.key
        } else if (segment.key) {
            cacheKey = `dataresolver_${name}_${segment.key}`
        } else {
            console.warn('Please define a key or a cacheKey if you want to use caching')
        }
    }

    return cacheKey
}

function resolveSystemData(segment, req, resolvedData) {
    const data = {}
    if (segment.system.properties) {
        data.properties = Util.systemProperties()
        //Object.keys(Cache.cache).length
    }
    if (segment.system.ls) {
        data.ls = {}
        segment.system.ls.forEach(ls => {
            if (ls.key) {
                const files = []
                fs.readdirSync(path.join(__dirname, ls.path)).forEach(file => {
                    files.push(file)
                })
                data.ls[ls.key] = files
            } else {
                console.warn('key for ls is missing')
            }

        })
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
    if (segment.system.client) {
        data.client = {
            agent: req.header('user-agent'), // User Agent we get from headers
            referrer: req.header('referrer'), //  Likewise for referrer
            ip: req.header('x-forwarded-for') || req.connection.remoteAddress, // Get IP - allow for proxy
            screen: { // Get screen info that we passed in url post data
                width: req.params.width,
                height: req.params.height
            }
        }
    }
    resolvedData._meta.system = segment.key || 'system'
    resolvedData[resolvedData._meta.system] = data
}
