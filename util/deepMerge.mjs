/*
A function for deep (recursive) merging of objects and arrays
*/
const isObject = obj => obj && obj.constructor === Object

const _deepMerge = (options, ...objects) => {
    const {concatArrays, mergeArray, arrayCutToLast} = options

    return objects.reduce((prev, obj) => {
        if (obj) {
            if (Array.isArray(obj)) {
                if (mergeArray) {
                    if(arrayCutToLast){
                        prev.length = obj.length
                    }
                    for (let i = 0; i < obj.length; i++) {
                        prev[i] = _deepMerge(options, prev[i], obj[i])
                    }
                }
            } else {
                Object.keys(obj).forEach(key => {
                    const pVal = prev[key]
                    const oVal = obj[key]

                    if (Array.isArray(pVal) && Array.isArray(oVal)) {
                        if (mergeArray) {
                            prev[key] = _deepMerge(options, pVal, oVal)
                        } else if (concatArrays) {
                            /*if(concatKeyProperty){
                                // remove same key
                                oVal.forEach(v1=>{
                                    const id = v1[concatKeyProperty]
                                    if(id){
                                        const toRemoveIndex = pVal.findIndex(v2=>v2[concatKeyProperty]===id)
                                        if(toRemoveIndex>=0) {
                                            pVal.splice(toRemoveIndex, 1)
                                        }
                                    }
                                })
                            }*/
                            prev[key] = pVal.concat(...oVal)
                        } else {
                            prev[key] = oVal
                        }
                    } else if (isObject(pVal) && isObject(oVal)) {
                        prev[key] = _deepMerge(options, pVal, oVal)
                    } else {
                        prev[key] = oVal
                    }
                })
            }
        }
        return prev
    }, Array.isArray(objects[0]) ? [] : {})
}

const _modify = (obj, newObj) => {

    Object.keys(obj).forEach(function (key) {
        delete obj[key]
    })

    Object.keys(newObj).forEach(function (key) {
        obj[key] = newObj[key]
    })

}

export function deepMerge(...objects) {
    return _deepMerge({}, ...objects)
}

export function deepMergeToFirst(o, ...objects) {
    const newObj = _deepMerge({}, o, ...objects)
    _modify(o, newObj)
}

export function deepMergeOptional(options, ...objects) {
    return _deepMerge(options, ...objects)
}
