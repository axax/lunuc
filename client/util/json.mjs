export function propertyByPath(path, obj, separator = '.', assign = false) {
    if (!path) {
        return assign ? assignIfObjectOrArray(obj) : obj
    }
    let escapedPath
    return path.split(separator).reduce((res, prop) => {
        if (res) {
            if (prop.lastIndexOf('\\') === prop.length - 1) {
                if (!escapedPath) {
                    escapedPath = ''
                }
                escapedPath += prop.substring(0, prop.length - 1) + separator
                return res
            }
            let finalPath
            if (escapedPath) {
                finalPath = escapedPath + prop
                escapedPath = ''
            } else {
                finalPath = prop
            }

            if (assign) {
                res[finalPath] = assignIfObjectOrArray(res[finalPath])
            }
            return res[finalPath]
        }
        return null

    }, obj)
}

export function assignIfObjectOrArray(obj) {
    if (obj) {
        if (obj.constructor === Array) {
            return Object.assign([], obj)
        } else if (obj.constructor === Object) {
            return Object.assign({}, obj)
        }
    }
    return obj
}

export const isFalse = value => value==='false' || value===false

export const isString = (variable) => typeof variable === 'string'

/*
return true if expression is not valid
 */
export function matchExpr(expr, scope) {
    if (isFalse(expr)) {
        return true
    }

    if(isString(expr) && expr!=='true') {
        const match = expr.match(/([\w|$|\.]*)(==|\!=|>=|<=|>|<| in | nin )(.*)/)

        if (match && match.length === 4) {
            let prop
            try {
                prop = propertyByPath(match[1], scope)
            } catch (e) {
            }
            const m2 = match[2], m3 = match[3]
            if (m2 === '==') {
                if (m3 !== String(prop)) {
                    return true
                }
            } else if (m2 === '!=') {
                if (m3 === String(prop)) {
                    return true
                }
            } else if (m2 === '>') {
                const v = Array.isArray(m3)?m3[m3.length-1]:m3
                if (!(prop > parseFloat(v))) {
                    return true
                }
            } else if (m2 === '>=') {
                const v = Array.isArray(m3)?m3[m3.length-1]:m3
                if (!(prop >= parseFloat(v))) {
                    return true
                }
            } else if (m2 === '<') {
                const v = Array.isArray(m3)?m3[0]:m3
                if (!(prop < parseFloat(v))) {
                    return true
                }
            } else if (m2 === '<=') {
                const v = Array.isArray(m3)?m3[0]:m3
                if (!(prop <= parseFloat(v))) {
                    return true
                }
            } else if (m2 === ' in ' || m2 === ' nin ') {
                if (Array.isArray(prop)) {
                    let exists = false
                    for (let i = 0; i < prop.length; i++) {
                        if (m3.indexOf('"' + prop[i] + '"') >= 0 || m3 === prop[i]) {
                            exists = true
                            break
                        }
                    }
                    let res = exists ? false : true
                    return m2 === ' nin ' ? !res : res
                } else {
                    const idx = m3.indexOf('"' + prop + '"')
                    if (m2 === ' nin ') {
                        return idx >= 0
                    } else {
                        return idx === -1
                    }
                }
            }
        }
    }
    return false
}

export function setPropertyByPath(value, path, obj, separator = '.') {
    const fields = path.split(separator)
    let escapedPath
    let objLast, finalPathLast
    for (let i = 0, n = fields.length; i < n; i++) {

        let field = fields[i]
        if (field.lastIndexOf('\\') === field.length - 1) {
            if (!escapedPath) {
                escapedPath = ''
            }
            escapedPath += field.substring(0, field.length - 1) + separator
            continue
        }
        let finalPath
        if (escapedPath) {
            finalPath = escapedPath + field
            escapedPath = ''
        } else {
            finalPath = field
        }

        if (i === n - 1) {
            obj[finalPath] = value
        } else {
            if (obj[finalPath] == undefined) {
                if (!isNaN(finalPath)) {
                    if (obj.constructor !== Array) {
                        obj = objLast[finalPathLast] = [obj]
                    }
                }
                obj[finalPath] = {}
            }

            objLast = obj
            finalPathLast = finalPath
            obj = obj[finalPath]
        }

    }
}


export const findSegmentByKeyOrPath = ({json, key, path}) => {

    let firstOfPath
    if (path) {
        if (path.indexOf('.') < 0) {
            firstOfPath = path
        } else {
            firstOfPath = path.substring(0, path.indexOf('.'))

        }
    }
    let segment, index = -1
    for (let i = 0; i < json.length; i++) {
        const subJson = json[i]
        if (key) {
            if (subJson.key === key) {
                index = i
                segment = subJson
                break
            }
        } else if (subJson[firstOfPath]) {
            index = i
            segment = subJson
            break
        }
    }
    return {segment, index}
}

export const parseOrElse = (str, elseValue) => {
    if(str) {
        try {
            return JSON.parse(str)
        } catch (e) {
            //console.warn('parseOrElse', e, str, elseValue)
        }
    }
    return elseValue===undefined ? str : elseValue
}

export const findObjectsByAttributeValue = (obj, attr, attrValue, options = {}) => {
    let results = []
    const isAttrValueArray = Array.isArray(attrValue)

    function traverse(obj, parentObj, keyIndex) {
        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                // Handle arrays
                for (let i = 0; i < obj.length; i++) {
                    traverse(obj[i], obj, i)
                }
            } else {
                // Handle objects
                if ((isAttrValueArray && attrValue.indexOf(obj[attr])>=0) || obj[attr] === attrValue) {
                    if(options.returnParent) {
                        results.push({data:obj, parent:parentObj, keyIndex})

                    }else{
                        results.push(obj)
                    }
                }
                for (let key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        traverse(obj[key], obj, key)
                    }
                }
            }
        }
    }

    traverse(obj)
    return results
}


/*
0.1.0.1
0.0.0.10
0.0.0.9
0.0.0.8
--> 0.1.0.1, 0.0.0.10, 0.0.0.9, 0.0.0.8
 */
const parsePart = (part) => {
    const num = Number(part)
    return isNaN(num) ? 0 : num
}
export const sortJsonKeysDesc = (keys) => {
    return keys.sort((a, b) => {
        const aParts = a.split('.').map(parsePart)
        const bParts = b.split('.').map(parsePart)

        const len = Math.max(aParts.length, bParts.length)
        for (let i = 0; i < len; i++) {
            const diff = (bParts[i] || 0) - (aParts[i] || 0) // descending
            if (diff !== 0) return diff
        }
        return 0
    })
}