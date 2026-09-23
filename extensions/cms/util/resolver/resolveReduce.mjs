import {assignIfObjectOrArray, matchExpr, pathToParts, propertyByPath, setPropertyByPath} from '../../../../client/util/json.mjs'
import Cache from '../../../../util/cache.mjs'

// Single shared collator instance. Intl.Collator.prototype.compare is significantly
// faster than calling String.prototype.localeCompare for every single comparison
// during a sort, while producing the same ordering for the default locale.
const localeCollator = new Intl.Collator()

// Reused scope object for matchExpr. matchExpr only reads from it and keeps no
// reference, and checkFilter always returns before any nested resolveReduce runs,
// so a single shared instance is safe. Saves one object allocation per item/filter
// and keeps the shape monomorphic.
const matchScope = {key: null, value: null}

// ---------------------------------------------------------------------------
// Debug output
//
// Only collected when the caller asks for it (dataResolver passes
// debug: !!segment.debug). Without debug, nothing of this runs apart from a few
// null checks, and debugInfo is null everywhere.
//
// One entry per top-level step is pushed to debugLog:
//   {index, type, path?, key?, start, time, messages?, stats?, nested?, error?}
// - start / time: ms since the start of the resolveReduce call / duration of the
//   step, measured with performance.now() (0.001 ms precision)
// - stats: numbers depending on the step type (see the step implementations)
// - nested: steps of nested pipelines (loop.reduce, reduce), aggregated per step
//   config: {index, type, path?, key?, depth, calls, time, errors?, error?}.
//   Times are inclusive (a nested loop contains its own nested steps) and include
//   the measuring overhead.
// - error: message of the error the step threw (the error itself is rethrown
//   unchanged)
// Steps skipped by $is: false are logged as {index, type, path?, key?, skipped: true}.

// performance.now() at the start of the current top-level call (debug only)
let debugStart = 0
// Map<step config, aggregated stats> while a top-level step runs with debug,
// null otherwise. Nested steps are only measured while it is set.
let nestedStats = null

const r3 = x => Math.round(x * 1000) / 1000

// JSON representation for debug messages, never throws
function q(x) {
    try {
        return JSON.stringify(x)
    } catch (e) {
        return '?'
    }
}

function errorMessage(e) {
    try {
        return e && e.message !== undefined ? String(e.message) : String(e)
    } catch (_) {
        return 'unknown error'
    }
}

// same precedence as the if/else chain in runPipe
function stepType(re) {
    if (re.sort) return 'sort'
    if (re.lookup) return 'lookup'
    if (re.random) return 'random'
    if (re.set) return 'set'
    if (re.key) return 'key'
    if (re.loop) return 'loop'
    if (re.reduce) return 'reduce'
    if (re.limit) return 'limit'
    if (re.remove) return 'remove'
    return 'none'
}

// short identification of a step (instead of logging the full config)
function describeStep(re, index) {
    const d = {index, type: stepType(re)}
    if (re.path !== undefined) d.path = re.path
    if (re.key !== undefined) d.key = re.key
    return d
}

function debugStats(debugInfo) {
    return debugInfo.stats || (debugInfo.stats = {})
}

function recordNested(re, index, depth, t0, e, failed) {
    let rec = nestedStats.get(re)
    if (rec === undefined) {
        rec = describeStep(re, index)
        rec.depth = depth
        rec.calls = 0
        rec.time = 0
        nestedStats.set(re, rec)
    }
    rec.calls++
    rec.time += performance.now() - t0
    if (failed) {
        rec.errors = (rec.errors || 0) + 1
        rec.error = errorMessage(e)
    }
}

function finishDebugInfo(debugInfo, t0) {
    debugInfo.time = r3(performance.now() - t0)
    if (debugInfo.messages.length === 0) {
        delete debugInfo.messages
    }
    if (nestedStats.size > 0) {
        const nested = []
        for (const rec of nestedStats.values()) {
            rec.time = r3(rec.time)
            nested.push(rec)
        }
        debugInfo.nested = nested
    }
    nestedStats = null
}
// ---------------------------------------------------------------------------

// Attach a derived value to a config object without making it visible to
// Object.keys() or JSON.stringify()
function defineHidden(obj, key, value) {
    Object.defineProperty(obj, key, {
        value,
        enumerable: false,
        writable: true,
        configurable: true
    })
    return value
}

// ---------------------------------------------------------------------------
// Duplicate check for key/toArray (without `duplicates`).
//
// indexOf compares the new value with every entry collected so far, which makes
// collecting many distinct values in a loop quadratic (20'000 distinct ids:
// ~400 ms). Instead, a Set per target array remembers which values the array
// already contains, so the check is O(1).
//
// The index must always describe the current array content exactly, otherwise
// the result would differ from indexOf:
// - Appending (push) is picked up automatically: on every check the entries that
//   were added since the last check are added to the Set.
// - Every other in-place modification in this file (sort, remove, limit, element
//   writes, writes through setPropertyByPath / propertyByPath with assign, ...)
//   calls touch() / touchPath() for the modified object, which discards its index.
//   The next check then rebuilds it from the current content.
// RULE: new code that modifies an existing object/array in place other than by
// push must call touch(obj) (or touchPath for path writes).
//
// The index only lives for one top-level resolveReduce call (reset in the
// exported function), so code outside (other segments, eval, ...) can never make
// it stale. As long as no key/toArray check happened in the current call,
// uniqueIndex is null and touch()/touchPath() cost a single comparison.
let uniqueIndex = null

const ARRAY_INDEX_OF = Array.prototype.indexOf
const ARRAY_PUSH = Array.prototype.push

// Discard the index of an object that is modified in place
function touch(obj) {
    if (uniqueIndex !== null) {
        uniqueIndex.delete(obj) // no-op for untracked objects and primitives
    }
}

// setPropertyByPath and propertyByPath(..., assign) write into every object along
// the path (create missing intermediate objects, replace entries by copies, set
// the final value). Discard the index of all of them. Called right after the
// write, so the walk follows the same references the write used.
function touchPath(path, obj) {
    if (uniqueIndex === null || !path) {
        return
    }
    const parts = pathToParts(path)
    let o = obj
    for (let i = 0, last = parts.length - 1; i <= last && o; i++) {
        uniqueIndex.delete(o)
        if (i < last) {
            o = o[parts[i]]
        }
    }
}

