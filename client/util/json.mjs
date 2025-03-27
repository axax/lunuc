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
                if (!(prop > parseFloat(m3))) {
                    return true
                }
            } else if (m2 === '>=') {
                if (!(prop >= parseFloat(m3))) {
                    return true
                }
            } else if (m2 === '<') {
                if (!(prop < parseFloat(m3))) {
                    return true
                }
            } else if (m2 === '<=') {
                if (!(prop <= parseFloat(m3))) {
                    return true
                }
            } else if (m2 === ' in ' || m2 === ' nin ') {
                if (prop && prop.constructor === Array) {
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
                        obj = objLast[finalPathLast] = []
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
            console.warn('parseOrElse', e, str, elseValue)
        }
    }
    return elseValue===undefined ? str : elseValue
}

export const findObjectsByAttributeValue = (obj, attr, attrValue) => {
    let results = []

    function traverse(obj) {
        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                // Handle arrays
                for (let i = 0; i < obj.length; i++) {
                    traverse(obj[i], attr, attrValue)
                }
            } else {
                // Handle objects
                if (obj[attr] === attrValue) {
                    results.push(obj)
                }
                for (let key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        traverse(obj[key],attr, attrValue)
                    }
                }
            }
        }
    }

    traverse(obj, attr, attrValue)
    return results
}