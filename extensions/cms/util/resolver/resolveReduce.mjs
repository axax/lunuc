import {assignIfObjectOrArray, matchExpr, propertyByPath, setPropertyByPath} from '../../../../client/util/json.mjs'
import Cache from '../../../../util/cache.mjs'

// Single shared collator instance. Intl.Collator.prototype.compare is significantly
// faster than calling String.prototype.localeCompare for every single comparison
// during a sort, while producing the same ordering for the default locale.
const localeCollator = new Intl.Collator()

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
    if (!currentFacet.values[facetValue]) {
        currentFacet.values[facetValue] = {
            value: facetValue,
            count: 1
        }
    } else {
        currentFacet.values[facetValue].count++
    }
}

const createFacets = (facets, data, beforeFilter) => {
    if (facets && data) {
        const facetsLength = facets.length
        for (let i = 0; i < facetsLength; i++) {
            const facet = facets[i]
            const currentFacet = beforeFilter ? (facet.beforeFilter = facet.beforeFilter || {}) : facet
            const facetValue = data[facet.key]
            if (facet.type === 'slider') {
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
                    currentFacet.values = {}
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
}

function doSorting(re, currentData) {
    const value = propertyByPath(re.path, currentData, '.', re.assign)
    if (!value || !Array.isArray(value)) return

    const sort = re.sort[0]
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
                value.sort((a, b) => localeCollator.compare(b[sort.key] || '', a[sort.key]))
            } else {
                value.sort((a, b) => localeCollator.compare(a[sort.key] || '', b[sort.key]))
            }
        }
    } else {
        if (sort.desc) {
            value.sort((a, b) => {
                const sa = a[sort.key]
                const sb = b[sort.key]
                if (sa > sb) return -1
                if (sa < sb) return 1
                return 0
            })
        } else {
            value.sort((a, b) => {
                const sa = a[sort.key]
                const sb = b[sort.key]
                if (sa < sb) return -1
                if (sa > sb) return 1
                return 0
            })
        }
    }
}

function doLoopThroughData(re, currentData, rootData, debugLog, depth, debugInfo) {
    let value = propertyByPath(re.path, currentData, '.', re.assign),
        loopFacet,
        newArray = [],
        newSet = new Set()

    const activeFilters = re.loop.filter && re.loop.filter.filter(f => isNotFalse(f.is)).map(f => {
        return f.expr ? { ...f, facetKey: f.expr.split(/[ =!<>]/)[0].substring(6) } : f
    })

    let cacheKey
    if (re.loop.cache && isNotFalse(re.loop.cache.$is) && !re.loop.reduce &&
        (re.loop.cache.includeFilter || !activeFilters || activeFilters.length === 0)) {
        cacheKey = `resolveReduce${re.loop.cache.keyPrefix || ''}-${re.path}-${JSON.stringify(re.loop)}`
        const fromCache = Cache.get(cacheKey)
        if (fromCache) {
            const paths = Object.keys(fromCache)
            const pathsLen = paths.length
            for (let i = 0; i < pathsLen; i++) {
                const path = paths[i]
                setPropertyByPath(fromCache[path], path, rootData)
            }
            return
        }
    }

    if (re.loop.facets && isNotFalse(re.loop.facets.$is)) {
        loopFacet = getFacetAsArray(re.loop.facets.path, rootData)
    }

    // Hoist frequently accessed config into locals. Avoids repeated nested property
    // lookups (re.loop.xyz) inside the per-item hot loop.
    const reAssign = re.assign
    const loopReduce = re.loop.reduce
    const loopAssign = re.loop.assign
    const loopToArray = re.loop.toArray
    const hasActiveFilters = !!(activeFilters && activeFilters.length > 0)

    // Deferred removal for arrays: value.splice(i, 1) inside the loop is O(n) per
    // removal and degrades to O(n²) overall when many items are filtered out.
    // Instead, removed indices are flagged and the array is compacted in a single
    // in-place pass after the loop. The relative order of the remaining items is
    // identical to the splice-based version, and the array reference is preserved.
    let removedFlags = null
    let hasRemovals = false

    // Lazy per-call cache for or-filter facet subsets, so loopFacet.filter()
    // does not run again for every single filtered item with the same facetKey.
    // Safe because the loopFacet array itself is not modified during the loop.
    let orFacetCache = null

    let total = 0
    const inLoop = (key, isObject) => {
        if (loopFacet) {
            createFacets(loopFacet, value[key], true)
        }
        const filter = checkFilter(activeFilters, value, key)
        if (filter) {
            if (filter.or && loopFacet) {
                let filteredFacets
                if (filter.facetKey) {
                    if (!orFacetCache) {
                        orFacetCache = {}
                    }
                    filteredFacets = orFacetCache[filter.facetKey] ||
                        (orFacetCache[filter.facetKey] = loopFacet.filter(facet => facet.key === filter.facetKey))
                } else {
                    filteredFacets = loopFacet
                }
                createFacets(filteredFacets, value[key], false)
            }

            if (reAssign) {
                if (isObject) {
                    delete value[key]
                } else {
                    // mark instead of splice - compacted once after the loop
                    removedFlags[key] = 1
                    hasRemovals = true
                }
            }
        } else {
            total++
            if (loopReduce) {
                value[key] = loopAssign ? assignIfObjectOrArray(value[key]) : value[key]
                resolveReduce(loopReduce, rootData, value[key], { debugLog, depth: depth + 1 })
            }

            if (loopFacet) {
                createFacets(loopFacet, value[key])
            }

            if (loopToArray) {
                const v = loopToArray.key ? value[key][loopToArray.key] : value[key]
                if (loopToArray.duplicates) {
                    newArray.push(v)
                } else {
                    newSet.add(v)
                }
            }
        }
    }

    if (!value) {
        debugInfo.messages.push(`no value for ${JSON.stringify(re)}`)
    } else {
        // Strict constructor check kept on purpose (must match original behavior exactly)
        if (value.constructor === Object) {
            const keys = Object.keys(value)
            debugInfo.messages.push(`loop through object data ${keys.length}`)
            const keysLen = keys.length
            for (let i = 0; i < keysLen; i++) {
                inLoop(keys[i], true)
            }
        } else if (Array.isArray(value)) {
            debugInfo.messages.push(`loop through array data ${value.length} with filter ${JSON.stringify(activeFilters)}`)
            if (reAssign && hasActiveFilters) {
                // Uint8Array is cheap to allocate and zero-initialized
                removedFlags = new Uint8Array(value.length)
            }
            // Reverse iteration kept so that toArray push order stays identical
            for (let i = value.length - 1; i >= 0; i--) {
                inLoop(i, false)
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
            }
        }
    }

    const cacheData = {}
    if (loopFacet) {
        setFacetToObject(re.loop.facets.path, rootData, loopFacet)
        cacheData[re.loop.facets.path] = propertyByPath(re.loop.facets.path, rootData)
    }

    if (re.loop.total) {
        setPropertyByPath(total, re.loop.total.path, rootData)
        cacheData[re.loop.total.path] = total
    }

    if (loopToArray) {
        if (newSet.size > 0) {
            newArray = [...newSet]
        }
        setPropertyByPath(newArray, loopToArray.pathTo, rootData)
        cacheData[loopToArray.pathTo] = newArray
    }

    if (cacheKey) {
        Cache.set(cacheKey, cacheData, re.loop.cache.expires || 0)
    }
}

