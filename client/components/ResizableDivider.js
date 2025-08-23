import React, { useState } from 'react'
import styled from '@emotion/styled'


const StyledDivider = styled.div`
    position: absolute;
    background-color: #222;
    z-index: 10;
    opacity: 0;
    &:hover {
        opacity: 1;
    }
    cursor: ${(props) =>
    props.direction === "horizontal" ? "ew-resize" : "ns-resize"};
    ${(props) =>
    props.direction === "horizontal"
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

const ResizableDivider = ({ direction = 'horizontal', onResize }) => {
    const [dividerPosition, setDividerPosition] = useState(0)

    const isHorizontal = direction === 'horizontal'

    const handleMouseDown = (e) => {
        e.preventDefault()

        const mouseDividerPos = isHorizontal ?  e.pageX : e.pageY
        const handleMouseMove = (event) => {
            const newDividerPosition = dividerPosition + ( (isHorizontal ? event.pageX : event.pageY) - mouseDividerPos)
            // Ensure the divider stays within bounds
            if(onResize){
                onResize(newDividerPosition)
            }else{
                setDividerPosition(newDividerPosition);

            }
        };

        const handleMouseUp = () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    };

    return <StyledDivider
                direction={direction}
                position={onResize?0:dividerPosition}
                onMouseDown={handleMouseDown}
            />
};

export default ResizableDivider;