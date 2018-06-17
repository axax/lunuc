import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import Hook from '../../util/hook'
import Util from '.'

const UtilCms = {
    createSegments: (json, scope) => {
        let inSegment = false, segments = [], count = 0, buffer = ''
        json.split('\n').forEach(line => {
            const lineTrimmed = line.trim()
            if (lineTrimmed.indexOf('{') === 0) {
                count++
                if (!inSegment) {
                    inSegment = true
                }
            } else if (lineTrimmed.indexOf('}') === 0) {
                count--
                if (count === 0 && inSegment) {
                    segments.push(buffer + '}')
                    buffer = ''
                    inSegment = false
                }
            }
            if (inSegment) {
                buffer += lineTrimmed
            }
        })
        return segments
    },
    replaceSegment: (str, data) => {

    },
    resolveData: async (db, context, dataResolver, scope, nosession) => {
        const resolvedData = {}, subscriptions = []

        if (dataResolver) {
            let debugInfo = null
            try {
                const segments = UtilCms.createSegments(dataResolver, scope)

                for (let i = 0; i < segments.length; i++) {
                    debugInfo = ''

                    const tpl = new Function('const {' + Object.keys(scope).join(',') + '} = this.scope;const {data} = this; return `' + segments[i] + '`;')
                    const replacedSegmentStr = tpl.call({scope, data: resolvedData})
                    const segment = JSON.parse(replacedSegmentStr)

                    if (segment.t) {
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
                            tpl.call({data: resolvedData, scope})
                        } catch (e) {
                            if (!segment.ignoreError)
                                throw e
                        }
                    } else if (segment.keyValueGlobals) {
                        const match = {key: {$in: segment.keyValueGlobals}}
                        const result = await GenericResolver.entities(db, context, 'KeyValueGlobal', ['key', 'value'], {
                            match
                        })
                        const map = {}
                        if (result.results) {
                            result.results.map(entry => {
                                console.log(entry)
                                try {
                                    map[entry.key] = JSON.parse(entry.value);
                                } catch (e) {
                                    map[entry.key] = entry.value
                                }
                            })
                        }
                        resolvedData[segment.key || 'keyValueGlobals'] = map
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
                                        map[entry.key] = JSON.parse(entry.value);
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
                                        map[key] = JSON.parse(nosessionJson[key]);
                                    } catch (e) {
                                        map[key] = nosessionJson[key]
                                    }
                                }
                            })
                        }

                        resolvedData[segment.key || 'keyValues'] = map

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