export const resolveReduce = (reducePipe, rootData, currentData, { debugLog, depth = 0 }) => {
    const pipeLength = reducePipe.length
    for (let pipeIndex = 0; pipeIndex < pipeLength; pipeIndex++) {
        const re = reducePipe[pipeIndex]
        if (isNotFalse(re.$is)) {
            const debugInfo = { index: pipeIndex, step: re, startTime: Date.now(), messages: [] }

            if (re.sort) {
                doSorting(re, currentData)
            } else if (re.lookup) {
                const lookupData = propertyByPath(re.lookup.path, rootData, '.', !!re.lookup.assign)
                const value = propertyByPath(re.path, currentData)
                let lookedupData, groups

                if (value !== undefined && value !== null) {
                    // Strict check kept on purpose to treat wrapper objects exactly the same
                    if (value.constructor === Number || value.constructor === String) {
                        lookedupData = lookupData[value]
                        // NOTE: original code checked `lookupData === undefined` here, which
                        // could never be true at this point (lookupData[value] above would
                        // have thrown already). Checking the looked-up entry instead.
                        if (lookedupData === undefined) {
                            console.warn(`${value} not found in`, lookupData)
                        }
                    } else if (Array.isArray(value)) {
                        lookedupData = []
                        groups = {}
                        let count = 0
                        let loopFacet

                        if (re.lookup.facets && isNotFalse(re.lookup.facets.$is)) {
                            loopFacet = getFacetAsArray(re.lookup.facets.path, rootData)
                        }

                        const activeFilters = re.lookup.filter && re.lookup.filter.filter(f => isNotFalse(f.is))
                        const activeFiltersBefore = re.lookup.filterBefore && re.lookup.filterBefore.filter(f => isNotFalse(f.is))

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

                        const valLen = value.length
                        for (let k = 0; k < valLen; k++) {
                            const key = value[k]
                            let entry = lookupData[key]

                            if (loopFacet) {
                                createFacets(loopFacet, entry, true)
                            }

                            const filter = checkFilter(activeFiltersBefore, lookupData, key)
                            if (filter) {
                                if (loopFacet && filter.or) {
                                    createFacets(loopFacet, entry, false)
                                }
                                continue
                            }

                            if (loopFacet) {
                                createFacets(loopFacet, entry, false)
                            }

                            if (keepOnlyOne) {
                                if (groups[entry[groupKey]]) {
                                    continue
                                }
                            }

                            if (lookupLimit && lookupLimit <= count) {
                                continue
                            }
                            if (checkFilter(activeFilters, lookupData, key)) {
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
                                }
                            }
                            lookedupData.push(entry)
                        }

                        if (loopFacet) {
                            setFacetToObject(re.lookup.facets.path, rootData, loopFacet)
                        }
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

                if (re.extend || re.override) {
                    // Strict constructor === Object check kept on purpose
                    if (lookedupData && lookedupData.constructor === Object) {
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
                    } else {
                        rootData[re.key] = lookedupData
                    }
                } else {
                    setPropertyByPath(lookedupData, re.path, currentData)
                }

            } else if (re.random) {
                const value = propertyByPath(re.path, currentData, '.', false)
                const picks = []
                const vLen = value.length
                for (let i = 0; i < re.random; i++) {
                    picks.push(value[Math.floor(Math.random() * vLen)])
                }
                rootData[re.key] = picks
            } else if (re.set) {
                setPropertyByPath(re.set, re.key, currentData)
            } else if (re.key) {
                const value = propertyByPath(re.path, currentData, '.', re.assign)

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
                }
                if (re.get) {
                    if (re.separator) {
                        const aGet = re.get.split(re.separator)
                        const aValue = rootData[re.key] || []
                        const aGetLen = aGet.length
                        for (let i = 0; i < aGetLen; i++) {
                            const sget = aGet[i]
                            let getKey = propertyByPath(sget, currentData)
                            if (getKey === null || getKey === undefined) {
                                getKey = sget
                            }
                            if (!re.ignoreNull || value[getKey] != null) {
                                aValue.push(value[getKey])
                            }
                        }
                        rootData[re.key] = aValue
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
                        } else {
                            if (re.toArray) {
                                if (!rootData[re.key]) {
                                    rootData[re.key] = []
                                }
                                if (re.duplicates || rootData[re.key].indexOf(value[getKey]) < 0) {
                                    rootData[re.key].push(value[getKey])
                                }
                            } else {
                                rootData[re.key] = value[getKey]
                            }
                        }
                    }
                } else {
                    if (re.toArray) {
                        const toArrayStart = Date.now()
                        if (!rootData[re.key]) {
                            rootData[re.key] = []
                        }
                        if (!value) {
                            // noop
                        } else if (value.constructor === Object && re.toArray === 'fromObject') {
                            rootData[re.key].push(...Object.values(value))
                        } else if (Array.isArray(value)) {
                            rootData[re.key].push(...value)
                        } else if (re.duplicates || rootData[re.key].indexOf(value) < 0) {
                            rootData[re.key].push(value)
                        }
                        debugInfo.toArrayTime = Date.now() - toArrayStart
                    } else {
                        rootData[re.key] = value
                    }
                }
            } else if (re.loop) {
                doLoopThroughData(re, currentData, rootData, debugLog, depth, debugInfo)
            } else if (re.reduce) {
                const arr = propertyByPath(re.path, currentData)
                resolveReduce(re.reduce, rootData, arr, { debugLog, depth: depth + 1 })
            } else if (re.limit) {
                const value = propertyByPath(re.path, currentData, '.', re.assign)
                const offset = (re.offset || 0)

                if (offset > 0) {
                    value.splice(0, offset)
                }
                if (value.length > re.limit) {
                    value.length = re.limit
                }
            }
            if (re.remove) {
                const parentPath = re.path.substring(0, re.path.lastIndexOf('.'))
                const ob = propertyByPath(parentPath, currentData)
                delete ob[re.path.substring(re.path.lastIndexOf('.') + 1)]
            }

            if (depth < 1) {
                debugInfo.time = Date.now() - debugInfo.startTime
                debugLog.push(debugInfo)
            }
        }
    }
}

const checkFilter = (filters, value, key) => {
    if (filters && filters.length > 0) {
        const filtersLen = filters.length
        for (let i = 0; i < filtersLen; i++) {
            const filter = filters[i]

            if (filter.search) {
                // Invisible caching via defineProperty so JSON serialization stays untouched
                if (!filter.search._cachedRegExp) {
                    Object.defineProperty(filter.search, '_cachedRegExp', {
                        value: new RegExp(filter.search.expr, 'i'),
                        enumerable: false, // hidden from Object.keys() and JSON.stringify()
                        writable: true,
                        configurable: true
                    })
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
                    Object.defineProperty(filter.search, '_cachedFields', {
                        value: cachedFields,
                        enumerable: false,
                        writable: true,
                        configurable: true
                    })
                }
                const re = filter.search._cachedRegExp
                const fields = filter.search._cachedFields
                const fieldsLen = fields.length
                const item = value[key]

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
                if (matchExpr(filter.expr, { key, value: value[key] })) {
                    return filter
                }
            }
        }
    }
    return false
}