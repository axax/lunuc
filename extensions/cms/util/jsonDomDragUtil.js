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

export const onJsonDomDrag = (e) => {
    e.stopPropagation()
    if (e.clientY > 0 && Math.abs(e.clientY - JsonDomDraggable.clientY) > 25) {

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
                            const pos = DomUtilAdmin.elemOffset(node)
                            const distanceTop = Math.abs(JsonDomDraggable.clientY - pos.top)
                            const distanceMiddle = Math.abs(JsonDomDraggable.clientY - (pos.top + node.offsetHeight / 2))
                            const distanceBottom = Math.abs(JsonDomDraggable.clientY - (pos.top + node.offsetHeight))


                            if (distanceTop < 100 || distanceMiddle < 100 || distanceBottom < 100) {

                                const nodeForWidth = ['DIV'].indexOf(node.tagName) < 0 ? node.parentNode : node

                                const computedStyle = window.getComputedStyle(nodeForWidth, null)

                                let elementWidth = nodeForWidth.clientWidth
                                elementWidth -= parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight)

                                tag.classList.add(DROPAREA_ACTIVE)
                                tag.style.width = (elementWidth) + 'px'
                                if(tag.dataset.fill) {
                                    let elementHeight = nodeForWidth.clientHeight
                                    elementHeight -= parseFloat(computedStyle.paddingTop) + parseFloat(computedStyle.paddingBottom)
                                    if(elementHeight<20){
                                        elementHeight=32
                                    }
                                    tag.style.height = (elementHeight) + 'px'
                                }
                                allTags.push(tag)

                            } else {
                                if (distanceTop > 200 && distanceMiddle > 200 && distanceBottom > 200) {
                                    tag.classList.remove(DROPAREA_ACTIVE)
                                } else {
                                    allTags.push(tag)
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
                    if (allTags[y] !== allTags[z]) {
                        const rect = allTags[y].getBoundingClientRect()
                        const rect2 = allTags[z].getBoundingClientRect()
                        if (!(rect.right < rect2.left ||
                            rect.left > rect2.right ||
                            rect.bottom < rect2.top ||
                            rect.top > rect2.bottom)) {

                            elementsWithOverlap.push(allTags[z])
                            elementsWithOverlap.push(allTags[y])
                            break
                        }
                    }
                }
            }

            elementsWithOverlap.forEach(el=>{
                el.classList.add(DROPAREA_OVERLAP)
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
        dropArea.classList.remove(DROPAREA_OVERLAP)
        dropArea.classList.remove(DROPAREA_OVER)
        dropArea.classList.remove(DROPAREA_ACTIVE)
    }
    JsonDomDraggable.props = JsonDomDraggable.element = null
}