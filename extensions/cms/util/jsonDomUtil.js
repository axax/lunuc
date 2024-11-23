/**
 * Object with helper methods for jsonDom handling
 */
import DomUtilAdmin from '../../../client/util/domAdmin.mjs'
export {getComponentByKey} from './jsonDomUtilClient'

export const addComponent = ({key, json, index, component, newKeys}) => {
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
        }else if(newKeys){

            // Search for translation key and replace with newly generated one
            const trKeys = []
            DomUtilAdmin.findProperties(component, 'trKey').forEach(({element}) => {
                trKeys.push(element.trKey)
            })

            if (trKeys.length > 0) {
                let sourceStr = JSON.stringify(component)
                trKeys.forEach(trKey => {
                    const newTrKey = 'genid_' + Math.random().toString(36).substr(2, 9)
                    sourceStr = sourceStr.replace(new RegExp(trKey, "g"), newTrKey)
                })
                component = JSON.parse(sourceStr)
            }
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
        const parentKey = getParentKey(key)
        let index = parseInt(key.substring(key.lastIndexOf('.') + 1))
        if (isNaN(index)) {
            index = -1
        } else {
            index++
        }
        addComponent({key: parentKey, json, index, component: source, newKeys:true})
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