// Only real arrays with the built-in indexOf/push use the index (push must append,
// which the incremental update relies on). Everything else keeps calling indexOf
// exactly as before (same behavior, same errors).
function canUseIndex(arr) {
    return Array.isArray(arr) && arr.indexOf === ARRAY_INDEX_OF && arr.push === ARRAY_PUSH
}

// Same result as arr.indexOf(v) >= 0
function indexHas(arr, v) {
    if (v !== v) {
        // NaN: indexOf never finds it (strict equality), a Set would
        return false
    }
    if (uniqueIndex === null) {
        uniqueIndex = new WeakMap()
    }
    let rec = uniqueIndex.get(arr)
    const len = arr.length
    if (rec === undefined || len < rec.len) {
        rec = {set: new Set(), len: 0}
        uniqueIndex.set(arr, rec)
    }
    const set = rec.set
    for (let i = rec.len; i < len; i++) {
        // indexOf skips holes, so they must not end up in the Set as undefined
        if (i in arr) {
            set.add(arr[i])
        }
    }
    rec.len = len
    // Set compares with SameValueZero: identical to === except for NaN (handled above)
    return set.has(v)
}
// ---------------------------------------------------------------------------

function createFacetSliderMinMax(value, facetData) {
    if (!isNaN(value)) {
        if (facetData.min === undefined || facetData.min > value) {
            facetData.min = value === null ? 0 : value
        }
        if (facetData.max === undefined || facetData.max < value) {
            facetData.max = value
        }
    } else {
        if (!facetData.otherValues) {
            facetData.otherValues = []
        }
        if (!facetData.otherValues.includes(value)) {
            facetData.otherValues.push(value)
        }
    }
}

function addFacetValue(currentFacet, facetValue) {
    const values = currentFacet.values
    const existing = values[facetValue]
    if (!existing) {
        values[facetValue] = {
            value: facetValue,
            count: 1
        }
        touch(values)
    } else {
        existing.count++
    }
}

// Per-run view of the facet configs used by createFacets. The facet objects
// themselves (copies made by getFacetAsArray) come in many different shapes
// (whatever the config contains, plus beforeFilter/values/min/max added later), so
// reading facet.key / facet.type / facet.beforeFilter in the hot loop goes through
// megamorphic property lookups. The slots all share one shape and hold the values
// that cannot change during a run:
// - key and isSlider: read from the facet copy, which only createFacets mutates
//   and never on these two properties
// - before: the facet's beforeFilter object, resolved lazily on first use exactly
//   like before (facet.beforeFilter || (facet.beforeFilter = {})). The facet copy is
//   private to this run and beforeFilter is only ever assigned here, so once
//   resolved it stays the same object.
// Everything that lives on shared objects (values, min, max, ...) is still read
// from the target object on every call.
function createFacetSlots(loopFacet) {
    const len = loopFacet.length
    const slots = new Array(len)
    for (let i = 0; i < len; i++) {
        const facet = loopFacet[i]
        slots[i] = {facet, key: facet.key, isSlider: facet.type === 'slider', before: null}
    }
    return slots
}

const createFacets = (slots, data, beforeFilter) => {
    if (slots && data) {
        const slotsLength = slots.length
        for (let i = 0; i < slotsLength; i++) {
            const slot = slots[i]
            let currentFacet
            if (beforeFilter) {
                currentFacet = slot.before
                if (!currentFacet) {
                    const facet = slot.facet
                    currentFacet = slot.before = (facet.beforeFilter || (facet.beforeFilter = {}))
                }
            } else {
                currentFacet = slot.facet
            }
            const facetValue = data[slot.key]
            if (slot.isSlider) {
                if (Array.isArray(facetValue)) {
                    const len = facetValue.length
                    for (let j = 0; j < len; j++) {
                        createFacetSliderMinMax(facetValue[j], currentFacet)
                    }
                } else {
                    createFacetSliderMinMax(facetValue, currentFacet)
                }
            } else {
                if (!currentFacet.values) {
                    // null prototype: used as a plain dictionary, so keys like
                    // '__proto__' or 'constructor' must not resolve to inherited members
                    currentFacet.values = Object.create(null)
                }
                if (Array.isArray(facetValue)) {
                    const len = facetValue.length
                    for (let j = 0; j < len; j++) {
                        addFacetValue(currentFacet, facetValue[j])
                    }
                } else {
                    addFacetValue(currentFacet, facetValue || '')
                }
            }
        }
    }
}

const isNotFalse = ($is) => {
    return $is !== false && $is !== 'false'
}

function getFacetAsArray(path, rootData) {
    const loopFacet = propertyByPath(path, rootData)
    if (loopFacet) {
        const keys = Object.keys(loopFacet)
        const len = keys.length
        const result = new Array(len)
        for (let i = 0; i < len; i++) {
            const key = keys[i]
            result[i] = { ...loopFacet[key], key }
        }
        return result
    }
}

function setFacetToObject(path, rootData, loopFacet) {
    const facets = propertyByPath(path, rootData)
    const len = loopFacet.length
    for (let i = 0; i < len; i++) {
        const facet = loopFacet[i]
        facets[facet.key] = facet
        delete facet.key
    }
    touch(facets)
}

