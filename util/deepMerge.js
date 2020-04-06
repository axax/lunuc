/*
A function for deep (recursive) merging of objects and arrays
*/

const _deepMerge = (concatArrays, ...objects) => {
    const isObject = obj => obj && obj.constructor === Object

    return objects.reduce((prev, obj) => {
        if (obj) {
            Object.keys(obj).forEach(key => {
                const pVal = prev[key]
                const oVal = obj[key]

                if (Array.isArray(pVal) && Array.isArray(oVal)) {
                    if (concatArrays) {
                        prev[key] = pVal.concat(...oVal)
                    } else {
                        prev[key] = oVal
                    }
                }
                else if (isObject(pVal) && isObject(oVal)) {
                    prev[key] = _deepMerge(concatArrays, pVal, oVal)
                } else {
                    prev[key] = oVal
                }
            })
        }
        return prev
    }, {})
}

const _modify = (obj, newObj) => {

    Object.keys(obj).forEach(function(key) {
        delete obj[key];
    });

    Object.keys(newObj).forEach(function(key) {
        obj[key] = newObj[key];
    });

}

export function deepMerge(...objects) {
    return _deepMerge(false,...objects)
}

export function deepMergeToFirst(o, ...objects) {
    const newObj = _deepMerge(false, o, ...objects)
    _modify(o, newObj)
}

export function deepMergeConcatArrays(...objects) {
    return _deepMerge(true, ...objects)
}
