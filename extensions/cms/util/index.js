import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import Hook from 'util/hook'
import Util from 'api/util'
import {getHostFromHeaders} from 'util/host'
import Cache from 'util/cache'
import {
    CAPABILITY_MANAGE_KEYVALUES
} from 'util/capabilities'
import phantom from 'phantom'

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
                let segments = JSON.parse(dataResolver)
                if (segments.constructor === Object) segments = [segments]

                for (let i = 0; i < segments.length; i++) {

                    debugInfo = ''

                    let tempPhantom
                    if (segments[i].phantom) {
                        // exclude pipline from replacements
                        tempPhantom = segments[i].phantom.pipeline
                        segments[i].phantom.pipeline = null
                    }
                    const tpl = new Function(`const {${Object.keys(scope).join(',')}} = this.scope
                                              const {data} = this
                                              return \`${JSON.stringify(segments[i])}\``)

                    const replacedSegmentStr = tpl.call({scope, data: resolvedData})
                    const segment = JSON.parse(replacedSegmentStr)


                    if (tempPhantom) {
                        segment.phantom.pipeline = tempPhantom
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
                        //TODO implement

                    } else if (segment.tr) {
                        resolvedData.tr = segment.tr[context.lang]
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

                    } else if (segment.phantom) {

                        if (segment.phantom.if && segment.phantom.if !== 'true') {
                            continue
                        }

                        const {url, pipeline} = segment.phantom


                        const instance = await phantom.create(['--ignore-ssl-errors=yes', '--load-images=no'], {
                            logLevel: 'error', viewportSize: {width: 1600, height: 900},
                            settings: {
                                userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:49.0) Gecko/20100101 Firefox/49.0',
                                javascriptEnabled: 'true',
                                loadImages: 'false'
                            }
                        })
                        const page = await instance.createPage();


                        await page.on('onResourceRequested', function (requestData) {
                            //console.info('Requesting', requestData.url)
                        })
                        await page.on('onLoadStarted', function () {
                            //console.info('started')
                        })
                        await page.on('onLoadFinished', function () {
                            //console.info('finshed')
                        })
                        await page.on('onNavigationRequested', function (targetUrl) {
                            console.info('onNavigationRequested', targetUrl)
                        })

                        await page.on('onError', function (msg, trace) {
                            console.error(msg, trace)
                        })

                        await page.on('onConsoleMessage', function (msg, lineNum, sourceId) {
                            console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
                        })

                        /*await page.on('onResourceRequested', function(requestData) { console.info('Requesting', requestData.url); });*/
                        const status = await page.open(url)
                        let data = {}
                        if (pipeline) {

                            const evalFunc = (evalData) => {
                                let evalStr
                                if (evalData.constructor === Array) {
                                    evalStr = evalData.join('\n')
                                } else {
                                    evalStr = evalData
                                }
                                return page.evaluate(function (evalStr) {
                                    const tpl = new Function(evalStr)
                                    return tpl.call({})
                                }, evalStr)

                            }

                            for (const pipeObj of pipeline) {

                                const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope;const {data} = this; return `' + JSON.stringify(pipeObj) + '`;')
                                const pipeReplaceStr = tpl.call({scope, data: resolvedData})
                                const pipe = JSON.parse(pipeReplaceStr)

                                if (pipe.waitFor) {
                                    const startTime = new Date()
                                    const timeout = pipe.waitFor.timeout || 10000
                                    let isValid = false
                                    while (timeout > (new Date() - startTime)) {
                                        const tmpData = await evalFunc(pipe.waitFor.eval)
                                        if (tmpData) {
                                            isValid = true
                                            break
                                        }
                                        await Util.sleep(50)
                                    }
                                    if (!isValid) {
                                        break
                                    }

                                } else if (pipe.eval) {
                                    const tmpData = await evalFunc(pipe.eval)
                                    if (tmpData) {
                                        data = {...data, ...tmpData}
                                    }
                                } else if (pipe.open) {
                                    await page.open(pipe.open)
                                } else if (pipe.fetch) {

                                    let headers = ''

                                    if (pipe.fetch.headers) {

                                        Object.entries(pipe.fetch.headers).forEach(header => {
                                            headers += 'req.setRequestHeader(\'' + header[0] + '\', \'' + header[1] + '\')\n'
                                        })
                                    }
                                    const tmpData = await evalFunc(`const req = new XMLHttpRequest()
                                    req.open('${pipe.fetch.methode || 'post'}', '${pipe.fetch.url}', false)
                                    req.setRequestHeader('Content-type', 'application/x-www-form-urlencoded')
                                    ${headers}

                                    req.send('${pipe.fetch.data}')
                                    return req`)

                                    if (tmpData) {
                                        data = {...data, [pipe.fetch.key || 'fetchResult']: tmpData}
                                    }

                                }
                                resolvedData[segment.key || 'phantom'] = {eval: data, debug: 'debug infos'}
                            }
                        }

                        await instance.exit()


                    } else {
                        console.log('call cmsCustomResolver', segment)
                        Hook.call('cmsCustomResolver', {resolvedData, resolver: segment})
                    }

                }
                delete resolvedData._data
            } catch (e) {
                resolvedData.error = e.message + ' -> scope=' + JSON.stringify(scope) + debugInfo
            }
        }
        return {resolvedData, subscriptions}
    }
}

export default UtilCms