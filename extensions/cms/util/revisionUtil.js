import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'

/*
 * Helpers for the revision view of a cms page.
 *
 * A History entry only contains the fields that were saved (meta.keys), with their NEW value.
 * The state of the page at a certain entry is put together from the newest entry <= that entry
 * that contains the field (template, dataResolver, style, ...).
 */

export const REVISION_FIELDS = ['template', 'dataResolver', 'style', 'script', 'serverScript']
// fields a user without CAPABILITY_MANAGE_CMS_TEMPLATE sees and can restore (content + texts)
export const CONTENT_FIELDS = ['template', 'dataResolver']

// saves of the same user with a shorter pause are shown as one session
const SESSION_GAP = 10 * 60 * 1000

export const entryTime = (entry) => Util.dateFromObjectId(entry._id, new Date()).getTime()

export const parseEntryMeta = (entry) => {
    let keys = []
    try {
        keys = (entry.meta ? JSON.parse(entry.meta).keys : []) || []
    } catch (e) {
    }
    return {
        _id: entry._id,
        time: entryTime(entry),
        username: entry.createdBy ? entry.createdBy.username : '?',
        fields: REVISION_FIELDS.filter(f => keys.indexOf(f) >= 0)
    }
}

/**
 * entries: sorted ascending. returns sessions, newest first.
 * each session knows the index range in the entries list
 */
export const groupSessions = (entries) => {
    const sessions = []
    let current = null
    entries.forEach((entry, index) => {
        if (current && current.username === entry.username && entry.time - current.end <= SESSION_GAP) {
            current.end = entry.time
            current.last = index
            current.count++
            entry.fields.forEach(f => current.fields.indexOf(f) < 0 && current.fields.push(f))
        } else {
            current = {
                username: entry.username,
                start: entry.time,
                end: entry.time,
                first: index,
                last: index,
                count: 1,
                fields: [...entry.fields]
            }
            sessions.push(current)
        }
    })
    return sessions.reverse()
}

// --- loading the data of entries (entries never change, so they are cached) ---

// a save of a large page is ~70 KB: only the most recently used entries are kept
const DATA_CACHE_SIZE = 60
const dataCache = new Map()
const cacheGet = (id) => {
    const data = dataCache.get(id)
    if (data !== undefined) {
        // most recently used at the end
        dataCache.delete(id)
        dataCache.set(id, data)
    }
    return data
}
const cacheSet = (id, data) => {
    dataCache.set(id, data)
    while (dataCache.size > DATA_CACHE_SIZE) {
        dataCache.delete(dataCache.keys().next().value)
    }
}

const LOAD_CHUNK = 20

const loadEntryData = async (ids) => {
    const missing = ids.filter(id => id && !dataCache.has(id))
    for (let i = 0; i < missing.length; i += LOAD_CHUNK) {
        await loadEntryChunk(missing.slice(i, i + LOAD_CHUNK))
    }
}

const loadEntryChunk = async (missing) => {
    if (missing.length > 0) {
        const res = await client.query({
            fetchPolicy: 'no-cache',
            query: 'query historys($filter:String,$limit:Int){historys(filter:$filter,limit:$limit){results{_id data}}}',
            variables: {filter: `_id=[${missing.join(',')}]`, limit: missing.length}
        })
        const results = (res && res.data && res.data.historys && res.data.historys.results) || []
        results.forEach(r => {
            let data = {}
            try {
                data = JSON.parse(r.data)
            } catch (e) {
            }
            cacheSet(r._id, data)
        })
    }
}

/**
 * index of the entry that holds the value of field at the state of entries[index]
 */
const sourceIndex = (entries, index, field) => {
    for (let i = index; i >= 0; i--) {
        if (entries[i].fields.indexOf(field) >= 0) {
            return i
        }
    }
    return -1
}

/**
 * state of the page after entries[index] for every index in indices.
 * index -1 means "before the first entry": unknown, the fallback (current page) is used.
 * fields that never appear in the loaded entries come from fallback as well.
 */
export const loadStates = async (entries, indices, fallback) => {
    const plan = indices.map(index => {
        const sources = {}
        REVISION_FIELDS.forEach(field => {
            const si = index >= 0 ? sourceIndex(entries, index, field) : -1
            sources[field] = si >= 0 ? entries[si]._id : null
        })
        return sources
    })
    const ids = []
    plan.forEach(sources => Object.values(sources).forEach(id => id && ids.indexOf(id) < 0 && ids.push(id)))
    await loadEntryData(ids)

    return plan.map(sources => {
        const state = {_sources: sources}
        REVISION_FIELDS.forEach(field => {
            const id = sources[field]
            const data = id && cacheGet(id)
            state[field] = data && data[field] !== undefined ? data[field] : fallback[field]
        })
        return state
    })
}