// Resolve `lookups` on a facets config: for every facet value entry, look the value
// up in a keyed table (resolved from the root scope) and copy the mapped fields onto
// the facet value. map maps sourceField (in the table entry) -> facetField.
// [{ path: "pim.map.object", map: { title: "name" } }] turns
// { value: 139, count: 3 } into { name: "T139", value: 139, count: 3 }.
function applyFacetLookups(facetsConfig, loopFacet, rootData) {
    const lookups = facetsConfig.lookups
    if (!lookups || !loopFacet) return
    // resolve each lookup table once - constant for the whole facet run
    // Resolve each lookup table once - constant for the whole facet run.
    // A lookup with `facetKey` only applies to the facet with that name (loopFacet key);
    // lookups without facetKey apply to all facets. Precompute the tables and the
    // pre-filtered filter arrays per lookup, and the matching lookup indices per facet,
    // so the per-value work stays O(lookups-for-that-facet).
    const tables = new Array(lookups.length)
    const activeFiltersPerLookup = new Array(lookups.length)
    for (let i = 0; i < lookups.length; i++) {
        tables[i] = lookups[i].path ? propertyByPath(lookups[i].path, rootData) : null
        const f = lookups[i].filter
        activeFiltersPerLookup[i] = f ? f.filter(fl => isNotFalse(fl.is)) : null
    }
    // Precompute the facet -> lookup indices mapping ONCE for the whole run:
    // lookups without facetKey apply to all facets (global list), lookups with
    // facetKey are grouped by that key. Per facet we only concat two (usually
    // small) lists instead of scanning all lookups again.
    const globalLookupIndices = []
    const byFacetKey = {}
    for (let i = 0; i < lookups.length; i++) {
        const facetKey = lookups[i].facetKey
        if (facetKey) {
            (byFacetKey[facetKey] || (byFacetKey[facetKey] = [])).push(i)
        } else {
            globalLookupIndices.push(i)
        }
    }
    for (let j = 0; j < loopFacet.length; j++) {
        const facet = loopFacet[j]
        // facet name = the facet's key as set by getFacetAsArray (facet.key)
        const scoped = byFacetKey[facet.key]
        if (!globalLookupIndices.length && !scoped) continue
        const lookupIndices = globalLookupIndices.concat(scoped || [])
        // enrich every values dict of this facet (values + beforeFilter.values)
        let valuesDicts = facet.values ? [facet.values] : []
        if (facet.beforeFilter && facet.beforeFilter.values) {
            valuesDicts = valuesDicts.concat([facet.beforeFilter.values])
        }
        for (let d = 0; d < valuesDicts.length; d++) {
            const valuesDict = valuesDicts[d]
            // entries may be deleted from valuesDict and fields written into the
            // facet values below (nothing in here reads the uniqueness index)
            touch(valuesDict)
            for (const valueKey in valuesDict) {
                const facetValue = valuesDict[valueKey]
                touch(facetValue)
                for (let n = 0; n < lookupIndices.length; n++) {
                    const i = lookupIndices[n]
                    const table = tables[i]
                    if (!table) continue
                    const entry = table[facetValue.value]
                    if (!entry) continue
                    // optional filter: keep-condition on the table entry,
                    // same semantics as lookup.filter (expr against { key, value: entry })
                    const activeFilters = activeFiltersPerLookup[i]
                    if (activeFilters && activeFilters.length) {
                        // NOTE: matchExpr semantics are INVERTED here - a filter expr is a
                        // REMOVE-condition (same as lookup.filter, where a match skips the entry).
                        // So a truthy checkFilter means: drop this facet value from the list.
                        if (checkFilter(activeFilters, entry, facetValue.value)) {
                            delete valuesDict[valueKey]
                            break // No further lookups for this deleted facetValue
                        }
                    }
                    const map = lookups[i].map
                    if (map) {
                        // map: sourceField (table entry) -> facetValue field
                        for (const sourceField in map) {
                            const entryValue = entry[sourceField]
                            if (entryValue !== undefined) {
                                facetValue[map[sourceField]] = entryValue
                            }
                        }
                    } else {
                        // no map: merge all fields of the table entry except count/value
                        for (const field in entry) {
                            if (field !== 'count' && field !== 'value' && entry[field] !== undefined) {
                                facetValue[field] = entry[field]
                            }
                        }
                    }
                }
            }
        }
    }
}

function doSorting(re, currentData, debugInfo) {
    const value = propertyByPath(re.path, currentData, '.', re.assign)
    if (re.assign) {
        touchPath(re.path, currentData)
    }
    if (!value || !Array.isArray(value)) {
        if (debugInfo !== null) {
            debugInfo.messages.push(`no array at path ${q(re.path)}`)
        }
        return
    }
    if (debugInfo !== null) {
        debugStats(debugInfo).items = value.length
    }
    // sorting reorders the array in place
    touch(value)

    const sort = re.sort[0]
    const sortKey = sort.key
    if (sort.localCompare) {
        if (sort.path) {
            // Decorate-sort-undecorate: resolve the (potentially deep) path exactly once
            // per item instead of twice per comparison. This turns O(n log n) path
            // resolutions into O(n). Array#sort is stable, so the relative order of
            // equal keys is preserved exactly as before.
            const len = value.length
            const decorated = new Array(len)
            for (let i = 0; i < len; i++) {
                decorated[i] = [propertyByPath(sort.path, value[i]), value[i]]
            }
            if (sort.desc) {
                decorated.sort((a, b) => localeCollator.compare(b[0] || '', a[0]))
            } else {
                decorated.sort((a, b) => localeCollator.compare(a[0] || '', b[0]))
            }
            for (let i = 0; i < len; i++) {
                value[i] = decorated[i][1]
            }
        } else {
            // Same operand handling as the original localeCompare version
            // (undefined on the right side is coerced to string, just like before)
            if (sort.desc) {
                value.sort((a, b) => localeCollator.compare(b[sortKey] || '', a[sortKey]))
            } else {
                value.sort((a, b) => localeCollator.compare(a[sortKey] || '', b[sortKey]))
            }
        }
    } else {
        if (sort.desc) {
            value.sort((a, b) => {
                const sa = a[sortKey]
                const sb = b[sortKey]
                if (sa > sb) return -1
                if (sa < sb) return 1
                return 0
            })
        } else {
            value.sort((a, b) => {
                const sa = a[sortKey]
                const sb = b[sortKey]
                if (sa < sb) return -1
                if (sa > sb) return 1
                return 0
            })
        }
    }
}

