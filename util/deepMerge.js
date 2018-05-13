const _deepMerge =(concatArrays, ...objects) => {
    const isObject = obj => obj && typeof obj === 'object'

    return objects.reduce((prev, obj) => {
        if( obj) {

            Object.keys(obj).forEach(key => {
                const pVal = prev[key]
                const oVal = obj[key]

                if ( Array.isArray(pVal) && Array.isArray(oVal)) {
                    if( concatArrays ) {
                        prev[key] = pVal.concat(...oVal)
                    }else{
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

export function deepMerge(...objects) {
    return _deepMerge(false, ...objects)
}

export function deepMergeConcatArrays(...objects) {
    return _deepMerge(true, ...objects)
}