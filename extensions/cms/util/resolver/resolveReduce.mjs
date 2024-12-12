import {assignIfObjectOrArray, matchExpr, propertyByPath, setPropertyByPath} from '../../../../client/util/json.mjs'
import Cache from '../../../../util/cache.mjs'


function createFacetSliderMinMax(value, facetData) {
    if (facetData.min === undefined || facetData.min > value) {
        if (!isNaN(value)) {
            facetData.min = value
        }
    }
    if (facetData.max === undefined || facetData.max < value) {
        if (!isNaN(value)) {
            facetData.max = value
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
        facets.forEach(facet=>{
            let currentFacet = facet
            const facetValue = data[facet.key]
            if(beforeFilter){
                if(!facet.beforeFilter) {
                    facet.beforeFilter = {}
                }
                currentFacet = facet.beforeFilter
            }
            if (facet.type === 'slider') {

                if(facetValue && facetValue.constructor === Array){
                    facetValue.forEach(value=>{
                        createFacetSliderMinMax(value, currentFacet)
                    })
                }else{
                    createFacetSliderMinMax(facetValue, currentFacet)
                }

            } else {
                if (!currentFacet.values) {
                    currentFacet.values = {}
                }


                if(Array.isArray(facetValue)){
                    facetValue.forEach(fv=>{
                        addFacetValue(currentFacet, fv)
                    })
                }else{
                    addFacetValue(currentFacet, facetValue || '')
                }
            }
        })
    }
}


const isNotFalse = ($is)=>{
    return $is !== false && $is !== 'false'
}

const addToArray = (newArray, value, options)=>{
    if(options.key){
        if(options.duplicates || !newArray.includes(value[options.key])){
            newArray.push(value[options.key])
        }
    }else if(options.duplicates || !newArray.includes(value)){
        newArray.push(value)
    }
}

function getFacetAsArray(path, rootData) {
    let  loopFacet = propertyByPath(path, rootData)
    if(loopFacet){
        //to array
        return Object.keys(loopFacet).map(key=>({...loopFacet[key], key}))
    }
}

function setFacetToObject(path, rootData, loopFacet) {
    let  facets = propertyByPath(path, rootData)
    loopFacet.forEach(facet=>{
        facets[facet.key] = facet
        delete facet.key
    })
}

function doSorting(re, currentData) {
    const value = propertyByPath(re.path, currentData, '.', re.assign)

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
                if (a[sort.key] > b[sort.key])
                    return -1
                if (a[sort.key] < b[sort.key])
                    return 1
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
                if (a[sort.key] < b[sort.key])
                    return -1
                if (a[sort.key] > b[sort.key])
                    return 1
                return 0
            })
        }
    }
}

function doLoopThroughData(re, currentData, rootData, debugLog, depth, debugInfo) {
    let value = propertyByPath(re.path, currentData, '.', re.assign),
        loopFacet,
        newArray = []

    const activeFilters = re.loop.filter && re.loop.filter.filter(f => isNotFalse(f.is))

    let cacheKey
    if(re.loop.cache && isNotFalse(re.loop.cache.$is) && !re.loop.reduce &&
        (re.loop.cache.includeFilter || !activeFilters || activeFilters.length===0)){
        cacheKey = `resolveReduce${re.path}-${JSON.stringify(re.loop)}`
        const fromCache = Cache.get(cacheKey)
        if(fromCache){
            Object.keys(fromCache).forEach(path=>{
                setPropertyByPath(fromCache[path], path, rootData)
            })
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
                createFacets(loopFacet, value[key])
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
                // not recommended tue to performance
                value[key] = re.loop.assign ? assignIfObjectOrArray(value[key]) : value[key]

                resolveReduce(re.loop.reduce, rootData, value[key], {debugLog, depth: depth + 1})
            }

            if (loopFacet) {
                createFacets(loopFacet, value[key])
            }

            if (re.loop.toArray) {
                addToArray(newArray, value[key], re.loop.toArray)
            }
        }
    }

    if (!value) {
        debugInfo.messages.push(`no value for ${JSON.stringify(re)}`)
    } else {
        if (value.constructor === Object) {

            for (const key of Object.keys(value)) {
                inLoop(key, true)
            }
        } else if (value.constructor === Array) {
            for (let i = value.length - 1; i >= 0; i--) {
                inLoop(i)
            }
        }
    }

    const cacheData = {}
    if (loopFacet) {
        setFacetToObject(re.loop.facets.path, rootData, loopFacet)
        cacheData[re.loop.facets.path] = propertyByPath(re.loop.facets.path,rootData)
    }

    if (re.loop.total) {
        setPropertyByPath(total, re.loop.total.path, rootData)
        cacheData[re.loop.total.path] = total
    }

    if (re.loop.toArray) {
        setPropertyByPath(newArray, re.loop.toArray.pathTo, rootData)
        cacheData[re.loop.toArray.pathTo] = newArray
    }

    if(cacheKey){
        Cache.set(cacheKey,cacheData,re.loop.cache.expires || 0)
    }
}

