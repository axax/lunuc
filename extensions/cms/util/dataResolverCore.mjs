// extensions/cms/util/dataResolverCore.mjs
//
// Parts of resolveData (dataResolver.mjs) that are shared between the api
// thread and the dataResolver worker threads (dataResolverWorker.mjs):
// templating of a segment and the "pure" segment types that only work on
// data (data, _data, eval, reduce, keyValueGlobals). The code is moved here
// 1:1 from resolveData, so both threads execute exactly the same logic.
//
// This module must stay importable as native ESM (no babel-only syntax, no
// JSX, no imports of api-only modules like the http server or subscriptions),
// because the worker loads it without babel.

import {ObjectId} from 'mongodb'
import ApiUtil from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_KEYVALUES} from '../../../util/capabilities.mjs'
import config from '../../../gensrc/config.mjs'
import {resolveReduce} from './resolver/resolveReduce.mjs'
import {fixAndParseJSON} from '../../../client/util/fixJson.mjs'

/*
 Compiled functions of the data resolver (templates, $if, d, eval) by their code. The code only
 depends on the segment and the names of the scope keys, so the same function is used again
 instead of compiling it on every request (same as the fnCache of JsonDom in the browser).
 LRU: a hit moves the entry to the end of the Map, the first key is the least recently used.
 */
const COMPILED_FN_CACHE_MAX = 1000
const compiledFnCache = new Map()

export const compileCached = (code) => {
    let fn = compiledFnCache.get(code)
    if (fn) {
        compiledFnCache.delete(code)
        compiledFnCache.set(code, fn)
        return fn
    }
    // throws on syntax errors -> nothing gets cached
    fn = new Function(code)
    if (compiledFnCache.size >= COMPILED_FN_CACHE_MAX) {
        compiledFnCache.delete(compiledFnCache.keys().next().value)
    }
    compiledFnCache.set(code, fn)
    return fn
}