function doLoopThroughData(re, currentData, rootData, debugLog, depth, debugInfo) {
    let value = propertyByPath(re.path, currentData, '.', re.assign),
        loopFacet
    if (re.assign) {
        touchPath(re.path, currentData)
    }

    const debugEnabled = debugInfo !== null

    // facetKey is derived from the (static) filter config, so it is computed once per
    // config object instead of rebuilding a spread copy of every filter on each call
    const activeFilters = re.loop.filter && re.loop.filter.filter(f => {
        if (!isNotFalse(f.is)) {
            return false
        }
        if (f.expr && f.facetKey === undefined) {
            defineHidden(f, 'facetKey', f.expr.split(/[ =!<>]/)[0].substring(6))
        }
        return true
    })

    let cacheKey
    if (re.loop.cache && isNotFalse(re.loop.cache.$is) && !re.loop.reduce &&
        (re.loop.cache.includeFilter || !activeFilters || activeFilters.length === 0)) {
        // JSON.stringify(re.loop) is stable for a given config -> serialize once
        const loopJson = re._loopJson !== undefined
            ? re._loopJson
            : defineHidden(re, '_loopJson', JSON.stringify(re.loop))
        // Keep the complete key string on the config: avoids re-concatenating the
        // (potentially large) JSON on every call and lets V8 reuse the string hash
        // for the Map lookup. Rebuilt if path or keyPrefix differ.
        const keyPrefix = re.loop.cache.keyPrefix || ''
        if (re._cacheKey === undefined || re._cacheKeyPath !== re.path || re._cacheKeyPrefix !== keyPrefix) {
            defineHidden(re, '_cacheKeyPath', re.path)
            defineHidden(re, '_cacheKeyPrefix', keyPrefix)
            defineHidden(re, '_cacheKey', `resolveReduce${keyPrefix}-${re.path}-${loopJson}`)
        }
        cacheKey = re._cacheKey
        const fromCache = Cache.get(cacheKey)
        if (fromCache) {
            if (debugEnabled) {
                debugInfo.messages.push('loaded from cache')
                debugStats(debugInfo).cache = 'hit'
            }
            const paths = Object.keys(fromCache)
            const pathsLen = paths.length
            for (let i = 0; i < pathsLen; i++) {
                const path = paths[i]
                setPropertyByPath(fromCache[path], path, rootData)
                touchPath(path, rootData)
            }
            return
        }
    } else if (debugEnabled && re.loop.cache && isNotFalse(re.loop.cache.$is)) {
        debugInfo.messages.push(re.loop.reduce
            ? 'cache not used: loop.reduce is set'
            : 'cache not used: filters are active (cache.includeFilter caches anyway)')
    }

    if (re.loop.facets && isNotFalse(re.loop.facets.$is)) {
        loopFacet = getFacetAsArray(re.loop.facets.path, rootData)
    }
    const facetSlots = loopFacet ? createFacetSlots(loopFacet) : null

    // Hoist frequently accessed config into locals. Avoids repeated nested property
    // lookups (re.loop.xyz) inside the per-item hot loop.
    const reAssign = re.assign
    // Grouping: collect at most one item per value of group.key. Deliberately
    // confined to toArray - filters, total, facets and loop.reduce see exactly
    // what they saw before, so switching grouping on never moves a count.
    // Same division of labour as lookup.group, which also leaves the facets
    // alone and only thins out the collected result.
    // null prototype because the keys come from the data - '__proto__' must not
    // resolve to an inherited member.
    const loopGroup = re.loop.group
    const groupKey  = loopGroup && loopGroup.key
    const groupSeen = loopGroup && loopGroup.keepOnlyOne ? Object.create(null) : null
    let groupCount  = 0
    const loopReduce = re.loop.reduce
    const loopAssign = re.loop.assign
    const loopToArray = re.loop.toArray
    const hasActiveFilters = !!(activeFilters && activeFilters.length > 0)
    // loop.limit: stop the loop once this many items have passed the filters
    const loopLimit = re.loop.limit

    // Result containers are only ever touched when toArray is configured, so they
    // are not allocated otherwise (matters for nested loops that run per item)
    let newArray = loopToArray ? [] : null
    const newSet = loopToArray ? new Set() : null

    // Deferred removal for arrays: value.splice(i, 1) inside the loop is O(n) per
    // removal and degrades to O(n²) overall when many items are filtered out.
    // Instead, removed indices are flagged and the array is compacted in a single
    // in-place pass after the loop. The relative order of the remaining items is
    // identical to the splice-based version, and the array reference is preserved.
    let removedFlags = null
    let hasRemovals = false

    // Per-call cache for or-filter facet subsets, so loopFacet.filter() does not run
    // again for every single filtered item with the same facetKey. Safe because the
    // loopFacet array itself is not modified during the loop. Only needed with facets.
    const orFacetCache = loopFacet ? Object.create(null) : null

    let total = 0
    // only for the debug output (plain counters, negligible in the loop)
    let filteredCount = 0
    let stoppedByLimit = false

    // Determine what to iterate over. Same checks, same order and same debug
    // messages as before; the per-item work below then runs in one plain loop
    // instead of a closure call per item (no closure allocation, and the mutable
    // counters stay in registers instead of a heap-allocated context).
    let keys = null
    let itemCount = 0
    if (!value) {
        if (debugEnabled) {
            debugInfo.messages.push(`no value at path ${q(re.path)}`)
        }
    } else {
        // Strict constructor check kept on purpose (must match original behavior exactly)
        if (value.constructor === Object) {
            keys = Object.keys(value)
            if (debugEnabled) {
                debugStats(debugInfo).source = 'object'
            }
            itemCount = keys.length
        } else if (Array.isArray(value)) {
            if (debugEnabled) {
                debugStats(debugInfo).source = 'array'
            }
            if (reAssign && hasActiveFilters) {
                // Uint8Array is cheap to allocate and zero-initialized
                removedFlags = new Uint8Array(value.length)
            }
            itemCount = value.length
        } else if (debugEnabled) {
            debugInfo.messages.push(`value at path ${q(re.path)} is neither an object nor an array`)
        }
    }
    const isObject = keys !== null

    for (let n = 0; n < itemCount; n++) {
        // objects: keys in forward order; arrays: reverse iteration kept so that
        // the toArray push order stays identical
        const key = isObject ? keys[n] : itemCount - 1 - n
        let item = value[key]
        if (loopFacet) {
            createFacets(facetSlots, item, true)
        }
        // value[key] is re-read here (and not taken from item) on purpose: this is the
        // exact point where checkFilter used to read it. No call at all without filters.
        const filter = hasActiveFilters && checkFilter(activeFilters, value[key], key)
        if (filter) {
            filteredCount++
            if (filter.or && loopFacet) {
                let filteredFacets
                if (filter.facetKey) {
                    filteredFacets = orFacetCache[filter.facetKey] ||
                        (orFacetCache[filter.facetKey] = facetSlots.filter(slot => slot.key === filter.facetKey))
                } else {
                    filteredFacets = facetSlots
                }
                createFacets(filteredFacets, item, false)
            }

            if (reAssign) {
                if (isObject) {
                    delete value[key]
                    touch(value)
                } else {
                    // mark instead of splice - compacted once after the loop
                    removedFlags[key] = 1
                    hasRemovals = true
                }
            }
        } else {
            total++
            if (loopReduce) {
                if (loopAssign) {
                    item = value[key] = assignIfObjectOrArray(item)
                    // must happen right here: the nested pipeline below may check
                    // for duplicates in this very array
                    touch(value)
                }
                runPipe(loopReduce, rootData, item, debugLog, depth + 1)
                // re-read in case the nested pipeline replaced the entry
                item = value[key]
            }

            if (loopFacet) {
                createFacets(facetSlots, item)
            }

            // Read AFTER loop.reduce, like the toArray value itself: a nested
            // pipeline may have replaced the entry.
            let isNewGroup = true
            if (groupSeen) {
                const groupValue = item ? item[groupKey] : undefined
                if (groupSeen[groupValue]) {
                    isNewGroup = false
                } else {
                    groupSeen[groupValue] = true
                    groupCount++
                }
            }

            if (loopToArray && isNewGroup) {
                const v = loopToArray.key ? item[loopToArray.key] : item
                if (loopToArray.duplicates) {
                    newArray.push(v)

                    if (loopLimit !== undefined && newArray.length >= loopLimit) {
                        stoppedByLimit = true
                        break
                    }
                } else {
                    newSet.add(v)

                    if (loopLimit !== undefined && newSet.size >= loopLimit) {
                        stoppedByLimit = true
                        break
                    }
                }
            }
        }
    }

    if (hasRemovals) {
        // Single in-place compaction pass (O(n)) - keeps the order of the
        // remaining items and the original array reference intact
        let writeIndex = 0
        const len = value.length
        for (let i = 0; i < len; i++) {
            if (!removedFlags[i]) {
                if (writeIndex !== i) {
                    value[writeIndex] = value[i]
                }
                writeIndex++
            }
        }
        value.length = writeIndex
        touch(value)
    }

    // cacheData is only consumed by Cache.set below, so it is only built when caching
    const cacheData = cacheKey ? {} : null
    if (loopFacet) {
        applyFacetLookups(re.loop.facets, loopFacet, rootData)
        setFacetToObject(re.loop.facets.path, rootData, loopFacet)
        if (cacheKey) {
            cacheData[re.loop.facets.path] = propertyByPath(re.loop.facets.path, rootData)
        }
    }

    if (re.loop.total) {
        setPropertyByPath(total, re.loop.total.path, rootData)
        touchPath(re.loop.total.path, rootData)
        if (cacheKey) {
            cacheData[re.loop.total.path] = total
        }
    }

    // Number of distinct groups among the items that passed the filters - the
    // counterpart to lookup.sum. Goes through the same cache as total.
    if (loopGroup && loopGroup.total) {
        setPropertyByPath(groupCount, loopGroup.total.path, rootData)
        touchPath(loopGroup.total.path, rootData)
        if (cacheKey) {
            cacheData[loopGroup.total.path] = groupCount
        }
    }

    if (loopToArray) {
        if (newSet.size > 0) {
            newArray = [...newSet]
        }
        setPropertyByPath(newArray, loopToArray.pathTo, rootData)
        touchPath(loopToArray.pathTo, rootData)
        if (cacheKey) {
            cacheData[loopToArray.pathTo] = newArray
        }
    }

    if (debugEnabled) {
        const stats = debugStats(debugInfo)
        stats.items = itemCount
        stats.passed = total
        stats.filtered = filteredCount
        if (stoppedByLimit) {
            stats.stoppedByLimit = true
            stats.processed = total + filteredCount
        }
        if (activeFilters) stats.activeFilters = activeFilters.length
        if (loopFacet) stats.facets = loopFacet.length
        if (groupSeen) stats.groups = groupCount
        if (loopToArray) stats.toArray = newArray.length
        if (cacheKey) stats.cache = 'stored'
    }

    if (cacheKey) {
        Cache.set(cacheKey, cacheData, re.loop.cache.expires || 0)
    }
}