/*
Version 1
Takes a data structure and converts it or extracts specific data from it.
 */
export const resolveReduce = (reducePipe, rootData, currentData, {debugLog, depth=0}) => {

    for(let pipeIndex = 0 ; pipeIndex<reducePipe.length;pipeIndex++){
        const re = reducePipe[pipeIndex]
        if (isNotFalse(re.$is)) {
            const debugInfo = {index: pipeIndex, step: re, startTime: new Date().getTime(), messages:[]}

            if (re.sort) {
                doSorting(re, currentData)
            } else if (re.lookup) {
                const lookupData = propertyByPath(re.lookup.path, rootData, '.', !!re.lookup.assign)
                const value = propertyByPath(re.path, currentData)
                let lookedupData, groups
                if (value !== undefined && value !== null) {
                    if (value.constructor === Number || value.constructor === String) {
                        lookedupData = lookupData[value]
                        if (lookupData === undefined) {
                            console.warn(`${value} not found in`, lookupData)
                        }
                    } else if (value.constructor === Array) {
                        lookedupData = [], groups = {}
                        let count = 0,loopFacet

                        if(re.lookup.facets && isNotFalse(re.lookup.facets.$is)){
                            loopFacet = getFacetAsArray(re.lookup.facets.path, rootData)
                        }

                        const activeFilters = re.lookup.filter && re.lookup.filter.filter(f=>isNotFalse(f.is))
                        const activeFiltersBefore = re.lookup.filterBefore && re.lookup.filterBefore.filter(f=>isNotFalse(f.is))

                        value.forEach(key => {

                            if (loopFacet) {
                                createFacets(loopFacet, lookupData[key], true)
                            }

                            const filter = checkFilter(activeFiltersBefore, lookupData, key)

                            if (filter) {
                                if(loopFacet && filter.or) {
                                    createFacets(loopFacet, lookupData[key])
                                }
                                return
                            }

                            if (loopFacet) {
                                createFacets(loopFacet, lookupData[key])
                            }

                            if (re.lookup.group && re.lookup.group.keepOnlyOne) {
                                if (groups[lookupData[key][re.lookup.group.key]]) {
                                    return
                                }
                            }

                            if (re.lookup.limit && re.lookup.limit <= count) {
                                return
                            }
                            if (checkFilter(activeFilters, lookupData, key)) {
                                return
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
                        })


                        if(loopFacet){
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

                if(re.extend || re.override){
                    if(lookedupData && lookedupData.constructor === Object){
                        const fieldOptions = re.extend && re.extend.fieldOptions || {}
                        Object.keys(lookedupData).forEach(key=> {
                            if (re.override) {
                                currentData[key] = lookedupData[key]
                            } else if (re.extend === true || re.extend.full === true || (re.extend.constructor === Object && re.extend.fields && re.extend.fields.indexOf(key) >= 0)) {

                                if (currentData[key]) {
                                    if(currentData[key].constructor === Array){
                                        if(!fieldOptions[key] || fieldOptions[key].mergeArray!==false) {
                                            currentData[key] = [...currentData[key], ...lookedupData[key]]
                                        }
                                    }else {
                                        currentData[key] = lookedupData[key]
                                    }
                                } else {
                                    currentData[key] = lookedupData[key]
                                }
                            }
                        })
                    }
                }else if (re.key) {

                    if(re.onCurrent){
                        currentData[re.key] = lookedupData
                    }else{
                        rootData[re.key] = lookedupData
                    }
                } else {
                    setPropertyByPath(lookedupData, re.path, currentData)
                }

            } else if (re.random) {
                let value = propertyByPath(re.path, currentData, '.', false)
                const picks = []
                for (let i = 0; i < re.random; i++) {
                    picks.push(value[Math.floor(Math.random() * value.length)])
                }
                rootData[re.key] = picks
            }else if(re.set){
                setPropertyByPath(re.set, re.key, currentData)
            } else if (re.key) {

                const value = propertyByPath(re.path, currentData, '.', re.assign)

                if (re.assign && value && value.constructor === Object) {
                    Object.keys(value).forEach(key => {
                        if (value[key] && value[key].constructor === Object) {
                            value[key] = Object.assign({}, value[key])
                        }
                    })
                }
                if (re.get) {
                    if (re.separator) {
                        const aGet = re.get.split(re.separator)
                        const aValue = rootData[re.key] || []
                        aGet.forEach(sget => {
                            let getKey = propertyByPath(sget, currentData)
                            if (getKey === null || getKey === undefined) {
                                getKey = sget
                            }

                            if(!re.ignoreNull || value[getKey] != null){
                                aValue.push(value[getKey])
                            }
                        })
                        rootData[re.key] = aValue
                    } else {
                        let getKey = propertyByPath(re.get, currentData)
                        if (getKey === null || getKey === undefined) {
                            getKey = re.get
                        }
                        if (getKey && getKey.constructor === Array) {
                            const aValue = []
                            getKey.forEach(key => {
                                aValue.push(value[key])
                            })
                            rootData[re.key] = aValue

                        } else {
                            if(re.toArray){
                                if(!rootData[re.key]){
                                    rootData[re.key] = []
                                }
                                if(re.duplicates || rootData[re.key].indexOf(value[getKey])<0) {
                                    rootData[re.key].push(value[getKey])
                                }
                            }else {
                                rootData[re.key] = value[getKey]
                            }
                        }
                    }
                } else {
                    if(re.toArray){
                        const toArrayStart = new Date().getTime()
                        if(!rootData[re.key]){
                            rootData[re.key] = []
                        }
                        if(!value){
                        }else if(value.constructor === Object && re.toArray==='fromObject'){
                            // TODO duplicates check
                            rootData[re.key].push(...Object.values(value))
                        }else if(value.constructor === Array){
                            // TODO duplicates check
                            rootData[re.key].push(...value)
                        }else if(re.duplicates || rootData[re.key].indexOf(value)<0){
                            rootData[re.key].push(value)
                        }
                        debugInfo.toArrayTime = new Date().getTime()-toArrayStart

                    }else {
                        rootData[re.key] = value
                    }
                }
            } else if (re.loop) {
                doLoopThroughData(re, currentData, rootData, debugLog, depth, debugInfo)
            } else if (re.reduce) {
                const arr = propertyByPath(re.path, currentData)
                resolveReduce(re.reduce, rootData, arr, {debugLog, depth: depth + 1})
            } else if (re.limit) {
                let value = propertyByPath(re.path, currentData, '.', re.assign)
                const offset =  (re.offset || 0)

                if(offset>0){
                    value.splice(0,offset)
                }

                if(value.length>re.limit) {
                    value.length = re.limit
                }
            }
            if (re.remove) {
                const parentPath = re.path.substring(0, re.path.lastIndexOf('.'))
                const ob = propertyByPath(parentPath, currentData)
                delete ob[re.path.substring(re.path.lastIndexOf('.') + 1)]
            }

            if(depth<1) {
                debugInfo.time = new Date().getTime() - debugInfo.startTime
                debugLog.push(debugInfo)
            }
        }
    }
}



const checkFilter = (filters, value, key) => {
    if(filters) {
        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i]

            if (filter.search) {
                const re = new RegExp(filter.search.expr, 'i'),
                    keys = Object.keys(filter.search.fields)


                let hasMatch = false
                for (let y = 0; y < keys.length; y++) {
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
                if (matchExpr(filter.expr, {key, value: value[key]})) {
                    return filter
                }
            }
        }
    }
    return false
}