export function addDebugInfos(resolvedData, segment, startTime, startTimeSegment, debugLog) {
    resolvedData[segment.debug.key || segment.debug] = {
        totalTime: new Date().getTime() - startTime,
        segmentTime: new Date().getTime() - startTimeSegment,
        log: debugLog
    }
}
function unescapeControlChars(str) {
    return str.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
}
const UNESCAPE_RE = /\\([nrtbf\\'"`])/g;
const UNESCAPE_MAP = { n:'\n', r:'\r', t:'\t', b:'\b', f:'\f' };


const isDynamicValue = (value) => typeof value === 'string' && (value.includes('${') || value.includes('###'))

/**
 * Makes sure that the inserted values only changed values, not the structure of the segment.
 *
 * Values from the request (params, props, page.referer ...) are inserted into the JSON text of
 * the segment. A value with a quote could otherwise add its own keys or override existing ones
 * (JSON.parse takes the last of duplicate keys), e.g. "t":"User" or "d"/"$if" - which
 * typeResolver evaluates as code. So:
 * - every object must have exactly the keys of the raw segment
 * - values without a template expression must be unchanged
 * Values with ${...} may change (also into objects / arrays with "###").
 * Returns the path of the first difference or null.
 */
const normalizeStatic = str => str.replace(/[\s\\]/g, '')

// Returns the path of the first difference or null. The path is only built when a difference
// is found (this runs for every templated segment of every request).
export const findSegmentStructureChange = (raw, templated) => {
    if (raw === templated || isDynamicValue(raw)) {
        return null
    }
    if (raw === null || typeof raw !== 'object') {
        if (typeof raw === 'string' && typeof templated === 'string') {
            // static strings: the templating unescapes control characters and backslashes
            return normalizeStatic(raw) === normalizeStatic(templated) ? null : '/'
        }
        return '/'
    }
    if (templated === null || typeof templated !== 'object' || Array.isArray(raw) !== Array.isArray(templated)) {
        return '/'
    }
    if (Array.isArray(raw)) {
        if (raw.length !== templated.length) {
            // one templated entry can expand into several ("###${list}###")
            return raw.some(isDynamicValue) ? null : '/'
        }
        for (let i = 0; i < raw.length; i++) {
            const change = findSegmentStructureChange(raw[i], templated[i])
            if (change) return '/' + i + (change === '/' ? '' : change)
        }
        return null
    }

    // keys can be templated as well ("${cond?'before':'#'}") - each of them results in one key
    let staticKeyCount = 0, dynamicKeyCount = 0
    for (const key in raw) {
        if (key.includes('${')) {
            dynamicKeyCount++
            continue
        }
        staticKeyCount++
        if (!(key in templated)) {
            return '/' + key
        }
        const change = findSegmentStructureChange(raw[key], templated[key])
        if (change) return '/' + key + (change === '/' ? '' : change)
    }
    let templatedKeyCount = 0
    for (const key in templated) templatedKeyCount++
    if (templatedKeyCount - staticKeyCount > dynamicKeyCount) {
        const added = Object.keys(templated).filter(key => !(key in raw))
        return '/' + (added[added.length - 1] || '')
    }
    return null
}

/**
 * Replaces the template expressions of one (raw) segment and returns the
 * resulting segment object. Moved 1:1 from resolveData.
 */
export const templateSegment = (rawSegment, {scope, resolvedData, context, editmode, dynamic}) => {
    let tempBrowser
    if (rawSegment.website) {
        // exclude pipline from replacements
        tempBrowser = rawSegment.website.pipeline
        rawSegment.website.pipeline = null
    }

    let segmentStr = JSON.stringify(rawSegment)

    // tpl nur ausführen wenn Template-Expressions vorhanden
    const needsTemplate = segmentStr.includes('${')

    let segment
    if (needsTemplate) {
        const tpl = compileCached(`
            const {${Object.keys(scope).join(',')}} = this.scope
            const {data} = this
            const Util = this.ClientUtil
            const _e = Util.escapeForJson
            const ApiUtil = this.ApiUtil
            const ObjectId = this.ObjectId
            return \`${unescapeControlChars(segmentStr)}\`
        `)

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

        const parsedJson = fixAndParseJSON(replacedSegmentStr)
        if(!parsedJson.fixed && parsedJson.errors.length > 0) {
            throw new Error(parsedJson.errors[0])
        }
        segment = parsedJson.json

        const change = findSegmentStructureChange(rawSegment, segment)
        if (change) {
            // most likely a request value with quotes that tried to inject keys
            console.warn(`dataResolver: segment structure changed by inserted values at ${change} - segment ignored`)
            throw new Error('Invalid parameters in data resolver')
        }

        // "$if" and "d" (as string) are executed as code by the type resolver. If they contain a
        // template expression, the inserted value could come from the request:
        // - $if: the result is used as a value (true / false), not executed
        // - d: not allowed
        if (isDynamicValue(rawSegment.$if) && typeof segment.$if === 'string') {
            segment.$if = !['', 'false', '0', 'undefined', 'null', 'NaN'].includes(segment.$if.trim())
        }
        if (isDynamicValue(rawSegment.d) && typeof segment.d === 'string') {
            throw new Error('Template expressions in "d" are not allowed')
        }
        if (isDynamicValue(rawSegment.eval)) {
            throw new Error('Template expressions in "eval" are not allowed')
        }
    } else {
        const needsUnescape = segmentStr.includes('\\')
        if(needsUnescape || segmentStr.includes('###')){
            segmentStr = segmentStr.replace(/"###/g, '').replace(/###"/g, '')
            if(needsUnescape) {
                try {
                    segment = JSON.parse(segmentStr.replace(UNESCAPE_RE, (_, c) => UNESCAPE_MAP[c] ?? c))
                }catch (e){
                    segment = JSON.parse(segmentStr)
                }
            }else{
                segment = JSON.parse(segmentStr)
            }
        }else{
            segment = rawSegment
        }
    }


    if (tempBrowser) {
        segment.website.pipeline = tempBrowser
    }

    // a website url or pipeline with template expressions may contain values from the request -
    // the headless browser may then only open public http(s) urls (see browser.mjs)
    if (segment.website && (isDynamicValue(rawSegment.website?.url) ||
        (tempBrowser && JSON.stringify(tempBrowser).includes('${')))) {
        segment.website._restrictNetwork = true
    }

    return segment
}

/**
 * The segment type resolveData dispatches to. Same checks in the same order as
 * the if/else chain in resolveData - a segment with several type keys is
 * handled by the first one that matches.
 */
export const segmentKind = (segment) => {
    if (segment.access) return 'access'
    if (segment._data) return '_data'
    if (segment.resolveFrom) return 'resolveFrom'
    if (segment.data) return 'data'
    if (segment.t) return 't'
    if (segment.request) return 'request'
    if (segment.tr) return 'tr'
    if (segment['eval']) return 'eval'
    if (segment.reduce) return 'reduce'
    if (segment.subscription) return 'subscription'
    if (segment.system) return 'system'
    if (segment.keyValueGlobals) return 'keyValueGlobals'
    if (segment.session) return 'session'
    if (segment.user) return 'user'
    if (segment.keyValues) return 'keyValues'
    if (segment.website) return 'website'
    return 'custom'
}

// segment types that only work on data and can run in a worker thread
export const WORKER_SEGMENT_KINDS = new Set(['_data', 'data', 'eval', 'reduce', 'keyValueGlobals'])

// segment.data
export const resolveDataSegment = (segment, resolvedData) => {
    Object.keys(segment.data).forEach(k => {
        resolvedData[k] = segment.data[k]
    })
}

// segment.eval
export const resolveEvalSegment = (segment, resolvedData, scope, context) => {
    try {
        const tpl = compileCached('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
        tpl.call({data: resolvedData, scope, context})
    } catch (e) {
        if (!segment.ignoreError)
            throw e
    }
}

// segment.reduce
export const resolveReduceSegment = (segment, resolvedData, debugLog) => {
    try {
        resolveReduce(segment.reduce, resolvedData, resolvedData, {debugLog, debug: !!segment.debug})
    } catch (e) {
        debugLog.push({type:'error', message:`segment ${segment.key} can not be reduced: ${e.message}`})
        console.warn(`segment ${segment.key} can not be reduced`, e)
    }
}

// segment.keyValueGlobals
export const resolveKeyValueGlobalsSegment = async ({segment, db, context, resolvedData, subscriptions}) => {

    // if user don't have capability to manage keys he can only see the public ones
    const onlyPublic = segment.public!==undefined?segment.public:!await ApiUtil.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)
    const dataKey = segment.key || 'keyValueGlobals'

    const map = await ApiUtil.keyValueGlobalMap(db, context, segment.keyValueGlobals, {
        public: onlyPublic,
        cache: true,
        parse: true,
        includeMetaData: segment.includeMetaData
    })

    resolvedData[dataKey] = map

    if(segment.subscribe) {
        subscriptions.push({query: 'action keys data{_id key value}',
            variables:{'keys':JSON.stringify(segment.keyValueGlobals)},
            autoUpdate:true,
            updateMap: [{toKey:`${dataKey}.\${fromKey}`,fromKey:'key', fromValueKey: 'value', parse:true}],
            callback: false, name: 'subscribeKeyValueGlobal'})
    }
}
