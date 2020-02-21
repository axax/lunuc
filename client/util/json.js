

export function propertyByPath(path, obj, separator='.') {
    return path.split(separator).reduce((res, prop) => res?res[prop]:null, obj)
}

export function setPropertyByPath(value, path, obj, separator='.'){
    const fields = path.split(separator)
    for (let i = 0, n = fields.length; i < n; i++) {
        let field = fields[i]
        if (i === n - 1) {
            if( value && value.constructor===String) {
                obj[field] = value.replace(/"/g, '\\\\\\\"')
            }else{
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
