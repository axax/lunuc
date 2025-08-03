/**
 * Object with helper methods for jsonDom handling
 */
import DomUtilAdmin from '../../../client/util/domAdmin.mjs'
import {getComponentByKey} from './jsonDomUtilClient'
export {getComponentByKey}

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


export const recalculatePixelValue = (currentValue='', newValue, currentValuePx) => {
    if (currentValue.endsWith('vh')) {
        newValue = `${(parseFloat(newValue) / window.innerHeight * 100).toFixed(2)}vh`
    } else if (currentValue.endsWith('rem')) {
        newValue = `${(parseFloat(newValue) / 16).toFixed(2)}rem`
    } else if (currentValue.startsWith('calc(') && currentValue.endsWith(')')) {
        // Remove whitespace and validate calc string
        const valueWithoutWhitespace = currentValue.replace(/\s/g, '')

        // Extract the expression inside calc()
        let expression = valueWithoutWhitespace.slice(5, -1)

        // Find and sum existing pixel values
        let totalPixels = parseFloat(newValue) - parseFloat(currentValuePx)
        const pixelRegex = /([+-]?\d*\.?\d+px)/g
        const pixelMatches = expression.match(pixelRegex) || []

        pixelMatches.forEach(px => {
            totalPixels += parseFloat(px)
            expression = expression.replace(px, '')
        })

        // Clean up expression (remove empty + or - signs)
        expression = expression.replace(/[+-]$/, '').replace(/\+-/, '-').replace(/--/, '+').replace(/\+\+/, '+')

        // Build new expression
        let newExpression = expression
        if (newExpression && totalPixels !== 0) {
            newExpression += totalPixels >= 0 ? '+' : ''
            newExpression += Math.round(parseFloat(totalPixels) * 100) / 100 + 'px'
        } else if (totalPixels !== 0) {
            newExpression = Math.round(parseFloat(totalPixels) * 100) / 100 + 'px'
        }

        // Add spaces around + and - signs
        if (newExpression) {
            newExpression = newExpression.replace(/([+-])/g, ' $1 ')
            newExpression = newExpression.replace(/\s+/g, ' ').trim()
            return `calc(${newExpression})`
        }
        return '0px'

    } else {
        newValue = Math.round(parseFloat(newValue) * 100) / 100 + 'px'
    }
    return newValue
}

export const getHighlightPosition = (node)=>  {
    let childMaxTop = 0,
        childMaxLeft = 0,
        childMinTop = Infinity,
        childMinLeft = Infinity,
        allAbs = node.childNodes.length>0

    if(node.tagName==='SELECT') {
        allAbs=false
    }else{
        for (const childNode of node.childNodes) {

            if (childNode.nodeType === Node.ELEMENT_NODE) {
                const style = window.getComputedStyle(childNode)
                if (style.display !== 'none' && style.opacity > 0) {
                    const rect = childNode.getBoundingClientRect()
                    childMinLeft = Math.min(rect.left, childMinLeft)
                    childMaxLeft = Math.max(rect.left + (rect.width ?? 0), childMaxLeft)
                    childMinTop = Math.min(rect.top, childMinTop)
                    childMaxTop = Math.max(rect.top + (rect.height ?? 0), childMaxTop)
                } else {
                    allAbs = false
                }
                if (style.position !== 'absolute') {
                    allAbs = false
                }
            } else {
                allAbs = false
            }
        }
    }

    if(!allAbs) {
        const rect = node.getBoundingClientRect()
        childMinLeft = Math.min(rect.left, childMinLeft)
        childMaxLeft = Math.max(rect.left + (rect.width ?? 0), childMaxLeft)
        childMinTop = Math.min(rect.top, childMinTop)
        childMaxTop = Math.max(rect.top + (rect.height ?? 0), childMaxTop)
    }

    const computedStyle = window.getComputedStyle(node)
    return {
        hovered: true,
        height: childMaxTop - childMinTop,
        width: childMaxLeft - childMinLeft,
        top: childMinTop,
        left: childMinLeft,
        marginBottom: computedStyle.marginBottom
    }
}


let aftershockTimeout
export const highlighterHandler = (e, observer, after) => {
    const hightlighters = document.querySelectorAll('[data-highlighter]')
    if (hightlighters && hightlighters.length > 0) {
        hightlighters.forEach(hightlighter => {
            const key = hightlighter.getAttribute('data-highlighter')
            const node = document.querySelector('[_key="' + key + '"]')

            if (node) {
                const pos = getHighlightPosition(node)
                hightlighter.style.top = pos.top + 'px'
                hightlighter.style.left = pos.left + 'px'
                hightlighter.style.width = pos.width + 'px'
                hightlighter.style.height = pos.height + 'px'

                const toolbar = document.querySelector('[data-toolbar="' + key + '"]')
                if (toolbar) {
                    toolbar.style.top = pos.top + 'px'
                    toolbar.style.left = pos.left + 'px'
                    toolbar.style.height = pos.height + 'px'
                }

                const toolbarRichtext = document.querySelector('[data-richtext-toolbar="' + key + '"]')
                if (toolbarRichtext) {
                    const rect = node.getBoundingClientRect()
                    let top = rect.top - 130
                    if(top<0){
                        toolbarRichtext.style.top = (Math.abs(top)-65) + 'px'
                    }
                    /*toolbarRichtext.style.top = pos.top + 'px'
                    toolbarRichtext.style.left = pos.left + 'px'
                    toolbarRichtext.style.height = pos.height + 'px'*/
                }

            }
        })
    }
    if (!after) {
        clearTimeout(aftershockTimeout)
        aftershockTimeout = setTimeout(() => {
            highlighterHandler(e, observer, true)
            for (let i = 0; i < 25; i++) {
                setTimeout(() => {
                    highlighterHandler(e, observer, true)
                }, i * 20)
            }
        }, 50)
    }
}

export const checkIfElementOrParentHasDataKey = (el, attrKeys = [], value) => {
    while (el && el.parentNode && el.parentNode !== window) {
        for (const key of attrKeys) {
            const attrValue = el.getAttribute(key)
            if (value && attrValue === value || !value && attrValue !== null && attrValue !== undefined) {
                return true
            }
        }
        el = el.parentNode
    }
    return false
}