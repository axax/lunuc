import ReactDOM from 'react-dom'
import {ZINDEX_VAR, ZINDEX_BASIS_DEFAULT} from './JsonDomStyledElements'
import {getComponentByKey} from '../../util/jsonDomUtil'
import {
    COL_BREAKPOINTS, GRID, parseSpan, effectiveSpans, spanChanges, detectBreakpoint
} from '../../util/columnLayout.mjs'

/**
 * Resize handles between the columns of layout elements (data-element-key layout-1-*) in the edit mode.
 * One handle element for the whole page: a mousemove listener shows it when the pointer is close to the gap
 * between two columns on the same line. Dragging changes the column classes of the breakpoint that is active
 * right now (live in the DOM only), on release the template is changed once.
 */

const ROW_SELECTOR = '[data-element-key^="layout-1-"]'
const HOT_ZONE = 8 // px left and right of the gap
const COL_CLASS = bp => new RegExp(`(^|\\s)col-${bp}-\\d+(?=\\s|$)`, 'g')

let installed = false, Helper = null
let handle = null, label = null
let current = null // {row, a, b} the handle belongs to
let drag = null
let frame = 0, lastEvent = null
const helperByRow = new WeakMap()

const bpLabel = bp => (COL_BREAKPOINTS.find(b => b.short === bp) || {}).long || bp

const createHandle = () => {
    handle = document.createElement('div')
    handle.setAttribute('data-column-resize', '')
    Object.assign(handle.style, {
        position: 'fixed', display: 'none', width: '14px', marginLeft: '-7px',
        cursor: 'col-resize', zIndex: `calc(var(${ZINDEX_VAR}, ${ZINDEX_BASIS_DEFAULT}) + 6)`,
        touchAction: 'none'
    })
    // thin line over the whole height + grip in the middle
    const line = document.createElement('div')
    Object.assign(line.style, {
        position: 'absolute', left: '6px', top: 0, bottom: 0, width: '2px', borderRadius: '1px',
        background: 'rgba(99, 102, 241, 0.9)'
    })
    const grip = document.createElement('div')
    Object.assign(grip.style, {
        position: 'absolute', left: '2px', top: '50%', width: '10px', height: '36px', marginTop: '-18px',
        borderRadius: '5px', background: 'rgb(99, 102, 241)', boxShadow: '0 0 0 2px rgba(255,255,255,0.9)'
    })
    label = document.createElement('div')
    Object.assign(label.style, {
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, 26px)', whiteSpace: 'nowrap',
        padding: '3px 8px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.92)', color: '#fff',
        font: '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontVariantNumeric: 'tabular-nums', pointerEvents: 'none', display: 'none'
    })
    handle.append(line, grip, label)
    handle.addEventListener('mousedown', startDrag)
    document.body.appendChild(handle)
}

const hide = () => {
    if (handle && !drag) {
        handle.style.display = 'none'
        current = null
    }
}

/** editor helper of the row (only if its template can be changed here) */
const helperOfRow = (row) => {
    let helper = helperByRow.get(row)
    if (helper && Helper.instances[helper.props._key] !== helper) {
        helper = null
    }
    if (!helper) {
        helper = Object.values(Helper.instances).find(inst => {
            try {
                return ReactDOM.findDOMNode(inst) === row
            } catch (e) {
                return false
            }
        })
        if (!helper) return null
        helperByRow.set(row, helper)
    }
    const {_options, _dynamic, _forceInlineEditor} = helper.props
    if ((_options && _options.mode === 'source') || (_dynamic && !_forceInlineEditor)) return null
    return helper
}

const columnsOf = row => Array.prototype.filter.call(row.children, el => el.classList.contains('col'))

/** gap between two columns of a layout under the pointer (innermost layout first) */
const findGap = (target, x, y) => {
    let row = target.closest && target.closest(ROW_SELECTOR)
    while (row) {
        const cols = columnsOf(row)
        for (let i = 0; i < cols.length - 1; i++) {
            const ra = cols[i].getBoundingClientRect(), rb = cols[i + 1].getBoundingClientRect()
            // next column wrapped to a new line
            if (Math.abs(ra.top - rb.top) > 2 || rb.left < ra.right - 1) continue
            const top = Math.min(ra.top, rb.top), bottom = Math.max(ra.bottom, rb.bottom)
            if (y >= top && y <= bottom && x >= ra.right - HOT_ZONE && x <= rb.left + HOT_ZONE) {
                return {row, a: i, b: i + 1, cols, x: (ra.right + rb.left) / 2, top, height: bottom - top}
            }
        }
        row = row.parentElement && row.parentElement.closest(ROW_SELECTOR)
    }
    return null
}

