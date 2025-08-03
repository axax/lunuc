import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Cache from '../../../util/cache.mjs'
import request from '../../../api/util/request.mjs'
import ApiUtil from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {addToWebsiteQueue} from './browser.mjs'
import Hook from '../../../util/hook.cjs'
import {translations} from '../../../util/i18nServer.mjs'
import {pubsubDelayed} from '../../../api/subscription.mjs'
import fs from 'fs'
import config from '../../../gensrc/config.mjs'
import path from 'path'
import {fileURLToPath} from 'url'
import {typeResolver} from './resolver/typeResolver.mjs'
import {resolveFrom} from './resolver/resolveFrom.mjs'
import {resolveReduce} from './resolver/resolveReduce.mjs'
import {TRACK_USER_AGENT_HEADER} from '../../../api/constants/index.mjs'
import {getBestMatchingHostRule, getHostRules} from '../../../util/hostrules.mjs'
import Util from '../../../api/util/index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_PARAM_MAX_LENGTH = 100,
    DEFAULT_PARAM_NOT_ALLOWED_CHARS = ['\\(', '\\)', '\\{', '\\}', ';', '<', '>'],
    DEFAULT_PARAM_NOT_ALLOWED_REGEX = new RegExp(DEFAULT_PARAM_NOT_ALLOWED_CHARS.join('|'), 'gi')


export const resolveData = async ({db, context, dataResolver, scope, nosession, req, editmode, dynamic}) => {
    const startTime = new Date().getTime()

    const resolvedData = {_meta: {}}, subscriptions = []

    if (dataResolver && dataResolver.trim() !== '') {

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
                                              const ApiUtil = this.ApiUtil
                                              const ObjectId = this.ObjectId
                                              return \`${JSON.stringify(segments[i])}\``)

                const replacedSegmentStr = tpl.call({
                    scope,
                    data: resolvedData,
                    context,
                    editmode,
                    dynamic,
                    ClientUtil,
                    ApiUtil,
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
                const debugLog = []
                const startTimeSegment = new Date().getTime()


                if (segment.access) {

                    if (!await ApiUtil.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {

                        resolvedData.access = {}
                        Object.keys(segment.access).forEach(key => {
                            const usernames = segment.access[key]?.username
                            if (usernames && usernames.indexOf(context.username) < 0) {
                                if (!(segment.access[key].anonymous && !context.id)) {
                                    resolvedData.access[key] = false
                                }
                            }else{
                                resolvedData.access[key] = segment.access[key]
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

                    await typeResolver({segment, resolvedData, scope, db, req, context, subscriptions})

                } else if (segment.request) {
                    addDataResolverSubscription = await resolveRequest({segment, resolvedData, req, context, addDataResolverSubscription})

                } else if (segment.tr) {

                    resolveTranslations(resolvedData, segment, context)

                } else if (segment['eval']) {
                    try {
                        const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
                        tpl.call({data: resolvedData, scope, context})
                    } catch (e) {
                        if (!segment.ignoreError)
                            throw e
                    }
                } else if (segment.reduce) {
                    try {
                        resolveReduce(segment.reduce, resolvedData, resolvedData, {debugLog})
                    } catch (e) {
                        debugLog.push({type:'error', message:`segment ${segment.key} can not be reduced: ${e.message}`})
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
                    await resolveSystemData({segment, req, resolvedData, context, db})
                } else if (segment.keyValueGlobals) {

                    // if user don't have capability to manage keys he can only see the public ones
                    const onlyPublic = segment.public!==undefined?segment.public:!await ApiUtil.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)
                    const dataKey = segment.key || 'keyValueGlobals'

                    const map = await ApiUtil.keyValueGlobalMap(db, context, segment.keyValueGlobals, {
                        public: onlyPublic,
                        cache: true,
                        parse: true
                    })

                    resolvedData[dataKey] = map

                    if(segment.subscribe) {
                        subscriptions.push({query: 'action keys data{_id key value}',
                            variables:{'keys':JSON.stringify(segment.keyValueGlobals)},
                            autoUpdate:true,
                            updateMap: [{toKey:`${dataKey}.\${fromKey}`,fromKey:'key', fromValueKey: 'value', parse:true}],
                            callback: false, name: 'subscribeKeyValueGlobal'})
                    }

                } else if (segment.session) {
                    resolvedData.session = {id: context.session}
                } else if (segment.user) {

                    resolvedData.user = {id: context.id}
                    if (context.id) {
                        const user = await ApiUtil.userById(db, context.id)

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
                                resolvedData.user.roles = await ApiUtil.getUserRoles(db, user.role)
                            }
                            if (segment.user.group) {
                                resolvedData.user.group = user.group ? user.group.map(group=>({id:group.toString()})) : []
                            }
                        }
                    }
                } else if (segment.keyValues) {

                    const map = {}

                    if (ApiUtil.isUserLoggedIn(context)) {
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

                if(segment.debug){
                    resolvedData[segment.debug] = {totalTime:new Date().getTime() - startTimeSegment, log:debugLog}
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
            resolvedData.error = e.message + ' -> scope=' + JSON.stringify(scope)
        }

    }
    console.debug(`CMS: dataResolver for ${scope.page.slug} in ${new Date().getTime() - startTime}ms`)
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

const resolveSystemData = async ({segment, req, resolvedData, context, db}) => {
    const data = {}
    if (segment.system.properties) {
        data.properties = ApiUtil.systemProperties()
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
        if (segment.system.cache.sizePerKey) {
            data.cache.sizePerKey = Object.keys(Cache.cache).map(key=>({key,size:JSON.stringify(Cache.cache[key]).length}))
        }
    }
    if (segment.system.client) {
        data.client = {
            agent: req.headers[TRACK_USER_AGENT_HEADER] || req.header('user-agent'), // User Agent we get from headers
            referrer: req.header('referrer'), //  Likewise for referrer
            ip: req.header('x-forwarded-for') || req.connection.remoteAddress, // Get IP - allow for proxy
            screen: { // Get screen info that we passed in url post data
                width: req.params.width,
                height: req.params.height
            }
        }
    }
    if (segment.system.hostrules) {
        if(segment.system.hostrules?.restriction?.type==='user' && !await ApiUtil.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)){
            const user = await Util.userById(db,context.id)
            data.hostrules = {}
            if(user?.hostrule) {
                user.hostrule.split(',').forEach(rule=>{
                    data.hostrules[rule] = getBestMatchingHostRule(rule,false,false)
                })
            }
        }else {
            data.hostrules = getHostRules()
        }
    }
    resolvedData._meta.system = segment.key || 'system'
    resolvedData[resolvedData._meta.system] = data
}


async function resolveRequest({segment, resolvedData, context, addDataResolverSubsription, req}) {
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

        if(segment.request?.headers?.cookie==="FROM_CURRENT_REQUEST"){
            segment.request.headers.cookie = req.headers.cookie
        }

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
                clientId: context.clientId,
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
                clientId: context.clientId,
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



const resolveTranslations = (resolvedData, segment, context) => {
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
}