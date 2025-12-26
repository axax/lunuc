import ReactDOM from 'react-dom'
import { css } from '@emotion/css'
import {_t} from '../../../util/i18n.mjs'
import {getComponentByKey} from "./jsonDomUtil";
import JsonDomHelper from '../components/JsonDomHelper'
import Util from '../../../client/util/index.mjs'
import {CAPABILITY_ADMIN_OPTIONS} from '../../../util/capabilities.mjs'


export const ALLOW_DROP = ['Cms', 'Print', 'Col', 'Row','div', 'main', 'footer', 'header', 'nav', 'section', 'aside', 'article', 'td', 'table']
export const ALLOW_DROP_IN = {'Col': ['Row'], 'li': ['ul'], 'tr': ['tbody','thead','tfood','table']}
export const ALLOW_DROP_FROM = {'Row': ['Col'],'tr':['td','th'],'table':['tbody','thead','tfood','tr']}

export const JsonDomDraggable = {
    clientX:0,
    clientY: 0
}


const CSS_DROPAREA = css`
    min-height: 10px;
    min-width: 10px;
    position: absolute;
    border: 1px dashed #c1c1c1;
    background-color: rgba(0, 0, 0, 1);
    transition: visibility .5s ease-out, opacity .5s ease-out;
    visibility: hidden;
    opacity: 0;
    z-index: 999;
    display: flex;
    justify-content:center;
    align-items:center;
    font-weight: normal;
    border-radius: 5px;
    padding: 5px;
    max-width: 100%;
    margin: 0 0 0 0;
    color: #fff;
    text-align: center;
    font-size: 0.9rem;
    > span {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis
    }
    > *{
        pointer-events: none;
    }
`
const CSS_DROPAREA_CHILD = css`
    padding: 0;
    font-size: 0.5rem;
    background-color: rgba(0, 0, 0, 0.8);
    border: none;
`
const CSS_DROPAREA_ACTIVE = css`
    visibility: visible;
    opacity: 0.8;
`
const CSS_DROPAREA_OVER = css`
    z-index: 1000;
    visibility: visible;
    background: red;
    &:after {
        borderTopColor: red;
    }
`

const onDrop = (e) => {
    e.stopPropagation()
    e.preventDefault()

    const dropArea = e.currentTarget

    dropArea.classList.remove(CSS_DROPAREA_OVER)

    if (JsonDomDraggable.props) {
        JsonDomHelper.disableEvents = true
        const {props} = JsonDomDraggable

        let sourceKey = props._key,
            targetKey = dropArea.getAttribute('data-key'),
            targetIndex = parseInt(dropArea.getAttribute('data-index')),
            targetReactElement = JsonDomHelper.instances[targetKey]
        if (targetKey) {
            // 1. get element from json structure by key
            const source = getComponentByKey(sourceKey, props._json)
            if (source) {
                targetReactElement.moveElementFromTo(sourceKey, targetKey, targetIndex, props._json, source)
            } else{
                targetReactElement.setState({addChildDialog: {
                        payload: {dropIndex: targetIndex},
                        currentElement: props.element
                    }})
            }

        }
        targetReactElement.enableEvents()
        targetReactElement.resetDragState()
    }
}

const getDistanceToDiv = (mouseX, mouseY, divElement) => {
    // 1. Get the div's bounding box
    const rect = divElement.getBoundingClientRect()

    // Div boundaries
    const L = rect.left
    const T = rect.top
    const R = rect.right
    const B = rect.bottom

    // 2. Find the closest point (Px, Py) on the div to the mouse (Mx, My)

    // Clamp mouse X to the div's X-range
    const closestX = Math.max(L, Math.min(mouseX, R))

    // Clamp mouse Y to the div's Y-range
    const closestY = Math.max(T, Math.min(mouseY, B))

    // 3. Calculate the distance between the mouse and the closest point
    const deltaX = mouseX - closestX
    const deltaY = mouseY - closestY

    // Euclidean distance formula: sqrt(dx^2 + dy^2)
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    return distance
}


