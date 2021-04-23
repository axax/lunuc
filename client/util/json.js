export function propertyByPath(path, obj, separator = '.', assign = false) {
    if (!path) {
        return assign ? assignIfObjectOrArray(obj) : obj
    }
    let escapedPath
    return path.split(separator).reduce((res, prop) => {
        if (res) {
            if (prop.lastIndexOf('\\') === prop.length-1) {
                if (!escapedPath) {
                    escapedPath = ''
                }
                escapedPath += prop.substring(0, prop.length - 1)+separator
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

export function matchExpr(expr, scope) {
    if (expr === 'false') {
        return true
    }
    const match = expr.match(/([\w|$|\.]*)(==|\!=|>=|<=|>|<| in )(.*)/)
    if (match && match.length === 4) {
        let prop
        try {
            prop = propertyByPath(match[1], scope)
        } catch (e) {
        }
        if (match[2] === '==') {
            if (match[3] !== String(prop)) {
                return true
            }
        } else if (match[2] === '!=') {
            if (match[3] === String(prop)) {
                return true
            }
        } else if (match[2] === '>') {
            if (!(prop > parseInt(match[3]))) {
                return true
            }
        } else if (match[2] === '>=') {
            if (!(prop >= parseInt(match[3]))) {
                return true
            }
        } else if (match[2] === '<') {
            if (!(prop < parseInt(match[3]))) {
                return true
            }
        } else if (match[2] === '<=') {
            if (!(prop <= parseInt(match[3]))) {
                return true
            }
        } else if (match[2] === ' in ') {
            if(prop && prop.constructor === Array){
                let exists = false
                for(let i = 0; i<prop.length;i++){
                    console.log(prop[i], match[3])
                    if (match[3].indexOf('"' + prop[i] + '"') >=0) {
                        exists = true
                        break
                    }
                }
                return exists?false:true
            }else if (match[3].indexOf('"' + prop + '"') === -1) {
                return true
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
        if (field.lastIndexOf('\\') === field.length-1) {
            if (!escapedPath) {
                escapedPath = ''
            }
            escapedPath += field.substring(0, field.length - 1)+separator
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
            if (value && value.constructor === String) {
                obj[finalPath] = value //Util.escapeForJson(value) //.replace(/"/g, '\\\\\\\"')
            } else {
                obj[finalPath] = value
            }
        } else {
            if (obj[finalPath] == undefined) {
                if( !isNaN(finalPath)){
                    if(obj.constructor !== Array){
                        obj = objLast[finalPathLast]=[]
                    }
                }
                obj[finalPath] = {}
            }

            objLast = obj
            finalPathLast =finalPath
            obj = obj[finalPath]
        }

    }
}
