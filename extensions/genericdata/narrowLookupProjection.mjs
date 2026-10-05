/**
 * Narrows the $project of a reference lookup (e.g. User) to the sub fields the
 * query actually requests.
 *
 * The type definition's `projection` (e.g. ['_id','email','username','meta','picture','role'])
 * is a whitelist of what may be resolved at all. Without narrowing every lookup
 * row carries all of it, although the final $project usually keeps only a few
 * fields (e.g. teilnehmer -> _id, username). Smaller rows mean less to copy through
 * the lookup, the positional rebuild and the $mergeObjects.
 *
 * The whitelist is only ever intersected, never extended.
 *
 * Returns null (= keep the full whitelist) when narrowing could change the result:
 * - the filter, sort or a result/lookup filter references a sub field of this
 *   reference other than _id (those run on the resolved rows before the final $project)
 * - nothing usable is left after the intersection
 *
 * @param {string[]} whitelist        field.projection of the type definition
 * @param {object}   requestedProject $project object built from the requested sub fields
 * @param {string}   fieldName        name of the reference field (e.g. 'teilnehmer')
 * @param {object}   otherOptions     resolver options (filter, sort, resultFilter, lookupFilter)
 * @returns {string[]|null}
 */
export function narrowLookupProjection(whitelist, requestedProject, fieldName, otherOptions = {}) {
    if (!Array.isArray(whitelist) || whitelist.length === 0 || !requestedProject) {
        return null
    }
    if (otherOptions.narrowLookupProjection === false) {
        return null
    }

    if (referencesSubField(fieldName, otherOptions)) {
        return null
    }

    const allowed = new Set(whitelist)
    const keys = []
    for (const key of Object.keys(requestedProject)) {
        if (!key) continue
        if (allowed.has(key.split('.')[0]) && !keys.includes(key)) {
            keys.push(key)
        }
    }

    if (keys.length === 0 || (keys.length === 1 && keys[0] === '_id')) {
        return null
    }

    // drop a dotted path when its parent is requested as a whole ({a:1,'a.b':1} is a path collision)
    const result = keys.filter(k => !keys.some(o => o !== k && k.startsWith(o + '.')))

    if (allowed.has('_id') && !result.includes('_id')) {
        result.unshift('_id')
    }
    return result
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function referencesSubField(fieldName, otherOptions = {}) {
    // <field>.<sub> where <sub> is not _id
    const re = new RegExp(`(^|[^\\w$])${escapeRegExp(fieldName)}\\.(?!_id(?![\\w$]))[\\w$]`)
    return [otherOptions.filter, otherOptions.sort, otherOptions.resultFilter, otherOptions.lookupFilter]
        .some(v => v && re.test(typeof v === 'string' ? v : JSON.stringify(v)))
}
