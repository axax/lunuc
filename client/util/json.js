export function propertyByPath(path, obj, separator = '.', assign = false) {
    if (!path) {
        return assign ? assignIfObjectOrArray(obj) : obj
    }
    return path.split(separator).reduce((res, prop) => {
        if (res) {
            if (assign) {
                res[prop] = assignIfObjectOrArray(res[prop])
            }
            return res[prop]
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

export function matchExpr(expr, scope){
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
        }else if (match[2] === '!=') {
            if (match[3] === String(prop)) {
                return true
            }
        }else if (match[2] === '>') {
            if (!(prop > parseInt(match[3]))) {
                return true
            }
        }else if (match[2] === '>=') {
            if (!(prop >= parseInt(match[3]))) {
                return true
            }
        }else if (match[2] === '<') {
            if (!(prop < parseInt(match[3]))) {
                return true
            }
        }else if (match[2] === '<=') {
            if (!(prop <= parseInt(match[3]))) {
                return true
            }
        }else if (match[2] === ' in ') {
            if (match[3].indexOf('"'+prop+'"')===-1) {
                return true
            }
        }
    }
    return false
}

export function setPropertyByPath(value, path, obj, separator = '.') {
    const fields = path.split(separator)
    for (let i = 0, n = fields.length; i < n; i++) {
        let field = fields[i]
        if (i === n - 1) {
            if (value && value.constructor === String) {
                obj[field] = value //Util.escapeForJson(value) //.replace(/"/g, '\\\\\\\"')
            } else {
                obj[field] = value
            }
        } else {
            if (obj[field] == undefined) {
                obj[field] = {}
            }
            obj = obj[field]
        }
    }
}
