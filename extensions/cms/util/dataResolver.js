import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver'
import Cache from '../../../util/cache'
import request from 'request-promise'
import translations from 'gensrc/tr'
import Util from '../../../api/util'
import ClientUtil from 'client/util'
import {CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_TYPES} from '../../../util/capabilities'
import {processWebsiteQueue} from './browser'
import Hook from '../../../util/hook'
import {pubsubDelayed} from '../../../api/subscription'
import fs from 'fs'
import config from 'gen/config'
import path from 'path'

const createCacheKey = (segment, name) => {
    let cacheKey
    if (segment.cache) {
        cacheKey = segment.cache.key || segment.key
        if (cacheKey) {
            cacheKey = `dataresolver_${name}_${cacheKey}`
        } else {
            console.warn('Please define a key or a cacheKey if you want to use caching')
        }
    }

    return cacheKey
}

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
                const replacedSegmentStr = tpl.call({scope, data: resolvedData, context, editmode, ClientUtil, config, ObjectId}).replace(/"###/g, '').replace(/###"/g, '')
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
                    const {t, f, l, o, g, p, d, s, $if, cache, includeCount,resultFilter, ...other} = segment
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

                        const restriction = segment.restriction.constructor === String? {type: segment.restriction }:segment.restriction

                        if( restriction.type === 'user') {
                            if (!context.id) {
                                // use anonymouse user
                                const anonymousUser = await Util.userByName(db, 'anonymous')
                                context.id = anonymousUser._id.toString()
                            }
                            match = {createdBy: ObjectId(context.id)}
                        }else if( restriction.type === 'role') {

                            if (await Util.userHasCapability(db, context, restriction.role)) {
                                match = {}
                            }else{
                                match = {createdBy: ObjectId(context.id)}
                            }
                        }else{
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
                        postConvert:false,
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
                    if (segment.system.ls) {
                        data.ls = {}
                        segment.system.ls.forEach(ls=>{
                            if( ls.key ) {
                                const files = []
                                fs.readdirSync(path.join(__dirname, ls.path)).forEach(file => {
                                    files.push(file)
                                })
                                data.ls[ls.key]=files
                            }else{
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
                } else if (segment.keyValueGlobals) {

                    const dataKey = segment.key || 'keyValueGlobals'
                    const cacheKey = createCacheKey(segment, 'keyValueGlobals')

                    if (cacheKey) {
                        const cachedData = Cache.get(cacheKey)
                        if (cachedData) {
                            resolvedData[dataKey] = cachedData
                            continue
                        }


                    }

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
                            try {
                                map[entry.key] = JSON.parse(entry.value)
                            } catch (e) {
                                map[entry.key] = entry.value
                            }
                        })
                    }
                    if (cacheKey) {
                        Cache.set(cacheKey, map, segment.cache.expiresIn)
                    }
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

                    // headless browser
                    if (segment.if === false || !segment.website.url) {
                        continue
                    }

                    const dataKey = segment.key || 'website'

                    const cacheKey = createCacheKey(segment, 'website')

                    if (cacheKey) {
                        const cachedData = Cache.cache[cacheKey] // Cache.get(cacheKey, true)
                        if (cachedData) {
                            resolvedData[dataKey] = cachedData.data
                            if (Cache.isValid(cachedData)) {
                                // no need to renew cache
                                continue
                            }
                        }
                    }

                    addDataResolverSubsription = true
                    if (!resolvedData[dataKey]) {
                        resolvedData[dataKey] = {}
                    }
                    resolvedData[dataKey].meta = segment.meta
                    processWebsiteQueue({segment, scope, resolvedData, context, dataKey, cacheKey})

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
