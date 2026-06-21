import React, {useRef} from 'react'
import styled from '@emotion/styled'

const StyledDivider = styled.div`
    position: absolute;
    background-color: #222;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.15s ease;
    &:hover {
        opacity: 1;
    }
    cursor: ${(props) =>
            props.direction === 'horizontal' ? 'ew-resize' : 'ns-resize'};
    ${(props) =>
            props.direction === 'horizontal'
                    ? `
        width: 3px;
        top: 0;
        bottom: 0;
        left: ${props.position}px;
      `
                    : `
        height: 3px;
        left: 0;
        right: 0;
        top: ${props.position}px;
      `}
`

const ResizableDivider = ({direction = 'horizontal', onResize}) => {
    const isHorizontal = direction === 'horizontal'
    // useRef avoids stale closures and unnecessary re-renders during drag
    const dividerPositionRef = useRef(0)

    const handleMouseDown = (e) => {
        e.preventDefault()

        const startPos = isHorizontal ? e.pageX : e.pageY
        const startDivider = dividerPositionRef.current

        // Transparent overlay that captures all pointer events so iframes
        // underneath cannot swallow mousemove events during the drag.
        const overlay = document.createElement('div')
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            cursor: ${isHorizontal ? 'ew-resize' : 'ns-resize'};
        `
        document.body.appendChild(overlay)
        document.body.style.userSelect = 'none'

        const handleMouseMove = (event) => {
            const delta = (isHorizontal ? event.pageX : event.pageY) - startPos
            const newDividerPosition = startDivider + delta
            if (onResize) {
                onResize(newDividerPosition)
            } else {
                dividerPositionRef.current = newDividerPosition
            }
        }

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            overlay.remove()
            document.body.style.userSelect = ''
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }

    return (
        <StyledDivider
            direction={direction}
            position={onResize ? 0 : dividerPositionRef.current}
            onMouseDown={handleMouseDown}
        />
    )
}

export default ResizableDivider