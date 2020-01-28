/**
 * Object with helper methods for jsonDom handling
 */

export const getComponentByKey = (key, json) => {
    if (!json) return
    const keyParts = key.split('.')

    // as the key always starts with 0 remove the first value
    keyParts.shift()

    if (json.constructor !== Array) {
        keyParts.shift()
    }
    let cur = json
    for (let i = 0; i < keyParts.length; i++) {
        if (i > 0 && keyParts[i - 1] === '$loop') {
            continue
        }
        const part = keyParts[i]
        if (cur.constructor === Object && cur.c) cur = cur.c
        if (cur.constructor === Object && !isNaN(part)) cur = [cur]

        if (!cur[part]) {
            console.warn('Something is wrong with the key: ' + key, part)
            return null
        }
        cur = cur[part]
    }
    return cur
}


export const addComponent = ({key, json, index, component}) => {
    const subJson = getComponentByKey(key, json)
    if (subJson) {
        let c = subJson['c']
        if (!c) {
            c = []
        } else if (c.constructor === Object) {
            c = [c]
        } else if (c.constructor === String) {
            c = [{c}]
        }
        if (!component) {
            component = {'c': 'new component'}
        }
        if (isNaN(index)) {
            index = c.length
        }

        c.splice(index, 0, component)
        subJson.c = c
    }
    return subJson
}

export const getParentKey = (key) => {
    return key.substring(0, key.lastIndexOf('.'))
}

export const removeComponent = (key, json) => {
    const parentKey = getParentKey(key)
    const parent = getComponentByKey(parentKey, json),
        child = getComponentByKey(key, json)
    if (parent && child) {
        let c = parent.constructor===Array?parent:parent['c']
        if (c.constructor !== Array) {
            c = ''
        } else {
            c.splice(c.indexOf(child), 1)
        }

        if (c.constructor === Array && c.length === 0) {
            c = ''
        }

        parent.c = c
        return true
    }else{
        console.warn(`Can't remove component ${key}`)
    }

    return false
}


export const isTargetAbove = (sourceKey, targetKey) => {
    let isTargetAbove = true
    const sourceKeyParts = sourceKey.split('.')
    const targetKeyParts = targetKey.split('.')
    for (let i = 0; i < sourceKeyParts.length; i++) {
        if (i > targetKeyParts.length) {
            break
        }
        if (sourceKeyParts[i] === targetKeyParts[i]) {
            continue
        }
        const posSource = parseInt(sourceKeyParts[i]),
            posTarget = parseInt(targetKeyParts[i])

        if (posTarget > posSource) {
            isTargetAbove = false
            break
        }
    }
    return isTargetAbove
}


export const classNameByPath = (path, extraClassName) => {
    let className = 'JsonDom'
    if (path != undefined && path.constructor === String) {

        const p = path.split('/')
        let classPath = ''
        for (let i = 0; i < p.length; i++) {
            if (classPath) classPath += '-'
            classPath += p[i]
            className += ' Cms-' + classPath
        }
    }
    if (extraClassName)
        className += ' ' + extraClassName
    return className
}
