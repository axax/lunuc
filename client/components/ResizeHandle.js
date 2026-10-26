import styled from '@emotion/styled'

/**
 * Drag handle on the right edge of a resizable panel (e.g. the drawer of the cms editor, the element palette
 * in GenericForm): invisible, a thin bar in the primary color while hovered or dragged.
 * The parent must be positioned (relative / absolute). Mark the drag with the prop `active` or the class `dragging`.
 * Position and stacking can be adjusted with styled(ResizeHandle)(...) or the style prop.
 * Hint text for title / tooltip: _t('CmsElement.resizeHint')
 */
const ResizeHandle = styled('div', {
    shouldForwardProp: prop => prop !== 'active'
})(({theme, active}) => ({
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 6,
    zIndex: 3,
    cursor: 'ew-resize',
    borderRadius: 3,
    backgroundColor: active ? theme.palette.primary.main : 'transparent',
    transition: 'background-color .15s ease',
    '&:hover, &.dragging': {
        backgroundColor: theme.palette.primary.main
    }
}))

export default ResizeHandle
