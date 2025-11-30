import ReactDOM from 'react-dom'
import DomUtilAdmin from '../../../client/util/domAdmin.mjs'

export const DROPAREA_ACTIVE = 'jdh-da-active'
export const DROPAREA_OVERLAP = 'jdh-da-overlap'
export const DROPAREA_OVER = 'jdh-da-over'

export const ALLOW_DROP = ['div', 'main', 'Col', 'Row', 'section', 'Cms', 'Print', 'td', 'table']
export const ALLOW_DROP_IN = {'Col': ['Row'], 'li': ['ul'], 'tr': ['tbody','thead','tfood','table']}
export const ALLOW_DROP_FROM = {'Row': ['Col'],'tr':['td','th'],'table':['tbody','thead','tfood','tr']}

export const JsonDomDraggable = {
    clientX:0,
    clientY: 0
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

export const onJsonDomDrag = (e) => {
    e.stopPropagation()

    const mouseMoveDifference = Math.hypot(e.clientX - JsonDomDraggable.clientX, e.clientY - JsonDomDraggable.clientY )


    if (e.clientY > 0 && mouseMoveDifference > 10) {

        JsonDomDraggable.clientX = e.clientX
        JsonDomDraggable.clientY = e.clientY
        clearTimeout(JsonDomDraggable.onDragTimeout)

        const draggable = ReactDOM.findDOMNode(JsonDomDraggable.element)
        JsonDomDraggable.onDragTimeout = setTimeout(() => {

            if (!JsonDomDraggable.element) {
                return
            }

            const tags = document.querySelectorAll('[data-drop-area="true"]')

            const dragableProps = JsonDomDraggable.props

            const allowDropIn = ALLOW_DROP_IN[dragableProps._tagName]

            const allTags = []
            for (let i = 0; i < tags.length; ++i) {
                const tag = tags[i]
                if (draggable === tag.nextSibling ||
                    draggable === tag.previousSibling ||
                    (dragableProps._options && dragableProps._options.leaveParent === false && draggable.parentNode !== tag.parentNode)) {
                    tag.classList.remove(DROPAREA_ACTIVE)
                    continue
                }

                let node

                if (tag.nextSibling) {
                    node = tag.nextSibling
                } else if (tag.previousSibling) {
                    node = tag.previousSibling
                } else {
                    node = tag.parentNode
                }

                if (node.nodeType !== Node.TEXT_NODE &&
                    JsonDomDraggable.element &&
                    !draggable.contains(node)) {
                    const tagName = tag.getAttribute('data-tag-name')
                    if (!allowDropIn || allowDropIn.indexOf(tagName) >= 0) {


                        const allowDropFrom = ALLOW_DROP_FROM[tagName]
                        if (!allowDropFrom || allowDropFrom.indexOf(dragableProps._tagName) >= 0) {

                            let nodeForWidth = ['DIV'].indexOf(node.tagName) < 0 ? node.parentNode : node
                            let computedStyle = window.getComputedStyle(nodeForWidth, null)
                            let fillHeight = !!tag.dataset.fill

                            if(computedStyle.display==='grid' && nodeForWidth !== node){
                                nodeForWidth = node
                                computedStyle = window.getComputedStyle(nodeForWidth, null)
                                fillHeight = true
                                tag.style.writingMode = 'vertical-rl'
                            }

                            const elementWidth = nodeForWidth.clientWidth - parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight)

                            tag.style.width = (elementWidth) + 'px'
                            if(fillHeight) {
                                let elementHeight = nodeForWidth.dataset.oriHeight || nodeForWidth.clientHeight
                                if(!nodeForWidth.dataset.oriHeight){
                                    elementHeight -= parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom)
                                    nodeForWidth.dataset.oriHeight = elementHeight
                                }
                                if(elementHeight<20){
                                    elementHeight=32
                                }
                                tag.style.height = (elementHeight) + 'px'
                            }

                            const distance = getDistanceToDiv(JsonDomDraggable.clientX, JsonDomDraggable.clientY, tag)

                            if (distance < 100 ) {
                                tag.classList.add(DROPAREA_ACTIVE)

                                allTags.push({tag,distance})
                            } else {
                                if (distance > 200) {
                                    tag.classList.remove(DROPAREA_ACTIVE)
                                } else {
                                    allTags.push({tag,distance})
                                }
                            }
                        }
                    }
                }
            }

            const elementsWithOverlap = []
            // check for overlapping elements
            for (let y = 0; y < allTags.length; y++) {
                for (let z = 0; z < allTags.length; z++) {
                    if (allTags[y].tag !== allTags[z].tag) {
                        const rect = allTags[y].tag.getBoundingClientRect()
                        const rect2 = allTags[z].tag.getBoundingClientRect()
                        if (!(rect.right < rect2.left ||
                            rect.left > rect2.right ||
                            rect.bottom < rect2.top ||
                            rect.top > rect2.bottom)) {

                            /*if(allTags[z].distance<allTags[y].distance){

                                elementsWithOverlap.push(allTags[y])
                            }else{

                                elementsWithOverlap.push(allTags[y])
                            }*/

                            elementsWithOverlap.push(allTags[z])
                            elementsWithOverlap.push(allTags[y])
                            break
                        }
                    }
                }
            }

            elementsWithOverlap.forEach((el,idx)=>{
                el.tag.classList.add(DROPAREA_OVERLAP)
            })


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
        dropArea.classList.remove(DROPAREA_OVER)
        dropArea.classList.remove(DROPAREA_ACTIVE)
        setTimeout(()=>{
            dropArea.classList.remove(DROPAREA_OVERLAP)
        },300)
    }
    JsonDomDraggable.props = JsonDomDraggable.element = null
}