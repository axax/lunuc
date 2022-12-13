import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'


const ShadowWrapper = (props) => {
    const { children, ...rest } = props

    const ref = useRef()
    const [shadowRoot, setShadowRoot] = useState(null)

    useEffect(() => {
        setShadowRoot(ref.current.attachShadow({ mode:'open' }))
    }, [])

    return (
        <div {...rest} ref={ref}>
            {shadowRoot && createPortal(children, shadowRoot)}
        </div>
    )
}

export default ShadowWrapper