function getOrCreateDropArea(tag, {create, isChild, index}) {
    let key = tag.getAttribute('_key')
    if(isChild){
        key = key.slice(0, key.lastIndexOf('.'))
    }
    const id = 'dropArea-' + key + '--' + index
    // Check if the overlay already exists to prevent duplicates
    let dropArea = document.getElementById(id)

    if (!dropArea && create) {
        dropArea = document.createElement('div')
        dropArea.id = id
        dropArea.classList.add(CSS_DROPAREA)
        dropArea.addEventListener('dragenter', (e) => {
            dropArea.classList.add(CSS_DROPAREA_OVER)
        })
        dropArea.addEventListener('dragleave', (e) => {
            dropArea.classList.remove(CSS_DROPAREA_OVER)
        })
        dropArea.addEventListener('dragover', (e) => {
            e.stopPropagation()
            e.preventDefault()
        })
        dropArea.addEventListener('mouseover', (e) => {
            e.stopPropagation()
        })
        dropArea.addEventListener('drop', onDrop)
        dropArea.dataset.key=key
        dropArea.dataset.dropArea = true
        if(!isNaN(index)) {
            dropArea.dataset.index = index
        }
        /*data-index={index}*/
        /*data-drop-area
        data-tag-name={rest._tagName}
        data-fill={fill || ''}*/

        let label = ''
        if(Util.hasCapability(_app_.user, CAPABILITY_ADMIN_OPTIONS)) {
           /* if (dropArea.dataset.key) {
                label += dropArea.dataset.key
            }*/
            if (tag.id) {
                label += '#' + tag.id
            } else if (tag.className) {
                label += tag.className
            }
        }

        if(isChild){
            dropArea.innerHTML = `${label ? '<span>' + label + '</span>' : ''}`
        }else {
            dropArea.innerHTML = `<span>${_t('JsonDomHelper.drop.here')}${label ? ' <small>(' + label + ')</small>' : ''}</span>`
        }
        document.body.appendChild(dropArea)
    }

    return dropArea
}

function isChildOf(child, parent) {
    if (!child || !parent) return false;

    let current = child.parentElement;
    while (current) {
        if (current === parent) return true;
        current = current.parentElement;
    }
    return false;
}

const activeDropAreas = []

function isAlignedHorizontally(rectA, rectB) {
    if(!rectA || !rectB){
        return false
    }


    const centerA = {
        x: rectA.left + rectA.width / 2,
        y: rectA.top + rectA.height / 2
    }

    const centerB = {
        x: rectB.left + rectB.width / 2,
        y: rectB.top + rectB.height / 2
    }

    // Check horizontal alignment first (left/right)
    if (Math.abs(centerA.y - centerB.y) < Math.max(rectA.height, rectB.height) * 0.3) {
        if (centerA.x < centerB.x) {
            return true // 'right'; // A is to the left of B
        } else if (centerA.x > centerB.x) {
            return true // 'left'; // A is to the right of B
        }
    }

    return false
}