// lookup of an array of keys (re.lookup with an array value). Kept in its own function
// so the hot per-key loop is optimized independently of the big step dispatcher in
// runPipe (smaller, stable compilation unit; no deopts caused by unrelated steps).
function lookupArray(re, rootData, lookupData, value, debugInfo) {
    const lookedupData = []
    // null prototype: used as a plain dictionary keyed by data values
    const groups = Object.create(null)
    let count = 0
    let loopFacet

    if (re.lookup.facets && isNotFalse(re.lookup.facets.$is)) {
        loopFacet = getFacetAsArray(re.lookup.facets.path, rootData)
    }
    const facetSlots = loopFacet ? createFacetSlots(loopFacet) : null

    const activeFilters = re.lookup.filter && re.lookup.filter.filter(f => isNotFalse(f.is))
    const activeFiltersBefore = re.lookup.filterBefore && re.lookup.filterBefore.filter(f => isNotFalse(f.is))
    // same condition checkFilter uses internally - lets the loop skip the call entirely
    const hasActiveFilters = !!(activeFilters && activeFilters.length > 0)
    const hasActiveFiltersBefore = !!(activeFiltersBefore && activeFiltersBefore.length > 0)

    // Hoist constant config out of the per-item loop
    const lookupGroup = re.lookup.group
    const groupKey = lookupGroup && lookupGroup.key
    const keepOnlyOne = lookupGroup && lookupGroup.keepOnlyOne
    const lookupLimit = re.lookup.limit
    // The group lookup target is constant for the whole loop -
    // resolving the path once instead of per matched item
    const groupLookupData = lookupGroup && lookupGroup.lookup
        ? propertyByPath(lookupGroup.lookup, rootData)
        : null

    // only for the debug output (plain counters, negligible in the loop)
    let notFound = 0, filteredBefore = 0, groupDuplicates = 0, limitSkipped = 0, filteredAfter = 0

    const valLen = value.length
    for (let k = 0; k < valLen; k++) {
        const key = value[k]
        let entry = lookupData[key]
        if (entry === undefined) {
            notFound++
        }

        if (loopFacet) {
            createFacets(facetSlots, entry, true)
        }

        // lookupData[key] is read at the exact point where checkFilter used to read it
        const filter = hasActiveFiltersBefore && checkFilter(activeFiltersBefore, lookupData[key], key)
        if (filter) {
            if (loopFacet && filter.or) {
                createFacets(facetSlots, entry, false)
            }
            filteredBefore++
            continue
        }

        if (loopFacet) {
            createFacets(facetSlots, entry, false)
        }

        if (keepOnlyOne) {
            if (groups[entry[groupKey]]) {
                groupDuplicates++
                continue
            }
        }

        if (lookupLimit && lookupLimit <= count) {
            limitSkipped++
            continue
        }
        if (hasActiveFilters && checkFilter(activeFilters, lookupData[key], key)) {
            filteredAfter++
            continue
        }
        count++
        if (lookupGroup) {
            groups[entry[groupKey]] = entry
            if (lookupGroup.lookup) {
                // RHS is evaluated with the old entry before reassignment,
                // exactly like the original spread version
                entry = lookupData[key] = {
                    ...entry,
                    [groupKey]: groupLookupData[entry[groupKey]]
                }
                touch(lookupData)
            }
        }
        lookedupData.push(entry)
    }

    if (loopFacet) {
        applyFacetLookups(re.lookup.facets, loopFacet, rootData)
        setFacetToObject(re.lookup.facets.path, rootData, loopFacet)
    }
    if (debugInfo !== null) {
        const stats = debugStats(debugInfo)
        stats.keys = valLen
        stats.found = valLen - notFound
        stats.notFound = notFound
        stats.filteredBefore = filteredBefore
        stats.filtered = filteredAfter
        if (keepOnlyOne) stats.groupDuplicates = groupDuplicates
        if (lookupLimit) stats.limitSkipped = limitSkipped
        if (loopFacet) stats.facets = loopFacet.length
        stats.result = lookedupData.length
    }
    return lookedupData
}

