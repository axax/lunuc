import React from 'react'

const MIN_SIZE = 0.02
const HANDLES = [
    {key: 'nw', x: 0, y: 0, cursor: 'nwse-resize'},
    {key: 'ne', x: 1, y: 0, cursor: 'nesw-resize'},
    {key: 'sw', x: 0, y: 1, cursor: 'nesw-resize'},
    {key: 'se', x: 1, y: 1, cursor: 'nwse-resize'}
]

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

/** "left,top,width,height" (fractions 0..1 of the original image) -> rect */
export const parseCrop = (value) => {
    if (!value || !value.split) return null
    const [l, t, w, h] = value.split(',').map(parseFloat)
    if ([l, t, w, h].some(n => isNaN(n)) || w <= 0 || h <= 0) return null
    return {l, t, w, h}
}

export const stringifyCrop = (r) => r ? [r.l, r.t, r.w, r.h].map(n => +n.toFixed(4)).join(',') : ''

/**
 * Lets the user select a section of an image.
 * value / onChange use the string "left,top,width,height" with fractions of the
 * original image (0..1). The server cuts this section out before resizing.
 * aspect (optional): width/height ratio the selection is locked to.
 */
const ImageCropper = ({src, value, aspect, onChange, label, resetLabel}) => {
    const boxRef = React.useRef()
    const dragRef = React.useRef(null)
    const [rect, setRect] = React.useState(() => parseCrop(value))
    const [natural, setNatural] = React.useState(null)

    // follow external changes (undo, other language, ...), but not our own during drag
    React.useEffect(() => {
        if (!dragRef.current) {
            setRect(parseCrop(value))
        }
    }, [value])

    const point = (e) => {
        const b = boxRef.current.getBoundingClientRect()
        return {
            x: clamp((e.clientX - b.left) / b.width, 0, 1),
            y: clamp((e.clientY - b.top) / b.height, 0, 1),
            cw: b.width, ch: b.height
        }
    }

    // rectangle between a fixed anchor and the pointer, optionally locked to an aspect ratio
    const fromAnchor = (a, p) => {
        const sx = p.x >= a.x ? 1 : -1, sy = p.y >= a.y ? 1 : -1
        const maxW = sx > 0 ? 1 - a.x : a.x, maxH = sy > 0 ? 1 - a.y : a.y
        let w = Math.abs(p.x - a.x), h = Math.abs(p.y - a.y)
        if (aspect) {
            const toW = hh => hh * p.ch * aspect / p.cw, toH = ww => ww * p.cw / aspect / p.ch
            w = Math.max(w, toW(h))
            h = toH(w)
            if (w > maxW) {
                w = maxW
                h = toH(w)
            }
            if (h > maxH) {
                h = maxH
                w = toW(h)
            }
        }
        return {l: sx > 0 ? a.x : a.x - w, t: sy > 0 ? a.y : a.y - h, w, h}
    }

    const start = (e, mode, extra) => {
        e.preventDefault()
        e.stopPropagation()
        boxRef.current.setPointerCapture(e.pointerId)
        const p = point(e)
        dragRef.current = {mode, start: p, startRect: rect, last: rect, ...extra}
    }

    const onMove = (e) => {
        const d = dragRef.current
        if (!d) return
        const p = point(e)
        let r
        if (d.mode === 'move') {
            const s = d.startRect
            r = {
                ...s,
                l: clamp(s.l + p.x - d.start.x, 0, 1 - s.w),
                t: clamp(s.t + p.y - d.start.y, 0, 1 - s.h)
            }
        } else {
            r = fromAnchor(d.anchor || d.start, p)
        }
        d.last = r
        setRect(r)
    }

    const onUp = () => {
        const d = dragRef.current
        dragRef.current = null
        if (!d) return
        const r = d.last
        if (!r || r.w < MIN_SIZE || r.h < MIN_SIZE) {
            // just a click, keep the previous selection
            setRect(d.startRect)
            return
        }
        if (r !== d.startRect) {
            onChange(stringifyCrop(r))
        }
    }

    const reset = () => {
        setRect(null)
        onChange('')
    }

    if (!src) {
        return <div style={{opacity: 0.6, fontSize: '0.85rem', padding: '0.5rem 0'}}>{label}: –</div>
    }

    const pct = n => (n * 100) + '%'
    const info = rect && natural ?
        `${Math.round(rect.w * natural.w)} × ${Math.round(rect.h * natural.h)} px` : ''

    return <div style={{marginBottom: '1rem'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6}}>
            <span>{label}{info ? <small style={{opacity: 0.6, marginLeft: 8}}>{info}</small> : null}</span>
            {rect ? <a href="#" onClick={e => {
                e.preventDefault()
                reset()
            }}>{resetLabel}</a> : null}
        </div>
        <div ref={boxRef}
             onPointerDown={e => start(e, 'new', {})}
             onPointerMove={onMove}
             onPointerUp={onUp}
             onPointerCancel={onUp}
             style={{
                 position: 'relative',
                 display: 'inline-block',
                 maxWidth: '100%',
                 lineHeight: 0,
                 cursor: 'crosshair',
                 userSelect: 'none',
                 touchAction: 'none',
                 background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 16px 16px'
             }}>
            <img src={src}
                 draggable={false}
                 onLoad={e => setNatural({w: e.target.naturalWidth, h: e.target.naturalHeight})}
                 style={{display: 'block', maxWidth: '100%', maxHeight: 320, pointerEvents: 'none'}}/>
            {rect ? <>
                {/* darken everything outside of the selection, only inside of the image */}
                {[
                    {left: 0, top: 0, width: '100%', height: pct(rect.t)},
                    {left: 0, top: pct(rect.t + rect.h), width: '100%', height: pct(1 - rect.t - rect.h)},
                    {left: 0, top: pct(rect.t), width: pct(rect.l), height: pct(rect.h)},
                    {left: pct(rect.l + rect.w), top: pct(rect.t), width: pct(1 - rect.l - rect.w), height: pct(rect.h)}
                ].map((s, i) => <div key={i} style={{position: 'absolute', background: 'rgba(0,0,0,0.5)', ...s}}/>)}
                <div style={{
                    position: 'absolute', left: pct(rect.l), top: pct(rect.t),
                    width: pct(rect.w), height: pct(rect.h),
                    boxSizing: 'border-box',
                    border: '2px solid #fff',
                    cursor: 'move'
                }} onPointerDown={e => start(e, 'move', {})}>
                    {HANDLES.map(h => <div key={h.key}
                                           onPointerDown={e => start(e, 'resize', {
                                               // opposite corner stays fixed
                                               anchor: {
                                                   x: rect.l + (h.x ? 0 : rect.w),
                                                   y: rect.t + (h.y ? 0 : rect.h)
                                               }
                                           })}
                                           style={{
                                               position: 'absolute',
                                               left: pct(h.x), top: pct(h.y),
                                               width: 14, height: 14,
                                               marginLeft: -7, marginTop: -7,
                                               background: '#fff',
                                               border: '2px solid #5c6bc0',
                                               borderRadius: 2,
                                               cursor: h.cursor
                                           }}/>)}
                </div>
            </> : null}
        </div>
    </div>
}

export default ImageCropper
