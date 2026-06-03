import {assignIfObjectOrArray, matchExpr, propertyByPath, setPropertyByPath} from '../../../../client/util/json.mjs'
import Cache from '../../../../util/cache.mjs'

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
    if (sort.desc) {
        if (sort.localCompare) {
            if (sort.path) {
                value.sort((a, b) => (propertyByPath(sort.path, b) || '').localeCompare(propertyByPath(sort.path, a)))
            } else {
                value.sort((a, b) => (b[sort.key] || '').localeCompare(a[sort.key]))
            }
        } else {
            value.sort((a, b) => {
                const sa = a[sort.key]
                const sb = b[sort.key]
                if (sa > sb) return -1
                if (sa < sb) return 1
                return 0
            })
        }
    } else {
        if (sort.localCompare) {
            if (sort.path) {
                value.sort((a, b) => (propertyByPath(sort.path, a) || '').localeCompare(propertyByPath(sort.path, b)))
            } else {
                value.sort((a, b) => (a[sort.key] || '').localeCompare(b[sort.key]))
            }
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

    let total = 0
    const inLoop = (key, isObject) => {
        if (loopFacet) {
            createFacets(loopFacet, value[key], true)
        }
        const filter = checkFilter(activeFilters, value, key)
        if (filter) {
            if (filter.or && loopFacet) {
                const filteredFacets = filter.facetKey ? loopFacet.filter(facet => facet.key === filter.facetKey) : loopFacet
                createFacets(filteredFacets, value[key], false)
            }

            if (re.assign) {
                if (isObject) {
                    delete value[key]
                } else {
                    value.splice(key, 1)
                }
            }
        } else {
            total++
            if (re.loop.reduce) {
                value[key] = re.loop.assign ? assignIfObjectOrArray(value[key]) : value[key]
                resolveReduce(re.loop.reduce, rootData, value[key], { debugLog, depth: depth + 1 })
            }

            if (loopFacet) {
                createFacets(loopFacet, value[key])
            }

            if (re.loop.toArray) {
                const v = re.loop.toArray.key ? value[key][re.loop.toArray.key] : value[key]
                if (re.loop.toArray.duplicates) {
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
        // Strikter constructor Check wie im Original wiederhergestellt
        if (value.constructor === Object) {
            const keys = Object.keys(value)
            debugInfo.messages.push(`loop through object data ${keys.length}`)
            const keysLen = keys.length
            for (let i = 0; i < keysLen; i++) {
                inLoop(keys[i], true)
            }
        } else if (Array.isArray(value)) {
            debugInfo.messages.push(`loop through array data ${value.length} with filter ${JSON.stringify(activeFilters)}`)
            for (let i = value.length - 1; i >= 0; i--) {
                inLoop(i, false)
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

    if (re.loop.toArray) {
        if (newSet.size > 0) {
            newArray = [...newSet]
        }
        setPropertyByPath(newArray, re.loop.toArray.pathTo, rootData)
        cacheData[re.loop.toArray.pathTo] = newArray
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
                    // Strikter Check wiederhergestellt, um Wrapper-Objekte exakt gleich zu behandeln
                    if (value.constructor === Number || value.constructor === String) {
                        lookedupData = lookupData[value]
                        if (lookupData === undefined) {
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

                        const valLen = value.length
                        for (let k = 0; k < valLen; k++) {
                            const key = value[k]

                            if (loopFacet) {
                                createFacets(loopFacet, lookupData[key], true)
                            }

                            const filter = checkFilter(activeFiltersBefore, lookupData, key)
                            if (filter) {
                                if (loopFacet && filter.or) {
                                    createFacets(loopFacet, lookupData[key], false)
                                }
                                continue
                            }

                            if (loopFacet) {
                                createFacets(loopFacet, lookupData[key], false)
                            }

                            if (re.lookup.group && re.lookup.group.keepOnlyOne) {
                                if (groups[lookupData[key][re.lookup.group.key]]) {
                                    continue
                                }
                            }

                            if (re.lookup.limit && re.lookup.limit <= count) {
                                continue
                            }
                            if (checkFilter(activeFilters, lookupData, key)) {
                                continue
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
                    // Zurück auf constructor === Object
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

                // Zurück auf constructor === Object
                if (re.assign && value && value.constructor === Object) {
                    const keys = Object.keys(value)
                    const keysLen = keys.length
                    for (let i = 0; i < keysLen; i++) {
                        const key = keys[i]
                        // Zurück auf constructor === Object
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
                // Unsichtbares Caching per defineProperty, um JSON-Serialisierung nicht zu stören
                if (!filter.search._cachedRegExp) {
                    Object.defineProperty(filter.search, '_cachedRegExp', {
                        value: new RegExp(filter.search.expr, 'i'),
                        enumerable: false, // Versteckt die Property vor Object.keys() und JSON.stringify()
                        writable: true,
                        configurable: true
                    })
                }
                const re = filter.search._cachedRegExp
                const keys = Object.keys(filter.search.fields)
                const keysLen = keys.length

                let hasMatch = false
                for (let y = 0; y < keysLen; y++) {
                    const fieldKey = keys[y]
                    let valueToCheck
                    if (fieldKey.indexOf('.') >= 0) {
                        valueToCheck = propertyByPath(fieldKey, value[key])
                    } else {
                        valueToCheck = value[key][fieldKey]
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