// debug: collect debugLog entries (default true for callers that don't pass it;
// dataResolver passes debug: !!segment.debug)
export const resolveReduce = (reducePipe, rootData, currentData, { debugLog, depth = 0, debug = true }) => {
    // per-call state: uniqueness index and debug measuring (see above)
    const outerIndex = uniqueIndex
    const outerNested = nestedStats
    const outerStart = debugStart
    uniqueIndex = null
    nestedStats = null
    const withDebug = !!debug
    if (withDebug && depth < 1) {
        debugStart = performance.now()
    }
    try {
        runPipe(reducePipe, rootData, currentData, debugLog, depth, withDebug)
    } finally {
        uniqueIndex = outerIndex
        nestedStats = outerNested
        debugStart = outerStart
    }
}

// Internal runner with positional arguments. Nested calls (loop.reduce runs once
// per item, reduce steps) go through here directly, which saves the options
// object allocation + destructuring for every nested call.
function runPipe(reducePipe, rootData, currentData, debugLog, depth, debug) {
    const pipeLength = reducePipe.length
    // debug entries are only created on the top level; nested steps are aggregated
    // into nestedStats, and nothing exists for the log at all without debug
    const debugEnabled = debug && depth < 1
    for (let pipeIndex = 0; pipeIndex < pipeLength; pipeIndex++) {
        const re = reducePipe[pipeIndex]
        if (isNotFalse(re.$is)) {
            let debugInfo = null
            // nested step while a top-level step runs with debug: measure and aggregate
            const measureNested = depth > 0 && nestedStats !== null
            let t0 = 0
            if (debugEnabled) {
                t0 = performance.now()
                debugInfo = describeStep(re, pipeIndex)
                debugInfo.start = r3(t0 - debugStart)
                debugInfo.time = 0
                debugInfo.messages = []
                nestedStats = new Map()
            } else if (measureNested) {
                t0 = performance.now()
            }

            try {
                if (re.sort) {
                    doSorting(re, currentData, debugInfo)
                } else if (re.lookup) {
                    const lookupData = propertyByPath(re.lookup.path, rootData, '.', !!re.lookup.assign)
                    if (re.lookup.assign) {
                        touchPath(re.lookup.path, rootData)
                    }
                    const value = propertyByPath(re.path, currentData)
                    let lookedupData

                    if (value !== undefined && value !== null) {
                        // Strict check kept on purpose to treat wrapper objects exactly the same
                        if (value.constructor === Number || value.constructor === String) {
                            lookedupData = lookupData[value]
                            // NOTE: original code checked `lookupData === undefined` here, which
                            // could never be true at this point (lookupData[value] above would
                            // have thrown already). Checking the looked-up entry instead.
                            if (lookedupData === undefined) {
                                // only key and table path: logging the table itself printed the
                                // whole (possibly huge) object on every miss
                                console.warn(`resolveReduce: ${value} not found in lookup ${q(re.lookup.path)}`)
                            }
                            if (debugInfo !== null) {
                                debugStats(debugInfo).found = lookedupData !== undefined
                                if (lookedupData === undefined) {
                                    debugInfo.messages.push(`${q(value)} not found in lookup ${q(re.lookup.path)}`)
                                }
                            }
                        } else if (Array.isArray(value)) {
                            lookedupData = lookupArray(re, rootData, lookupData, value, debugInfo)
                        } else if (debugInfo !== null) {
                            debugInfo.messages.push(`value at path ${q(re.path)} is neither a key nor an array of keys`)
                        }
                    } else if (debugInfo !== null) {
                        debugInfo.messages.push(`no value at path ${q(re.path)}`)
                    }

                    if (re.lookup.sum) {
                        let sum = propertyByPath(re.lookup.sum.path, rootData)
                        if (!sum) {
                            sum = 0
                        }
                        sum += lookedupData.length
                        setPropertyByPath(sum, re.lookup.sum.path, rootData)
                        touchPath(re.lookup.sum.path, rootData)
                        if (debugInfo !== null) {
                            debugStats(debugInfo).sum = sum
                        }
                    }

                    if (re.extend || re.override) {
                        // Strict constructor === Object check kept on purpose
                        if (lookedupData && lookedupData.constructor === Object) {
                            // fields of currentData are written below
                            touch(currentData)
                            const fieldOptions = (re.extend && re.extend.fieldOptions) || {}
                            const keys = Object.keys(lookedupData)
                            const keysLen = keys.length
                            for (let i = 0; i < keysLen; i++) {
                                const key = keys[i]
                                if (re.override) {
                                    currentData[key] = lookedupData[key]
                                } else if (re.extend === true || re.extend.full === true || (typeof re.extend === 'object' && re.extend.fields && re.extend.fields.indexOf(key) >= 0)) {
                                    if (currentData[key]) {
                                        if (Array.isArray(currentData[key])) {
                                            if (!fieldOptions[key] || fieldOptions[key].mergeArray !== false) {
                                                currentData[key] = [...currentData[key], ...lookedupData[key]]
                                            }
                                        } else {
                                            currentData[key] = lookedupData[key]
                                        }
                                    } else {
                                        currentData[key] = lookedupData[key]
                                    }
                                }
                            }
                        }
                    } else if (re.key) {
                        if (re.onCurrent) {
                            currentData[re.key] = lookedupData
                            touch(currentData)
                        } else {
                            rootData[re.key] = lookedupData
                            touch(rootData)
                        }
                    } else {
                        setPropertyByPath(lookedupData, re.path, currentData)
                        touchPath(re.path, currentData)
                    }

                } else if (re.random) {
                    const value = propertyByPath(re.path, currentData, '.', false)
                    const picks = []
                    const vLen = value.length
                    for (let i = 0; i < re.random; i++) {
                        picks.push(value[Math.floor(Math.random() * vLen)])
                    }
                    rootData[re.key] = picks
                    touch(rootData)
                    if (debugInfo !== null) {
                        debugStats(debugInfo).picks = picks.length
                    }
                } else if (re.set) {
                    setPropertyByPath(re.set, re.key, currentData)
                    touchPath(re.key, currentData)
                } else if (re.key) {
                    const value = propertyByPath(re.path, currentData, '.', re.assign)
                    if (re.assign) {
                        touchPath(re.path, currentData)
                    }

                    // Strict constructor === Object check kept on purpose
                    if (re.assign && value && value.constructor === Object) {
                        const keys = Object.keys(value)
                        const keysLen = keys.length
                        for (let i = 0; i < keysLen; i++) {
                            const key = keys[i]
                            // Strict constructor === Object check kept on purpose
                            if (value[key] && value[key].constructor === Object) {
                                value[key] = Object.assign({}, value[key])
                            }
                        }
                        touch(value)
                    }
                    if (re.get) {
                        if (re.separator) {
                            const aGet = re.get.split(re.separator)
                            const aValue = rootData[re.key] || []
                            const aGetLen = aGet.length
                            let added = 0
                            for (let i = 0; i < aGetLen; i++) {
                                const sget = aGet[i]
                                let getKey = propertyByPath(sget, currentData)
                                if (getKey === null || getKey === undefined) {
                                    getKey = sget
                                }
                                if (!re.ignoreNull || value[getKey] != null) {
                                    aValue.push(value[getKey])
                                    added++
                                }
                            }
                            rootData[re.key] = aValue
                            touch(rootData)
                            if (debugInfo !== null) {
                                const stats = debugStats(debugInfo)
                                stats.added = added
                                stats.size = aValue.length
                            }
                        } else {
                            let getKey = propertyByPath(re.get, currentData)
                            if (getKey === null || getKey === undefined) {
                                getKey = re.get
                            }
                            if (Array.isArray(getKey)) {
                                const aValue = []
                                const getKeyLen = getKey.length
                                for (let i = 0; i < getKeyLen; i++) {
                                    aValue.push(value[getKey[i]])
                                }
                                rootData[re.key] = aValue
                                touch(rootData)
                            } else {
                                if (re.toArray) {
                                    if (!rootData[re.key]) {
                                        rootData[re.key] = []
                                        touch(rootData)
                                    }
                                    const add = re.duplicates || (canUseIndex(rootData[re.key])
                                        ? !indexHas(rootData[re.key], value[getKey]) // Set-based check, see uniqueIndex
                                        : rootData[re.key].indexOf(value[getKey]) < 0)
                                    if (add) {
                                        rootData[re.key].push(value[getKey])
                                    }
                                    if (debugInfo !== null) {
                                        const stats = debugStats(debugInfo)
                                        stats.added = add ? 1 : 0
                                        if (!add) stats.duplicate = true
                                        if (Array.isArray(rootData[re.key])) stats.size = rootData[re.key].length
                                    }
                                } else {
                                    rootData[re.key] = value[getKey]
                                    touch(rootData)
                                }
                            }
                        }
                    } else {
                        if (re.toArray) {
                            if (!rootData[re.key]) {
                                rootData[re.key] = []
                                touch(rootData)
                            }
                            if (!value) {
                                // noop
                                if (debugInfo !== null) {
                                    debugInfo.messages.push(`no value at path ${q(re.path)}`)
                                }
                            } else if (value.constructor === Object && re.toArray === 'fromObject') {
                                // loop instead of push(...spread): no RangeError on very large inputs
                                const target = rootData[re.key]
                                const values = Object.values(value)
                                for (let i = 0, l = values.length; i < l; i++) {
                                    target.push(values[i])
                                }
                                if (debugInfo !== null) {
                                    debugStats(debugInfo).added = values.length
                                }
                            } else if (Array.isArray(value)) {
                                const target = rootData[re.key]
                                for (let i = 0, l = value.length; i < l; i++) {
                                    target.push(value[i])
                                }
                                if (debugInfo !== null) {
                                    debugStats(debugInfo).added = value.length
                                }
                            } else {
                                const add = re.duplicates || (canUseIndex(rootData[re.key])
                                    ? !indexHas(rootData[re.key], value) // Set-based check, see uniqueIndex
                                    : rootData[re.key].indexOf(value) < 0)
                                if (add) {
                                    rootData[re.key].push(value)
                                }
                                if (debugInfo !== null) {
                                    const stats = debugStats(debugInfo)
                                    stats.added = add ? 1 : 0
                                    if (!add) stats.duplicate = true
                                }
                            }
                            if (debugInfo !== null && Array.isArray(rootData[re.key])) {
                                debugStats(debugInfo).size = rootData[re.key].length
                            }
                        } else {
                            rootData[re.key] = value
                            touch(rootData)
                            if (debugInfo !== null && value === undefined) {
                                debugInfo.messages.push(`no value at path ${q(re.path)}`)
                            }
                        }
                    }
                } else if (re.loop) {
                    doLoopThroughData(re, currentData, rootData, debugLog, depth, debugInfo)
                } else if (re.reduce) {
                    const arr = propertyByPath(re.path, currentData)
                    if (debugInfo !== null && (arr === undefined || arr === null)) {
                        debugInfo.messages.push(`no value at path ${q(re.path)}`)
                    }
                    runPipe(re.reduce, rootData, arr, debugLog, depth + 1)
                } else if (re.limit) {
                    const value = propertyByPath(re.path, currentData, '.', re.assign)
                    if (re.assign) {
                        touchPath(re.path, currentData)
                    }
                    // (only read when value is set, so a missing value fails exactly as before)
                    const lengthBefore = debugInfo !== null && value ? value.length : undefined
                    const offset = (re.offset || 0)

                    if (offset > 0) {
                        value.splice(0, offset)
                    }
                    if (value.length > re.limit) {
                        value.length = re.limit
                    }
                    touch(value)
                    if (debugInfo !== null) {
                        const stats = debugStats(debugInfo)
                        stats.before = lengthBefore
                        stats.after = value.length
                    }
                }
                if (re.remove) {
                    const parentPath = re.path.substring(0, re.path.lastIndexOf('.'))
                    const ob = propertyByPath(parentPath, currentData)
                    delete ob[re.path.substring(re.path.lastIndexOf('.') + 1)]
                    touch(ob)
                    if (debugInfo !== null) {
                        debugInfo.messages.push(`removed ${q(re.path.substring(re.path.lastIndexOf('.') + 1))} from ${q(parentPath)}`)
                    }
                }

            } catch (e) {
                // record where it failed, then rethrow the very same error
                if (debugInfo !== null) {
                    debugInfo.error = errorMessage(e)
                    finishDebugInfo(debugInfo, t0)
                    if (debugLog) {
                        debugLog.push(debugInfo)
                    }
                } else if (measureNested) {
                    recordNested(re, pipeIndex, depth, t0, e, true)
                }
                throw e
            }

            if (debugInfo !== null) {
                finishDebugInfo(debugInfo, t0)
                debugLog.push(debugInfo)
            } else if (measureNested) {
                recordNested(re, pipeIndex, depth, t0, undefined, false)
            }
        } else if (debugEnabled && debugLog) {
            const skipped = describeStep(re, pipeIndex)
            skipped.skipped = true
            debugLog.push(skipped)
        }
    }
}

