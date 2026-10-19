import React, {useEffect, useState} from 'react'
import {createPortal} from 'react-dom'

/*
 * Marks the elements other users are editing right now (caret in the element): a colored frame with the
 * user's name, like in Google Docs. The element is found by its _key attribute (the template path, the same
 * for every editor of the page). Positions are re-measured a few times per second while markers exist.
 */

const colorForName = (name) => {
    let hash = 0
    for (let i = 0; i < (name || '').length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) % 360
    }
    return `hsl(${hash}, 70%, 45%)`
}

const findElement = (elementKey) => {
    if (!elementKey) {
        return null
    }
    try {
        return document.querySelector(`[_key="${CSS.escape(elementKey)}"]`)
    } catch (e) {
        return null
    }
}

const measure = (editors) => editors
    .filter(editor => editor.elementKey)
    .map(editor => {
        const el = findElement(editor.elementKey)
        if (!el) {
            return null
        }
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) {
            return null
        }
        return {
            clientId: editor.clientId,
            username: editor.username,
            typing: editor.typing,
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height
        }
    })
    .filter(Boolean)

export default function RemoteEditorMarkers({editors, typingLabel}) {
    const [markers, setMarkers] = useState([])

    useEffect(() => {
        const active = (editors || []).filter(editor => editor.elementKey)
        if (active.length === 0) {
            setMarkers([])
            return
        }
        const update = () => setMarkers(measure(active))
        update()
        // scrolling, resizing and re-rendering move the elements
        const timer = setInterval(update, 250)
        window.addEventListener('scroll', update, {capture: true, passive: true})
        window.addEventListener('resize', update, {passive: true})
        return () => {
            clearInterval(timer)
            window.removeEventListener('scroll', update, {capture: true})
            window.removeEventListener('resize', update)
        }
    }, [editors])

    if (markers.length === 0 || typeof document === 'undefined') {
        return null
    }

    return createPortal(markers.map(marker => {
        const color = colorForName(marker.username)
        return <div key={marker.clientId}
                    aria-hidden="true"
                    style={{
                        position: 'fixed',
                        top: marker.top - 2,
                        left: marker.left - 2,
                        width: marker.width + 4,
                        height: marker.height + 4,
                        border: `2px solid ${color}`,
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        zIndex: 99998,
                        boxSizing: 'border-box'
                    }}>
            <span style={{
                position: 'absolute',
                top: '-1.35rem',
                right: '-2px',
                background: color,
                color: '#fff',
                fontSize: '0.7rem',
                lineHeight: '1.35rem',
                padding: '0 0.4rem',
                borderRadius: '4px 4px 0 0',
                whiteSpace: 'nowrap',
                fontFamily: 'system-ui, sans-serif'
            }}>{marker.username}{marker.typing ? ' · ' + typingLabel : ''}</span>
        </div>
    }), document.body)
}
