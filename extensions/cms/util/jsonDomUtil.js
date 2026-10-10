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


export const copyComponent = (key, json, options = {}) => {

    const source = getComponentByKey(key, json)

    if (source) {
        const parentKey = getParentKey(key)
        let index = parseInt(key.substring(key.lastIndexOf('.') + 1))
        if (isNaN(index)) {
            index = -1
        } else {
            index++
        }
        addComponent({key: parentKey, json, index, component: source, newKeys:!options.keepTrKey})
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

/**
 * Part of a node that is really visible: its rect clipped to the viewport and
 * shrunk by fixed overlays that do not belong to the node (e.g. the app bar and
 * the console bar of the cms editor). Found by probing with elementFromPoint,
 * so it works without knowing the overlays. Used for components larger than the
 * viewport (layout), whose own box lies mostly off screen.
 */
export const getVisibleRect = (node) => {
    const rect = node.getBoundingClientRect()
    let top = Math.max(rect.top, 0),
        left = Math.max(rect.left, 0),
        bottom = Math.min(rect.bottom, window.innerHeight),
        right = Math.min(rect.right, window.innerWidth)

    if (bottom <= top || right <= left) {
        return {top, left, width: 0, height: 0}
    }

    const STEP = 4, MAX = 400
    const inside = (x, y) => {
        const el = document.elementFromPoint(x, y)
        return !!el && (el === node || node.contains(el))
    }
    const midX = (left + right) / 2
    let t = top
    while (t < bottom && t - top < MAX && !inside(midX, t + 1)) t += STEP
    let b = bottom
    while (b > t && bottom - b < MAX && !inside(midX, b - 1)) b -= STEP
    const midY = (t + b) / 2
    let l = left
    while (l < right && l - left < MAX && !inside(l + 1, midY)) l += STEP
    let r = right
    while (r > l && right - r < MAX && !inside(r - 1, midY)) r -= STEP

    return {top: t, left: l, width: Math.max(0, r - l), height: Math.max(0, b - t)}
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
                if (style.position === 'fixed') {
                    // not part of the layout of this node: e.g. the editor chrome of a child
                    // (highlighter, toolbar, viewport frame) which is rendered inside the element
                    // with viewport coordinates and would stretch the box over the whole screen
                    allAbs = false
                    continue
                }
                if (style.display !== 'none' && style.opacity > 0) {
                    const rect = childNode.getBoundingClientRect()
                    const marginLeft = parseFloat(style.marginLeft);
                    const marginRight = parseFloat(style.marginRight);
                    const marginTop = parseFloat(style.marginTop);
                    const marginBottom = parseFloat(style.marginBottom);

                    const rectMargin = {
                        left: rect.left - marginLeft,
                        top: rect.top - marginTop,
                        right: rect.right + marginRight,
                        bottom: rect.bottom + marginBottom,
                        width: rect.width + marginLeft + marginRight,
                        height: rect.height + marginTop + marginBottom
                    };

                    childMinLeft = Math.min(rectMargin.left, childMinLeft)
                    childMaxLeft = Math.max(rectMargin.left + (rectMargin.width ?? 0), childMaxLeft)
                    childMinTop = Math.min(rectMargin.top, childMinTop)
                    childMaxTop = Math.max(rectMargin.top + (rectMargin.height ?? 0), childMaxTop)
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


let rafPending = false

/**
 * Scroll needs a cheap path: rAF throttled and without the aftershock,
 * otherwise every scroll event schedules 26 additional reflows.
 * Registered with capture:true so scrolling containers are covered too.
 */
export const highlighterScrollHandler = (e) => {
    if (rafPending) {
        return
    }
    rafPending = true
    requestAnimationFrame(() => {
        rafPending = false
        highlighterHandler(e, null, true)
    })
}

/**
 * first element matching the selector in the nearest ancestor of `el` that contains one
 */
const findClosestBySelector = (el, selector) => {
    let parent = el.parentElement
    while (parent) {
        const found = parent.querySelector(selector)
        if (found) {
            return found
        }
        parent = parent.parentElement
    }
    return null
}

/*
 * Elements that currently have a highlighter are watched for size changes, so the frame grows and shrinks
 * with them (new line in a contentEditable, image loaded, ...). The MutationObserver of JsonDomHelper only
 * covers [data-layout-content], not e.g. a CmsEditor field in a dialog, and does not see plain text edits.
 */
let resizeObserver = null
const observedNodes = new Set()
const syncResizeObserver = (nodes) => {
    if (typeof ResizeObserver === 'undefined') {
        return
    }
    if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
            highlighterHandler(null, null, true)
        })
    }
    observedNodes.forEach(node => {
        if (!nodes.has(node)) {
            resizeObserver.unobserve(node)
            observedNodes.delete(node)
        }
    })
    nodes.forEach(node => {
        if (!observedNodes.has(node)) {
            resizeObserver.observe(node)
            observedNodes.add(node)
        }
    })
}

export const highlighterHandler = (e, observer, after) => {
    const hightlighters = document.querySelectorAll('[data-highlighter]')

    // nothing to reposition - never schedule the aftershock in that case
    if (hightlighters.length === 0) {
        syncResizeObserver(new Set())
        return
    }
    const highlightedNodes = new Set()

    hightlighters.forEach(hightlighter => {
        const key = hightlighter.getAttribute('data-highlighter')
        // keys are only unique within one JsonDom: a CmsEditor field in a dialog has the same keys
        // as the page behind it. The highlighter is rendered next to its element, so search from there.
        const uid = hightlighter.getAttribute('data-helper-uid')
        let node = null
        try {
            node = hightlighter.__getHighlightTarget ? hightlighter.__getHighlightTarget() : null
        } catch (e) {
            node = null
        }
        if (!node) {
            node = findClosestBySelector(hightlighter, '[_key="' + key + '"]')
        }
        const byUid = (attr) => uid ? document.querySelector('[' + attr + '="' + key + '"][data-helper-uid="' + uid + '"]') :
            findClosestBySelector(hightlighter, '[' + attr + '="' + key + '"]')

        if (node) {
            highlightedNodes.add(node)
            const pos = getHighlightPosition(node)
            hightlighter.style.top = pos.top-1 + 'px'
            hightlighter.style.left = pos.left-1 + 'px'
            hightlighter.style.width = pos.width+2 + 'px'
            hightlighter.style.height = pos.height+2 + 'px'

            const toolbar = byUid('data-toolbar')
            if (toolbar) {
                toolbar.style.top = pos.top + 'px'
                toolbar.style.left = pos.left + 'px'
                toolbar.style.height = pos.height + 'px'
            }

            const toolbarRichtext = byUid('data-richtext-toolbar')
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

    syncResizeObserver(highlightedNodes)

    if (!after) {
        scheduleHighlighterFollowUps()
    }
}

/*
 * Follow-ups replace the former aftershock (26 calls within ~550ms). Layout changes after a click/drop
 * (react re-render, css transitions, images) are caught by one frame-aligned update plus two delayed ones.
 * Continuous size changes are handled by the ResizeObserver anyway.
 */
let frameScheduled = false
const runInFrame = () => {
    if (frameScheduled) {
        return
    }
    frameScheduled = true
    requestAnimationFrame(() => {
        frameScheduled = false
        highlighterHandler(null, null, true)
    })
}
const FOLLOW_UP_DELAYS = [120, 450]
let followUpTimeouts = []
const scheduleHighlighterFollowUps = () => {
    runInFrame()
    followUpTimeouts.forEach(clearTimeout)
    followUpTimeouts = FOLLOW_UP_DELAYS.map(delay => setTimeout(runInFrame, delay))
}

/**
 * Coalesced variant for high frequency sources (MutationObserver): at most one update per frame
 */
export const scheduleHighlighterUpdate = () => {
    if (document.querySelector('[data-highlighter]')) {
        scheduleHighlighterFollowUps()
    }
}

export const checkIfElementOrParentHasDataKey = (el, attrKeys = [], value) => {
    while (el && el.parentNode && el.parentNode !== window) {
        for (const key of attrKeys) {
            const attrValue = el.getAttribute(key)
            if (value && attrValue === value || !value && attrValue !== null && attrValue !== undefined) {
                return el
            }
        }
        el = el.parentNode
    }
    return false
}