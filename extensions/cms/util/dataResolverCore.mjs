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
        const tpl = new Function(`
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
        const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope; const {data} = this;' + segment.eval)
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
