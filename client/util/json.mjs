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

/*
 split a path into its segments once, so hot callers can reuse the result
 */
export function pathToParts(path, separator = '.') {
    if (!path) {
        return []
    }
    const raw = path.split(separator)
    const last = raw.length - 1
    const parts = []
    let escaped = ''
    for (let i = 0; i <= last; i++) {
        const prop = raw[i]
        // a trailing backslash only escapes if a separator actually follows
        if (i < last && prop.charCodeAt(prop.length - 1) === 92 /* \ */) {
            escaped += prop.slice(0, -1) + separator
            continue
        }
        parts.push(escaped ? escaped + prop : prop)
        escaped = ''
    }
    return parts
}

export function propertyByParts(parts, obj) {
    let res = obj
    for (let i = 0, len = parts.length; i < len; i++) {
        if (!res) return null
        res = res[parts[i]]
    }
    return res
}

export const isFalse = value => value === 'false' || value === false
export const isTrue = value => value === 'true' || value === true

export const isString = (variable) => typeof variable === 'string'

/*
return true if expression is not valid
 */
const EXPR_REGEX = /([\w$.|]*)(==|!=|>=|<=|>|<| in | nin )(.*)/
const QUOTED_REGEX = /"([^"]*)"/g

// int op codes -> the switch below compiles into a jump table
const OP_EQ = 1, OP_NE = 2, OP_GT = 3, OP_GTE = 4, OP_LT = 5, OP_LTE = 6, OP_IN = 7, OP_NIN = 8

const OPS = {
    '==': OP_EQ,
    '!=': OP_NE,
    '>': OP_GT,
    '>=': OP_GTE,
    '<': OP_LT,
    '<=': OP_LTE,
    ' in ': OP_IN,
    ' nin ': OP_NIN
}

const EXPR_CACHE_LIMIT = 2000
const exprCache = new Map()

function parseExpr(expr) {
    const match = EXPR_REGEX.exec(expr)
    if (!match) {
        return null
    }
    const op = OPS[match[2]]
    if (!op) {
        return null
    }

    const raw = match[3]

    let set = null
    if (op === OP_IN || op === OP_NIN) {
        set = new Set()
        const found = raw.match(QUOTED_REGEX)
        if (found) {
            for (let i = 0; i < found.length; i++) {
                set.add(found[i].slice(1, -1))
            }
        }
    }

    return {
        op,
        // path is split only once per unique expression
        parts: pathToParts(match[1]),
        raw,
        num: (op >= OP_GT && op <= OP_LTE) ? parseFloat(raw) : 0,
        set
    }
}

function getExpr(expr) {
    let parsed = exprCache.get(expr)
    if (parsed === undefined) {
        parsed = parseExpr(expr)
        if (exprCache.size >= EXPR_CACHE_LIMIT) {
            exprCache.clear()
        }
        exprCache.set(expr, parsed)
    }
    return parsed
}

export function matchExpr(expr, scope) {
    // fast paths first, these cover most of the calls
    if (expr === 'true' || expr === true) {
        return false
    }
    if (expr === 'false' || expr === false) {
        return true
    }
    if (typeof expr !== 'string') {
        return false
    }

    const e = getExpr(expr)
    if (e === null) {
        return false
    }

    const prop = propertyByParts(e.parts, scope)
    const raw = e.raw

    switch (e.op) {
        case OP_EQ:
            return raw !== (typeof prop === 'string' ? prop : String(prop))
        case OP_NE:
            return raw === (typeof prop === 'string' ? prop : String(prop))
        case OP_GT:
            return !(prop > e.num)
        case OP_GTE:
            return !(prop >= e.num)
        case OP_LT:
            return !(prop < e.num)
        case OP_LTE:
            return !(prop <= e.num)
        case OP_IN:
        case OP_NIN: {
            const isNin = e.op === OP_NIN
            const set = e.set
            if (Array.isArray(prop)) {
                for (let i = 0, l = prop.length; i < l; i++) {
                    const p = prop[i]
                    if (p === raw || set.has(typeof p === 'string' ? p : String(p))) {
                        return isNin
                    }
                }
                return !isNin
            }
            const found = set.has(typeof prop === 'string' ? prop : String(prop))
            return isNin ? found : !found
        }
    }

    return false
}


export function propertyByPath(path, obj, separator = '.', assign = false) {
    if (!path) {
        return assign ? assignIfObjectOrArray(obj) : obj
    }
    if (!obj) {
        return null
    }

    // Fast-Path: einzelnes Segment ohne Escaping -> direkter Zugriff ohne Array
    if (path.indexOf(separator) === -1) {
        if (assign) {
            obj[path] = assignIfObjectOrArray(obj[path])
        }
        return obj[path]
    }

    const parts = pathToParts(path, separator)

    if (!assign) {
        return propertyByParts(parts, obj)
    }

    let res = obj
    for (let i = 0, len = parts.length; i < len; i++) {
        if (!res) return null
        const prop = parts[i]
        res[prop] = assignIfObjectOrArray(res[prop])
        res = res[prop]
    }
    return res
}


export function setPropertyByPath(value, path, obj, separator = '.') {
    const parts = pathToParts(path, separator)
    let objLast, finalPathLast
    for (let i = 0, n = parts.length; i < n; i++) {
        const finalPath = parts[i]

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
        if(!subJson){
            continue
        }
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
        if(typeof str==='object') {
            return str
        }
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


// Quick sanity checks covering each operator
/*console.log(matchExpr('foo==bar', { foo: 'bar' }))   // false
console.log(matchExpr('foo==bar', { foo: 'baz' }))   // true
console.log(matchExpr('x>5', { x: 10 }))            // false
console.log(matchExpr('x>5', { x: 3 }))             // true*/
// etc.
/*console.log(propertyByPath('0',[
    {
        "t": "div",
        "p": {
            "className": "click-counter-wrapper"
        },
        "c": [
            {
                "t": "button",
                "c": "klick mich",
                "p": {
                    "id": "button",
                    "onClick": {
                        "action": "button"
                    }
                }
            },
            {
                "t": "label",
                "c": "Aktueller Klick-Count: ${this.scope.script.getClickCount()}"
            }
        ]
    }
]))*/