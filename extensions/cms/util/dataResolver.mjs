import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Cache from '../../../util/cache.mjs'
import request from '../../../api/util/request.mjs'
import Util from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {addToWebsiteQueue} from './browser.mjs'
import Hook from '../../../util/hook.cjs'
import {translations} from '../../../util/i18nServer.mjs'
import {pubsubDelayed} from '../../../api/subscription.mjs'
import fs from 'fs'
import config from '../../../gensrc/config.mjs'
import path from 'path'
import {propertyByPath, setPropertyByPath, assignIfObjectOrArray, matchExpr} from '../../../client/util/json.mjs'
import {fileURLToPath} from 'url'
import {typeResolver} from './resolver/typeResolver.mjs'
import {resolveFrom} from './resolver/resolveFrom.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_PARAM_MAX_LENGTH = 100,
    DEFAULT_PARAM_NOT_ALLOWED_CHARS = ['\\(', '\\)', '\\{', '\\}', ';', '<', '>'],
    DEFAULT_PARAM_NOT_ALLOWED_REGEX = new RegExp(DEFAULT_PARAM_NOT_ALLOWED_CHARS.join('|'), 'gi')

export const resolveData = async ({db, context, dataResolver, scope, nosession, req, editmode, dynamic}) => {
    const startTime = new Date().getTime()

    const resolvedData = {_meta: {}}, subscriptions = []

    if (dataResolver && dataResolver.trim() !== '') {
        const debugInfo = {}
        try {
            let segments = JSON.parse(dataResolver),
                addDataResolverSubscription = false

            if (segments.constructor === Object) segments = [segments]


            // check params
            if (scope.param) {
                const keys = Object.keys(scope.params)
                if (keys.length > 0) {
                    keys.forEach(key => {
                        // param limit length is 50
                        if (scope.params[key].length > DEFAULT_PARAM_MAX_LENGTH) {
                            scope.params[key] = scope.params[key].substring(0, 50)
                        }
                        scope.params[key] = scope.params[key].replace(DEFAULT_PARAM_NOT_ALLOWED_REGEX, '')
                    })
                }
            }

            for (let i = 0; i < segments.length; i++) {
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

                if (segment.if === false || segment.if === 'false') {
                    continue
                }


                if (segment.access) {

                    if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {

                        resolvedData.access = {}
                        Object.keys(segment.access).forEach(key => {
                            const usernames = segment.access[key].username
                            if (usernames.indexOf(context.username) < 0) {
                                if (!(segment.access[key].anonymous && !context.id)) {
                                    resolvedData.access[key] = false
                                }
                            }
                        })
                    }

                } else if (segment._data) {
                    resolvedData._data = segment._data
                } else if (segment.resolveFrom) {
                    await resolveFrom({segment, db, context, resolvedData, scope, nosession, req, editmode, dynamic})
                } else if (segment.data) {
                    Object.keys(segment.data).forEach(k => {
                        resolvedData[k] = segment.data[k]
                    })
                } else if (segment.t) {

                    await typeResolver({segment, resolvedData, scope, db, req, context, subscriptions, debugInfo})

                } else if (segment.request) {
                    addDataResolverSubscription = await resolveRequest(segment, resolvedData, context, addDataResolverSubscription)

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
                        if (segment.forceLanguage) {
                            resolvedData.tr = Object.assign(resolvedData.tr, segment.tr[segment.forceLanguage])
                        } else if (segment.defaultLanguage) {
                            resolvedData.tr = Object.assign(resolvedData.tr, segment.tr[segment.defaultLanguage], segment.tr[context.lang])
                        } else {
                            resolvedData.tr = Object.assign(resolvedData.tr, segment.tr[context.lang])
                        }

                    }


                } else if (segment['eval']) {
                    debugInfo.message = ' in eval'
                    try {
                        const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
                        tpl.call({data: resolvedData, scope, context})
                    } catch (e) {
                        if (!segment.ignoreError)
                            throw e
                    }
                } else if (segment.reduce) {
                    try {
                        resolveReduce(segment.reduce, resolvedData)
                    } catch (e) {
                        console.warn(`segment ${segment.key} can not be reduced`, e)
                    }
                } else if (segment.subscription) {

                    if (segment.subscription.filter && segment.subscription.filter.create) {
                        if (!segment.subscription.variables) {
                            segment.subscription.variables = {}
                        }
                        segment.subscription.variables.filter = JSON.stringify(segment.subscription.filter)
                    }
                    subscriptions.push(segment.subscription)
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

                    if(segment.subscribe) {
                        subscriptions.push({query: 'action keys data{_id key value}',
                            variables:{'keys':JSON.stringify(segment.keyValueGlobals)},
                            autoUpdate:true,
                            updateMap: [{toKey:'keyValueGlobals.${fromKey}',fromKey:'key', fromValueKey: 'value', parse:true}],
                            callback: false, name: 'subscribeKeyValueGlobal'})
                    }

                } else if (segment.session) {
                    resolvedData.session = {id: context.session}
                } else if (segment.user) {

                    resolvedData.user = {id: context.id}
                    if (context.id) {
                        const user = await Util.userById(db, context.id)

                        if (user) {
                            //resolvedData.user = Object.assign({}, resolvedData.user)
                            if (segment.user.meta) {
                                if (segment.user.meta.constructor === Array) {
                                    resolvedData.user.meta = {}
                                    if (user.meta) {
                                        segment.user.meta.forEach(m => {
                                            resolvedData.user.meta[m] = user.meta[m]
                                        })
                                    }
                                } else {
                                    resolvedData.user.meta = user.meta
                                }
                            }

                            if (segment.user.email) {
                                resolvedData.user.email = user.email
                            }

                            if (segment.user.roles) {
                                resolvedData.user.roles = await Util.getUserRoles(db, user.role)
                            }
                            if (segment.user.group) {
                                resolvedData.user.group = user.group ? user.group.map(group=>({id:group.toString()})) : []
                            }
                        }
                    }
                } else if (segment.keyValues) {

                    const map = {}

                    if (Util.isUserLoggedIn(context)) {
                        const match = {createdBy: new ObjectId(context.id), key: {$in: segment.keyValues}}
                        const result = await GenericResolver.entities(db, {headers: req.headers, context}, 'KeyValue', ['key', 'value'], {
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
                    resolvedData._meta.keyValueExtend = segment.extend
                    resolvedData[resolvedData._meta.keyValueKey] = map

                } else if (segment.website) {

                    if (!segment.website.url) {
                        continue
                    }

                    const dataKey = segment.key || 'website'
                    const cacheKey = createCacheKey(segment, 'website')

                    if (addToWebsiteQueue({segment, scope, resolvedData, context, dataKey, cacheKey})) {
                        addDataResolverSubscription = true
                    }

                } else {
                    console.log('call cmsCustomResolver', segment)

                    if (Hook.hooks['cmsCustomResolver'] && Hook.hooks['cmsCustomResolver'].length) {
                        let c = Hook.hooks['cmsCustomResolver'].length
                        for (let i = 0; i < Hook.hooks['cmsCustomResolver'].length; ++i) {
                            await Hook.hooks['cmsCustomResolver'][i].callback({
                                db,
                                resolvedData,
                                segment,
                                context,
                                scope,
                                req,
                                editmode,
                                dynamic
                            })
                        }
                    }
                }

            }
            delete resolvedData._data
            if (addDataResolverSubscription) {
                subscriptions.push({
                    name: 'cmsPageData',
                    query: 'resolvedData',
                    callback: true,
                    autoUpdate: false
                })
            }
        } catch (e) {
            console.log(e)
            resolvedData.error = e.message + ' -> scope=' + JSON.stringify(scope) + debugInfo.message
        }
    }
    console.log(`dataResolver for ${scope.page.slug} in ${new Date().getTime() - startTime}ms`)
    return {resolvedData, subscriptions: subscriptions.length > 0 ? JSON.stringify(subscriptions) : ''}
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
                const dir = ls.abspath || path.join(__dirname, ls.path)
                fs.readdirSync(dir).forEach(file => {
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
        if (segment.system.cache.size) {
            data.cache.size = JSON.stringify(Cache.cache).length
        }
    }
    if (segment.system.client) {
        data.client = {
            agent: req.headers['x-track-user-agent'] || req.header('user-agent'), // User Agent we get from headers
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


async function resolveRequest(segment, resolvedData, context, addDataResolverSubsription) {
    console.log(`resolve request ${segment.request.url}`)
    const dataKey = segment.key || 'request'
    const cacheKey = createCacheKey(segment, 'request')
    if (cacheKey) {
        const cachedData = Cache.cache[cacheKey]
        if (cachedData) {
            resolvedData[dataKey] = cachedData.data
            if (Cache.isValid(cachedData)) {
                // no need to renew cache
                return;
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
    return addDataResolverSubsription
}


const checkFilter = (filters, value, key) => {
    if (filters) {
        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i]
            if (!filter.is || filter.is === 'true') {

                if (filter.search) {
                    const re = new RegExp(filter.search.expr, 'i'),
                        keys = Object.keys(filter.search.fields)


                    for (let y = 0; y < keys.length; y++) {
                        const fieldKey = keys[y]
                        let valueToCheck
                        if (fieldKey.indexOf('.') >= 0) {
                            valueToCheck = propertyByPath(fieldKey, value[key])
                        } else {
                            valueToCheck = value[key][fieldKey]
                        }
                        if (valueToCheck && re.test(valueToCheck)) {
                            return false
                        }
                    }

                    return true

                } else {
                    if (matchExpr(filter.expr, {key, value: value[key]})) {
                        if (filter.elseRemove) {
                            delete value[key]
                        }
                        return true
                    }
                }
            }
        }
    }
    return false
}

const resolveReduce = (reducePipe, rootData, currentData) => {
    if (!currentData) {
        currentData = rootData
    }

    reducePipe.forEach(re => {
        if (re.path && re.$is !== false && re.$is !== 'false') {

            if (re.sort) {
                const value = propertyByPath(re.path, currentData, '.', re.assign)

                const sort = re.sort[0]
                if (sort.desc) {
                    value.sort((a, b) => {
                        if (a[sort.key] > b[sort.key])
                            return -1
                        if (a[sort.key] < b[sort.key])
                            return 1
                        return 0
                    })
                } else {
                    value.sort((a, b) => {
                        if (a[sort.key] < b[sort.key])
                            return -1
                        if (a[sort.key] > b[sort.key])
                            return 1
                        return 0
                    })
                }
            } else if (re.lookup) {
                const lookupData = propertyByPath(re.lookup.path, rootData, '.', !!re.lookup.assign)
                const value = propertyByPath(re.path, currentData)
                let lookedupData, groups
                if (value !== undefined && value !== null) {
                    if (value.constructor === Number || value.constructor === String) {
                        lookedupData = lookupData[value]
                        if (lookupData === undefined) {
                            console.warn(`${value} not found in`, lookupData)
                        }
                    } else if (value.constructor === Array) {
                        lookedupData = [], groups = {}
                        let count = 0
                        value.forEach(key => {

                            if (checkFilter(re.lookup.filterBefore, lookupData, key)) {
                                return
                            }

                            if (re.lookup.facets) {
                                const facets = propertyByPath(re.lookup.facets.path, rootData)
                                if (facets) {
                                    Object.keys(facets).forEach(facetKey => {
                                        const facet = facets[facetKey]
                                        if (facet && lookupData[key]) {
                                            if (facet.type === 'slider') {
                                                if (facet.min === undefined || facet.min > lookupData[key][facetKey]) {
                                                    if (!isNaN(lookupData[key][facetKey])) {
                                                        facet.min = lookupData[key][facetKey]
                                                    }
                                                }
                                                if (facet.max === undefined || facet.max < lookupData[key][facetKey]) {
                                                    if (!isNaN(lookupData[key][facetKey])) {
                                                        facet.max = lookupData[key][facetKey]
                                                    }
                                                }
                                            } else {
                                                if (!facet.values) {
                                                    facet.values = {}
                                                }

                                                let arr = lookupData[key][facetKey]
                                                if (arr.constructor !== Array) {
                                                    arr = [arr]
                                                }

                                                for (let i = 0; i < arr.length; i++) {
                                                    const v = arr[i]
                                                    if (!facet.values[v]) {
                                                        facet.values[v] = {
                                                            value: v,
                                                            count: 1
                                                        }
                                                    } else {
                                                        facet.values[v].count++
                                                    }
                                                }
                                            }
                                        }
                                    })
                                }
                            }

                            if (re.lookup.group && re.lookup.group.keepOnlyOne) {
                                if (groups[lookupData[key][re.lookup.group.key]]) {
                                    return
                                }
                            }

                            if (re.lookup.limit && re.lookup.limit <= count) {
                                return
                            }
                            if (checkFilter(re.lookup.filter, lookupData, key)) {
                                return
                            }
                            count++
                            if (re.lookup.group) {
                                groups[lookupData[key][re.lookup.group.key]] = lookupData[key]
                                if (re.lookup.group.lookup) {
                                    const data = propertyByPath(re.lookup.group.lookup, rootData)
                                    lookupData[key] = {
                                        ...lookupData[key],
                                        [re.lookup.group.key]: data[lookupData[key][re.lookup.group.key]]
                                    }
                                }
                            }
                            lookedupData.push(lookupData[key])
                        })
                    }
                }

                if (re.lookup.sum) {
                    let sum = propertyByPath(re.lookup.sum.path, rootData)
                    if (!sum) {
                        sum = 0
                    }
                    sum += lookedupData.length
                    setPropertyByPath(sum, re.lookup.sum.path, rootData)
                }

                if(re.extend || re.override){
                    if(lookedupData && lookedupData.constructor === Object){
                        Object.keys(lookedupData).forEach(key=>{
                            if(re.override || !currentData[key]){
                                currentData[key] = lookedupData[key]
                            }
                        })
                    }
                }else if (re.key) {

                    if(re.onCurrent){
                        currentData[re.key] = lookedupData
                    }else{
                        rootData[re.key] = lookedupData
                    }
                } else {
                    setPropertyByPath(lookedupData, re.path, currentData)
                }
            } else if (re.random) {
                let value = propertyByPath(re.path, currentData, '.', false)
                const picks = []
                for (let i = 0; i < re.random; i++) {
                    picks.push(value[Math.floor(Math.random() * value.length)])
                }
                rootData[re.key] = picks
            } else if (re.key) {

                const value = propertyByPath(re.path, currentData, '.', re.assign)

                if (re.assign && value && value.constructor === Object) {
                    Object.keys(value).forEach(key => {
                        if (value[key] && value[key].constructor === Object) {
                            value[key] = Object.assign({}, value[key])
                        }
                    })
                }
                if (re.get) {
                    if (re.separator) {
                        const aGet = re.get.split(re.separator)
                        const aValue = []
                        aGet.forEach(sget => {
                            let getKey = propertyByPath(sget, currentData)
                            if (getKey === null || getKey === undefined) {
                                getKey = sget
                            }
                            if(!re.ignoreNull || value[getKey] != null){
                                aValue.push(value[getKey])
                            }
                        })
                        rootData[re.key] = aValue
                    } else {
                        let getKey = propertyByPath(re.get, currentData)
                        if (getKey === null || getKey === undefined) {
                            getKey = re.get
                        }
                        if (getKey && getKey.constructor === Array) {
                            const aValue = []
                            getKey.forEach(key => {
                                aValue.push(value[key])
                            })
                            rootData[re.key] = aValue

                        } else {
                            if(re.toArray){
                                if(!rootData[re.key]){
                                    rootData[re.key] = []
                                }
                                rootData[re.key].push(value[getKey])
                            }else {
                                rootData[re.key] = value[getKey]
                            }
                        }
                    }
                } else {
                    if(re.toArray){
                        if(!rootData[re.key]){
                            rootData[re.key] = []
                        }
                        if(!value){
                        }else if(value.constructor === Object){
                            rootData[re.key].push(...Object.values(value))
                        }else if(value.constructor === Array){
                            rootData[re.key].push(...value)
                        }else /*if(rootData[re.key].indexOf(value)<0)*/{
                            rootData[re.key].push(value)
                        }
                    }else {
                        rootData[re.key] = value
                    }
                }
            } else if (re.loop) {


                let value = propertyByPath(re.path, currentData, '.', re.assign)
                if (value.constructor === Object) {
                    Object.keys(value).forEach(key => {
                        if (re.loop.reduce) {
                            value[key] = re.assign ? assignIfObjectOrArray(value[key]) : value[key]
                            if (checkFilter(re.loop.filter, value, key)) {
                                return
                            }
                            resolveReduce(re.loop.reduce, rootData, value[key])
                        }
                    })
                } else if (value.constructor === Array) {
                    for (let i = value.length - 1; i >= 0; i--) {

                        if (checkFilter(re.loop.filter, value, i)) {
                            value.splice(i, 1)
                        }

                        if (re.loop.reduce) {
                            value[i] = re.assign ? assignIfObjectOrArray(value[i]) : value[i]
                            //if()
                            resolveReduce(re.loop.reduce, rootData, value[i])
                        }
                    }
                }
            } else if (re.reduce) {
                const arr = propertyByPath(re.path, currentData)
                resolveReduce(re.reduce, rootData, arr)
            } else if (re.limit) {
                let value = propertyByPath(re.path, currentData, '.', re.assign)
                value.length = re.limit
            }
            if (re.remove) {
                const parentPath = re.path.substring(0, re.path.lastIndexOf('.'))
                const ob = propertyByPath(parentPath, currentData)
                delete ob[re.path.substring(re.path.lastIndexOf('.') + 1)]
            }
        }
    })
}
