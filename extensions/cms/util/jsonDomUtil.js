/**
 * Object with helper methods for jsonDom handling
 */
import DomUtilAdmin from '../../../client/util/domAdmin.mjs'

export const getComponentByKey = (key, json) => {
    if (!json || !key) return
    const posDash = key.lastIndexOf('-')
    let editedKey
    if (posDash >= 0) {
        // key has a dash if it is a nested CMS Page
        editedKey = key.substring(posDash + 1)
    } else {
        editedKey = key
    }
    const keyParts = editedKey.split('.')

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
        let part = keyParts[i]
        if (cur.constructor === Object && cur.c) cur = cur.c
        if (cur.constructor === Object && !isNaN(part)) cur = [cur]

        if (!cur[part] && part === '$loop') {
            // $loop and $for are the same
            part = '$for'
        }
        if (!cur[part]) {
            console.warn('Something is wrong with the key: ' + editedKey, part)
            return null
        }
        cur = cur[part]
    }
    return cur
}


export const addComponent = ({key, json, index, component}) => {
    const subJson = getComponentByKey(key, json)
    if (subJson) {
        let c
        if (subJson.constructor === Array) {
            c = subJson
        } else {
            c = subJson['c']
            if (!c) {
                c = []
            } else if (c.constructor === Object) {
                c = [c]
            } else if (c.constructor === String) {
                c = [{c}]
            }
        }
        if (!component) {
            component = {'c': 'new component'}
        }
        if (isNaN(index) || index < 0) {
            index = c.length
        }
        c.splice(index, 0, component)

        if (subJson.constructor !== Array) {
            subJson.c = c
        }
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
        let c = parent.constructor === Array ? parent : parent['c']
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
    } else {
        console.warn(`Can't remove component ${key}`)
    }

    return false
}


export const copyComponent = (key, json) => {

    const source = getComponentByKey(key, json)

    if (source) {

        const trKeys = []
        DomUtilAdmin.findProperties(source, 'trKey').forEach(({element}) => {
            trKeys.push(element.trKey)
        })

        let finalSource
        if (trKeys.length > 0) {
            let sourceStr = JSON.stringify(source)
            trKeys.forEach(trKey => {
                const newTrKey = 'genid_' + Math.random().toString(36).substr(2, 9)
                sourceStr = sourceStr.replace(new RegExp(trKey, "g"), newTrKey)
            })
            finalSource = JSON.parse(sourceStr)
        } else {
            finalSource = source
        }

        const parentKey = getParentKey(key)
        let index = parseInt(key.substring(key.lastIndexOf('.') + 1))
        if (isNaN(index)) {
            index = -1
        } else {
            index++
        }
        addComponent({key: parentKey, json, index, component: finalSource})
        return true
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