export const onJsonDomDrag = (e) => {
    e.stopPropagation()

    const mouseMoveDifference = Math.hypot(e.clientX - JsonDomDraggable.clientX, e.clientY - JsonDomDraggable.clientY)

    if (e.clientY > 0 && mouseMoveDifference > 10) {


        const draggable = ReactDOM.findDOMNode(JsonDomDraggable.element)
        const draggableIndex = Array.from(draggable.parentNode.children).indexOf(draggable)

        JsonDomDraggable.clientX = e.clientX
        JsonDomDraggable.clientY = e.clientY
        clearTimeout(JsonDomDraggable.onDragTimeout)

        const dragableProps = JsonDomDraggable.props

        const allowDropIn = ALLOW_DROP_IN[dragableProps._tagName]

        JsonDomDraggable.onDragTimeout = setTimeout(() => {

            if (!JsonDomDraggable.element) {
                return
            }

            for (let i = activeDropAreas.length - 1; i >= 0; i--) {
                activeDropAreas[i].domEl.classList.remove(CSS_DROPAREA_ACTIVE)
                activeDropAreas.splice(i, 1)
            }

            const targetElements = Array.from(document.querySelectorAll('[_key]:not([_rootkey])[data-allow-drop="true"]')).map(domEl => {
                return {domEl}
            })

            for (let i = 0; i < targetElements.length; i++) {
                const {domEl, isChild, prevSibling, nextSibling, index, isLastChild} = targetElements[i]


                const allowDropFrom = ALLOW_DROP_FROM[domEl.dataset.tagName]
                if (draggable === domEl || isChildOf(domEl, draggable) || !domEl.getAttribute('_key') ||
                    (!isChild && allowDropIn && allowDropIn.indexOf(domEl.dataset.tagName)<0) ||
                    (allowDropFrom && allowDropFrom.indexOf(dragableProps._tagName) < 0)) {
                    continue
                }

                const distance = getDistanceToDiv(JsonDomDraggable.clientX, JsonDomDraggable.clientY, domEl)
                if (distance < 100) {
                    if (domEl.children.length > 0 && !isChild) {

                        for (let i = 0; i < domEl.children.length; i++) {
                            targetElements.push({domEl: domEl.children[i],
                                prevSibling:i>0?domEl.children[i-1]:null,
                                nextSibling:i<domEl.children.length-1?domEl.children[i+1]:null,
                                isChild: true, index:i})
                        }
                        //last element
                        targetElements.push({domEl: domEl.children[domEl.children.length-1],
                            prevSibling:domEl.children.length>1?domEl.children[domEl.children.length-2]:null,
                            isChild: true, index: domEl.children.length, isLastChild:true})

                    } else {


                        const dropArea = getOrCreateDropArea(domEl, {create:true, isChild, index})

                        // getBoundingClientRect returns the size and position relative to the viewport.
                        const rect = domEl.getBoundingClientRect()

                        let newDistance = distance
                        if (isChild) {
                            const dropAreaIndex = parseInt(dropArea.dataset.index)
                            if(draggable.parentNode === domEl.parentNode && dropAreaIndex === draggableIndex+1){
                                continue
                            }
                            dropArea.classList.add(CSS_DROPAREA_CHILD)

                            const prevSiblingRect = prevSibling ? prevSibling.getBoundingClientRect() : null
                            const nextSiblingRect = nextSibling ? nextSibling.getBoundingClientRect() : null


                            if(isAlignedHorizontally(nextSiblingRect, rect) || isAlignedHorizontally(prevSiblingRect, rect)){
                                dropArea.style.top = rect.top + window.scrollY + 'px'

                                if(isLastChild){

                                    dropArea.style.left = (rect.right + window.scrollX - 5) + 'px'
                                }else{

                                    dropArea.style.left = (rect.left + window.scrollX - 5) + 'px'

                                }
                                dropArea.style.height = rect.height + 'px'
                                dropArea.style.width = Math.min(10,50)+'px'
                                dropArea.style.writingMode = 'vertical-lr'
                            }else{
                                dropArea.style.left = rect.left + window.scrollX + 'px'
                                dropArea.style.width = rect.width + 'px'
                                if(!isLastChild && prevSiblingRect && rect.top - prevSiblingRect.bottom>=10){
                                    dropArea.style.top = (rect.top - (rect.top - prevSiblingRect.bottom) + window.scrollY) + 'px'
                                    dropArea.style.height = '10px'
                                    dropArea.style.height = Math.max(10,rect.top - prevSiblingRect.bottom) + 'px'
                                }else {
                                    if(isLastChild){
                                        dropArea.style.top = (rect.bottom + window.scrollY - 5) + 'px'
                                    }else{
                                        dropArea.style.top = (rect.top + window.scrollY - 5) + 'px'
                                    }
                                    dropArea.style.height = '10px'
                                }
                                delete dropArea.style.writingMode
                            }


                        } else {
                            // Apply the calculated dimensions and position
                            dropArea.style.left = rect.left + window.scrollX + 'px'
                            dropArea.style.width = rect.width + 'px'
                            dropArea.style.top = rect.top + window.scrollY + 'px'
                            dropArea.style.height = rect.height + 'px'
                            dropArea.dataset.fill = true
                            dropArea.classList.remove(CSS_DROPAREA_CHILD)
                        }

                        newDistance = getDistanceToDiv(JsonDomDraggable.clientX, JsonDomDraggable.clientY, dropArea)

                        if (newDistance < 100) {
                            activeDropAreas.push({domEl:dropArea, distance:newDistance})
                        }
                    }
                }
            }

            activeDropAreas.sort((a, b) => a.distance - b.distance).slice(0, 10)
            for(let i = 0; i<activeDropAreas.length;i++){
                activeDropAreas[i].domEl.classList.add(CSS_DROPAREA_ACTIVE)
            }

        }, 100) // prevent flickering

    }
}

export const onJsonDomDragEnd = (dragEvent)=>{
    if(dragEvent) {
        dragEvent.stopPropagation()
    }
    const dropAreas = document.querySelectorAll('[data-drop-area="true"]')
    for (let i = 0; i < dropAreas.length; ++i) {
        const dropArea = dropAreas[i]
        dropArea.classList.remove(CSS_DROPAREA_ACTIVE)
    }
    JsonDomDraggable.props = JsonDomDraggable.element = null
}