/**
 * a save contains all fields that were sent (meta.keys), also unchanged ones (e.g. imports send everything).
 * returns {entryId: true|false} for the entries that contain field: true if the value really changed
 * compared to the previous entry with that field (the first one counts as a change)
 */
export const findFieldChanges = async (pageId, field, limit) => {
    // compared on the server: only a flag per entry is transferred, not the content of every save
    const res = await client.query({
        fetchPolicy: 'no-cache',
        query: 'query cmsPageHistoryChanges($_id:ID!,$field:String!,$limit:Int){cmsPageHistoryChanges(_id:$_id,field:$field,limit:$limit)}',
        variables: {_id: pageId, field, limit}
    })
    const json = res && res.data && res.data.cmsPageHistoryChanges
    return json ? JSON.parse(json) : {}
}

// --- translations ---------------------------------------------------------------------------

const UNESCAPE_RE = /\\([nrtbf\\'"`])/g
const UNESCAPE_MAP = {n: '\n', r: '\r', t: '\t', b: '\b', f: '\f'}

/**
 * the texts of the tr segments in a data resolver for the current language
 * (same rules as resolveTranslations on the server, without template expressions)
 */
export const extractTranslations = (dataResolver, lang = _app_.lang) => {
    const tr = {}
    if (!dataResolver) {
        return tr
    }
    let segments
    try {
        segments = typeof dataResolver === 'string' ? JSON.parse(dataResolver) : dataResolver
    } catch (e) {
        return tr
    }
    if (!segments) {
        return tr
    }
    if (segments.constructor === Object) {
        segments = [segments]
    }
    segments.forEach(raw => {
        if (!raw || !raw.tr || raw.tr.constructor !== Object) {
            return
        }
        let segment = raw
        const str = JSON.stringify(raw)
        if (str.indexOf('${') < 0 && str.indexOf('\\') >= 0) {
            try {
                segment = JSON.parse(str.replace(UNESCAPE_RE, (_, c) => UNESCAPE_MAP[c] ?? c))
            } catch (e) {
                segment = raw
            }
        }
        if (segment.forceLanguage) {
            Object.assign(tr, segment.tr[segment.forceLanguage])
        } else if (segment.defaultLanguage) {
            Object.assign(tr, segment.tr[_app_.defaultLang], segment.tr[segment.defaultLanguage], segment.tr[lang])
        } else {
            Object.assign(tr, segment.tr[lang])
        }
    })
    return tr
}

/**
 * resolvedData for the preview of an older state: the texts come from the data resolver of that state.
 * only translations that differ from the current data resolver are replaced, everything else stays as resolved
 * by the server (data that is loaded by the resolver can not be restored anyway)
 */
export const resolvedDataForState = (state, cmsPage) => {
    if (!cmsPage.resolvedData || state.dataResolver === cmsPage.dataResolver) {
        return cmsPage.resolvedData
    }
    const trNow = extractTranslations(cmsPage.dataResolver), trThen = extractTranslations(state.dataResolver)
    const changed = {}
    Object.keys({...trNow, ...trThen}).forEach(key => {
        if (trNow[key] !== trThen[key]) {
            changed[key] = trThen[key] !== undefined ? trThen[key] : ''
        }
    })
    if (Object.keys(changed).length === 0) {
        return cmsPage.resolvedData
    }
    try {
        const resolved = JSON.parse(cmsPage.resolvedData)
        resolved.tr = {...(resolved.tr || {}), ...changed}
        return JSON.stringify(resolved)
    } catch (e) {
        return cmsPage.resolvedData
    }
}

// --- summary of a change -----------------------------------------------------------------------

const TR_PLACEHOLDER_RE = /\$\{_t\('([^']+)'[^}]*\)\}/g

const toPlainText = (value, tr) => {
    let text = value.replace(TR_PLACEHOLDER_RE, (_, key) => tr[key] !== undefined ? tr[key] : '')
    if (text.indexOf('${') >= 0) {
        // other template expressions can not be evaluated here
        text = text.replace(/\$\{[^}]*\}/g, '…')
    }
    return text.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

// text content of the template by path, and the number of elements
const extractTexts = (template, tr) => {
    const texts = {}
    let elements = 0
    let json
    try {
        json = typeof template === 'string' ? JSON.parse(template) : template
    } catch (e) {
        return null
    }
    const walk = (node, path) => {
        if (!node || typeof node !== 'object') {
            return
        }
        if (Array.isArray(node)) {
            node.forEach((child, i) => walk(child, path + '.' + i))
            return
        }
        if (node.t !== undefined) {
            elements++
        }
        ['c', '$c'].forEach(key => {
            const value = node[key]
            if (typeof value === 'string') {
                const text = toPlainText(value, tr)
                if (text) {
                    texts[path + '.' + key] = text
                }
            } else if (value && typeof value === 'object') {
                walk(value, path + '.' + key)
            }
        })
    }
    walk(json, '')
    return {texts, elements}
}

// only the part that changed, with a bit of context
const shortenChange = (from, to, max = 40) => {
    let start = 0
    while (start < from.length && start < to.length && from[start] === to[start]) start++
    let end = 0
    while (end < from.length - start && end < to.length - start &&
    from[from.length - 1 - end] === to[to.length - 1 - end]) end++
    const context = 12
    const cut = (s) => {
        const a = Math.max(0, start - context), b = Math.min(s.length, s.length - end + context)
        let part = s.substring(a, b)
        if (part.length > max) part = part.substring(0, max) + '…'
        return (a > 0 ? '…' : '') + part + (b < s.length ? '…' : '')
    }
    return {from: cut(from), to: cut(to)}
}

/**
 * what changed from prev to state, as short lines for the list and the dialog.
 * returns {texts: [{from,to}], lines: [string], fields: [field]}
 */
export const summarizeChange = (prev, state, labels, onlyFields = REVISION_FIELDS) => {
    const result = {texts: [], lines: [], fields: []}
    if (!prev) {
        return result
    }
    // the value before the first entry with a field is not known (History stores the new values only)
    const unknownBefore = (field) => !!(prev._sources && state._sources && !prev._sources[field] && state._sources[field])
    onlyFields.forEach(field => {
        if (unknownBefore(field)) {
            result.fields.push(field)
            result.lines.push(labels.firstRecorded(field))
        } else if (prev[field] !== state[field]) {
            result.fields.push(field)
        }
    })
    let textsChanged = false
    const withTexts = (onlyFields.indexOf('template') >= 0 || onlyFields.indexOf('dataResolver') >= 0) &&
        !unknownBefore('template') && !unknownBefore('dataResolver')
    if (withTexts && (prev.template !== state.template || prev.dataResolver !== state.dataResolver)) {
        const a = extractTexts(prev.template, extractTranslations(prev.dataResolver)),
            b = extractTexts(state.template, extractTranslations(state.dataResolver))
        if (a && b) {
            let added = 0, removed = 0
            Object.keys(b.texts).forEach(path => {
                if (a.texts[path] === undefined) {
                    added++
                } else if (a.texts[path] !== b.texts[path]) {
                    result.texts.push(shortenChange(a.texts[path], b.texts[path]))
                }
            })
            Object.keys(a.texts).forEach(path => {
                if (b.texts[path] === undefined) removed++
            })
            const elementDiff = b.elements - a.elements
            if (elementDiff > 0) {
                result.lines.push(labels.elementsAdded(elementDiff))
            } else if (elementDiff < 0) {
                result.lines.push(labels.elementsRemoved(-elementDiff))
            } else if (added || removed) {
                result.lines.push(labels.textsMoved)
            }
            textsChanged = result.texts.length > 0 || result.lines.length > 0
            if (!textsChanged && prev.template !== state.template && onlyFields.indexOf('template') >= 0) {
                result.lines.push(labels.properties)
                textsChanged = true
            }
        }
    }
    result.fields.forEach(field => {
        if (unknownBefore(field) || field === 'template' || (field === 'dataResolver' && textsChanged)) {
            return
        }
        result.lines.push(labels.fieldChanged(field))
    })
    return result
}

// language of the admin ui (the user setting), not the language of the page
export const relativeTime = (time, lang = (_app_.user && _app_.user.language) || _app_.lang) => {
    const diff = (time - Date.now()) / 1000
    const abs = Math.abs(diff)
    let rtf
    try {
        rtf = new Intl.RelativeTimeFormat(lang, {numeric: 'auto'})
    } catch (e) {
        return ''
    }
    if (abs < 60) return rtf.format(0, 'second')
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
    return ''
}