// item is the entry that is checked (value[key] of the collection it belongs to) and
// key its key. Callers read value[key] once right at the call instead of checkFilter
// re-reading it for every single filter (dictionary lookups on large keyed objects
// like pim tables are not free). Nothing in the filter loop modifies the collection,
// so every filter still sees the same value.
const checkFilter = (filters, item, key) => {
    if (filters && filters.length > 0) {
        const filtersLen = filters.length
        for (let i = 0; i < filtersLen; i++) {
            const filter = filters[i]

            if (filter.search) {
                // Invisible caching via defineProperty so JSON serialization stays untouched
                if (!filter.search._cachedRegExp) {
                    defineHidden(filter.search, '_cachedRegExp', new RegExp(filter.search.expr, 'i'))
                }
                if (!filter.search._cachedFields) {
                    // Precompute the field keys and whether they are deep paths.
                    // Avoids Object.keys() + indexOf('.') for every single checked item.
                    const fieldKeys = Object.keys(filter.search.fields)
                    const fieldKeysLen = fieldKeys.length
                    const cachedFields = new Array(fieldKeysLen)
                    for (let y = 0; y < fieldKeysLen; y++) {
                        cachedFields[y] = { fieldKey: fieldKeys[y], isPath: fieldKeys[y].indexOf('.') >= 0 }
                    }
                    defineHidden(filter.search, '_cachedFields', cachedFields)
                }
                const re = filter.search._cachedRegExp
                const fields = filter.search._cachedFields
                const fieldsLen = fields.length

                let hasMatch = false
                for (let y = 0; y < fieldsLen; y++) {
                    const field = fields[y]
                    let valueToCheck
                    if (field.isPath) {
                        valueToCheck = propertyByPath(field.fieldKey, item)
                    } else {
                        valueToCheck = item[field.fieldKey]
                    }
                    if (valueToCheck && re.test(valueToCheck)) {
                        hasMatch = true
                        break
                    }
                }
                if (hasMatch) {
                    continue
                }
                return filter

            } else {
                matchScope.key = key
                matchScope.value = item
                if (matchExpr(filter.expr, matchScope)) {
                    return filter
                }
            }
        }
    }
    return false
}