const update = () => {
    frame = 0
    const e = lastEvent
    if (!e || drag) return
    if (Helper.disableEvents || Helper.altKeyDown || e.buttons) {
        hide()
        return
    }
    if (e.target === handle || handle.contains(e.target)) return
    const gap = findGap(e.target, e.clientX, e.clientY)
    if (!gap || !helperOfRow(gap.row)) {
        hide()
        return
    }
    current = gap
    Object.assign(handle.style, {
        display: 'block', left: gap.x + 'px', top: gap.top + 'px', height: gap.height + 'px'
    })
}

const onMouseMove = (e) => {
    if (drag) return
    lastEvent = e
    if (!frame) frame = requestAnimationFrame(update)
}

const setColClass = (el, bp, span) => {
    el.className = el.className.replace(COL_CLASS(bp), ' ').replace(/\s+/g, ' ').trim() + ` col-${bp}-${span}`
}

const showLabel = (bp, sa, sb) => {
    label.textContent = `${bpLabel(bp)} · ${sa}/${GRID} | ${sb}/${GRID}`
    label.style.display = 'block'
}

function startDrag(e) {
    if (e.button !== 0 || !current) return
    e.preventDefault()
    e.stopPropagation()
    const {row, a, b, cols} = current
    const helper = helperOfRow(row)
    if (!helper) return
    const {_key, _json} = helper.props
    const subJson = getComponentByKey(_key, _json)
    if (!subJson || !Array.isArray(subJson.c) || subJson.c.length !== cols.length) return

    const spans = {}
    COL_BREAKPOINTS.forEach(({short}) => {
        spans[short] = subJson.c.map(c => parseSpan(c && c.p && c.p[`className@${short}`]))
    })
    const bp = detectBreakpoint(row.ownerDocument.defaultView)
    const start = effectiveSpans(spans)[bp]
    const wa = cols[a].getBoundingClientRect().width, wb = cols[b].getBoundingClientRect().width
    drag = {
        helper, subJson, spans, bp, start, a, b, cols,
        x: e.clientX,
        unit: (wa + wb) / (start[a] + start[b]),
        classNames: [cols[a].className, cols[b].className],
        delta: 0
    }
    Helper.disableEvents = true
    document.body.style.cursor = 'col-resize'
    showLabel(bp, start[a], start[b])
    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', endDrag)
}

const onDrag = (e) => {
    e.preventDefault()
    const d = drag, sa = d.start[d.a], sb = d.start[d.b]
    const delta = Math.max(1 - sa, Math.min(sb - 1, Math.round((e.clientX - d.x) / d.unit)))
    if (delta === d.delta) return
    d.delta = delta
    setColClass(d.cols[d.a], d.bp, sa + delta)
    setColClass(d.cols[d.b], d.bp, sb - delta)
    showLabel(d.bp, sa + delta, sb - delta)
    // the gap moved
    const ra = d.cols[d.a].getBoundingClientRect(), rb = d.cols[d.b].getBoundingClientRect()
    handle.style.left = (ra.right + rb.left) / 2 + 'px'
}

const endDrag = () => {
    const d = drag
    drag = null
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', endDrag)
    document.body.style.cursor = ''
    Helper.disableEvents = false
    label.style.display = 'none'
    handle.style.display = 'none'
    current = null
    if (!d) return
    // react sets the class names again from the template
    d.cols[d.a].className = d.classNames[0]
    d.cols[d.b].className = d.classNames[1]
    if (!d.delta) return

    const newSpans = d.start.slice()
    newSpans[d.a] += d.delta
    newSpans[d.b] -= d.delta
    spanChanges(d.spans, d.bp, newSpans).forEach(({bp, index, value}) => {
        const col = d.subJson.c[index]
        if (!col.p) col.p = {}
        col.p[`className@${bp}`] = value
    })
    const {_onTemplateChange, _json} = d.helper.props
    _onTemplateChange(_json, true)
}

/** called by every JsonDomHelper on mount, installs the listener once */
export const installColumnResize = (JsonDomHelper) => {
    if (installed || typeof document === 'undefined') return
    installed = true
    Helper = JsonDomHelper
    createHandle()
    document.addEventListener('mousemove', onMouseMove, {passive: true})
    document.addEventListener('scroll', hide, {capture: true, passive: true})
}
