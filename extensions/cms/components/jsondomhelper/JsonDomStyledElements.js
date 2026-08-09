import styled from '@emotion/styled'
import {keyframes} from '@emotion/react'
import {SimpleMenu} from '../../../../client/components/ui/impl/material'

/**
 * Base z-index for all editor overlay elements.
 *
 * The overlay must sit on top of everything while the cms editor is active,
 * but must not cover regular site layers (modals, sticky headers, ...) when
 * a page is rendered without cmsData. Since most styles below are static
 * objects that are evaluated once at module load, the basis is exposed as a
 * css custom property - changing it does not require a re-render.
 *
 * Every component adds a fixed offset to keep the stacking order stable.
 */
export const ZINDEX_VAR = '--lunuc-editor-z'
export const ZINDEX_BASIS_DEFAULT = 998
export const ZINDEX_BASIS_CMS = 10000

let currentBasis = ZINDEX_BASIS_DEFAULT

/**
 * The overlay is portaled to document.body, so it can not inherit the
 * variable from the dialog it belongs to - it has to live on the root element.
 * Call with true while an editor with cmsData is mounted.
 */
export const setEditorZIndexActive = (active) => {
    currentBasis = active ? ZINDEX_BASIS_CMS : ZINDEX_BASIS_DEFAULT
    if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty(ZINDEX_VAR, String(currentBasis))
    }
}

// For places that need a plain number instead of a css value
export const getZIndexBasis = () => currentBasis

// css value for a layer above the basis
const z = (offset = 0) => `calc(var(${ZINDEX_VAR}, ${ZINDEX_BASIS_DEFAULT}) + ${offset})`

/**
 * Design tokens for the inline editor chrome.
 * Keep every color / radius / shadow in here so the whole overlay
 * can be re-themed from a single place.
 */
const T = {
    // semantic highlight colors
    element: '245, 158, 11',   // amber  - plain template element
    dynamic: '244, 63, 94',    // rose   - dynamic (non editable) element
    cms: '99, 102, 241',       // indigo - cms component / picker
    selected: '139, 61, 255',  // violet - multi selection

    // chrome
    accent: '#F59E0B',
    accentDark: '#D97706',
    surface: 'rgba(15, 23, 42, 0.92)',
    surfaceText: 'rgba(255, 255, 255, 0.95)',

    radius: '6px',
    radiusSm: '4px',
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    fontUi: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

// Only opacity / filter are animated. Position and size are written directly
// to the DOM by highlighterHandler at high frequency - animating them would lag.
const fadeIn = keyframes({
    from: {opacity: 0},
    to: {opacity: 1}
})

const HIGHLIGHT_COLORS = {
    yellow: T.element,
    red: T.dynamic,
    blue: T.cms
}

// Custom props must not end up as DOM attributes
const noForward = (...props) => ({
    shouldForwardProp: (prop) => props.indexOf(prop) === -1
})

export const StyledHighlighter = styled('span', noForward('color', 'selected'))(({color, selected}) => {
    const rgb = HIGHLIGHT_COLORS[color] || T.element
    return {
        zIndex: z(1),
        position: 'fixed',
        boxSizing: 'border-box',
        minWidth: '10px',
        minHeight: '10px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        pointerEvents: 'none',
        // left edge stays square so it lines up with the drag bar
        borderTopRightRadius: T.radius,
        borderBottomRightRadius: T.radius,
        border: `1px solid rgba(${rgb}, 0.9)`,
        background: `rgba(${rgb}, 0.06)`,
        boxShadow: `0 0 0 3px rgba(${rgb}, 0.14), 0 8px 24px -8px rgba(15, 23, 42, 0.45)`,
        animation: `${fadeIn} 90ms ${T.ease}`,
        transition: `box-shadow 120ms ${T.ease}, border-color 120ms ${T.ease}, background-color 120ms ${T.ease}`,
        ...(color === 'blue' && {
            color: '#0F172A',
            fontFamily: T.fontUi,
            fontWeight: 600,
            fontSize: '0.8rem',
            letterSpacing: '0.01em'
        }),
        ...(selected && {
            borderColor: `rgba(${T.selected}, 1)`,
            background: `rgba(${T.selected}, 0.08)`,
            boxShadow: `0 0 0 3px rgba(${T.selected}, 0.25), 0 8px 24px -8px rgba(15, 23, 42, 0.45)`
        })
    }
})

export const StyledPicker = styled('div')({
    cursor: 'pointer',
    pointerEvents: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    maxWidth: 'calc(100% - 1rem)',
    padding: '0.2rem 0.55rem',
    borderRadius: '999px',
    fontFamily: T.fontUi,
    fontSize: '0.72rem',
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: T.surfaceText,
    background: T.surface,
    backdropFilter: 'blur(8px)',
    boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.5)',
    transition: `transform 120ms ${T.ease}, background-color 120ms ${T.ease}`,
    '&:hover': {
        background: 'rgba(30, 41, 59, 0.96)',
        transform: 'translateY(-1px)'
    },
    '.MuiSvgIcon-root': {
        fontSize: '1rem'
    }
})

export const StyledToolbarButton = styled('div')({
    zIndex: z(0),
    position: 'fixed',
    fontFamily: T.fontUi,
    // the wrapper itself must never swallow mouse events, only its children
    pointerEvents: 'none',
    '> *': {
        pointerEvents: 'auto'
    }
})

export const StyledToolbarMenu = styled(SimpleMenu)({
    position: 'absolute',
    left: '-2.45rem',
    top: 'calc(min(50% - 1.25rem, 100px))',
    '.MuiSvgIcon-root': {
        fill: T.accent
    },
    '.MuiPaper-root': {
        borderRadius: '10px',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        boxShadow: '0 12px 32px -8px rgba(15, 23, 42, 0.35), 0 2px 6px -2px rgba(15, 23, 42, 0.2)'
    },
    '.MuiMenuItem-root': {
        fontFamily: T.fontUi,
        fontSize: '0.82rem',
        borderRadius: T.radiusSm,
        margin: '1px 6px',
        minHeight: '32px'
    }
})

export const StyledDragBar = styled('div')({
    position: 'absolute',
    top: 0,
    left: '-8px',
    width: '8px',
    height: '100%',
    zIndex: z(2),
    cursor: 'move',
    borderRadius: `${T.radius} 0 0 ${T.radius}`,
    background: T.accent,
    boxShadow: 'inset 1px 0 0 rgba(255, 255, 255, 0.2)',
    // grip dots
    '&::after': {
        content: '""',
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '2px',
        height: '16px',
        maxHeight: '50%',
        backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.9) 1px, transparent 1px)',
        backgroundSize: '2px 5px',
        opacity: 0.75
    }
})

/**
 * Compact quick action bar, anchored to the top right corner of the element.
 * Flips inside the element when there is no room above it.
 */
export const StyledActionBar = styled('div', noForward('flipped'))(({flipped}) => ({
    position: 'absolute',
    right: 0,
    top: flipped ? '2px' : '-1.75rem',
    zIndex: z(3),
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1px',
    height: '1.5rem',
    padding: '2px',
    borderRadius: T.radiusSm,
    background: T.surface,
    backdropFilter: 'blur(6px)',
    boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.45)',
    animation: `${fadeIn} 90ms ${T.ease}`,
    // Invisible bridge that closes the gap between element and bar.
    // Without it the pointer crosses dead space on its way up and the
    // hover state of the element expires before the bar is reached.
    '&::before': {
        content: '""',
        position: 'absolute',
        zIndex: -1,
        left: '-6px',
        right: '-6px',
        top: flipped ? '-6px' : '-8px',
        bottom: flipped ? '-6px' : '-0.4rem'
    },
    button: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1.25rem',
        height: '1.25rem',
        padding: 0,
        margin: 0,
        border: 0,
        borderRadius: '3px',
        background: 'transparent',
        color: T.surfaceText,
        cursor: 'pointer',
        transition: `background-color 120ms ${T.ease}, color 120ms ${T.ease}`,
        '.MuiSvgIcon-root': {
            fontSize: '0.85rem',
            fill: 'currentColor'
        },
        '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.14)'
        },
        '&:focus-visible': {
            outline: `2px solid ${T.accent}`,
            outlineOffset: '1px'
        },
        // destructive action is separated and gets its own hover color
        '&[data-action="remove"]': {
            marginLeft: '5px',
            '&::before': {
                content: '""',
                position: 'absolute',
                left: '-3px',
                top: '3px',
                bottom: '3px',
                width: '1px',
                background: 'rgba(255, 255, 255, 0.18)'
            },
            '&:hover': {
                backgroundColor: `rgba(${T.dynamic}, 0.9)`,
                color: '#FFFFFF'
            }
        }
    }
}))

/**
 * Rich text toolbar.
 *
 * Rendered as its own fixed-position element (a sibling of the highlighter
 * in the AddToBody portal, not nested inside it). top/left are written
 * directly in viewport pixel coordinates by JsonDomHelper - either the
 * caret position (while floating) or the element's own top/left as a
 * fallback before the very first caret measurement completes. Positioning
 * independently like this (instead of relative to the highlighter's own
 * top/left) matters once the target element is partially scrolled out of
 * the viewport, since the highlighter's coordinates may be adjusted/clamped
 * for its own display purposes while the caret rect from
 * getBoundingClientRect() never is - mixing the two produced an offset bar.
 */
export const StyledRichTextBar = styled('div', noForward('floating'))(({floating}) => ({
    pointerEvents: 'auto',
    zIndex: z(5),
    position: 'fixed',
    top: 0,
    left: 0,
    height: '3rem',
    width: 'auto',
    // Drawn above the caret line. JsonDomHelper clamps the coordinates so
    // there is always room for it inside the viewport.
    transform: 'translateY(-100%)',
    // No transition on top/left: while scrolling the position is rewritten
    // every frame, and an eased transition would make the bar visibly lag
    // behind the caret instead of sticking to it.
    animation: `${fadeIn} 120ms ${T.ease}`,
    '> div': {
        backgroundColor: 'transparent'
    },
    '> div > div': {
        borderRadius: '10px',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 12px 28px -10px rgba(15, 23, 42, 0.4), 0 2px 6px -2px rgba(15, 23, 42, 0.18)'
    }
}))

export const StyledInfoBox = styled('div')({
    position: 'absolute',
    pointerEvents: 'none',
    top: '-1.35rem',
    left: '-1px',
    zIndex: z(3),
    display: 'inline-flex',
    alignItems: 'center',
    height: '1.1rem',
    padding: '0 6px',
    borderRadius: `${T.radiusSm} ${T.radiusSm} ${T.radiusSm} 0`,
    fontFamily: T.fontUi,
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    color: T.surfaceText,
    background: T.surface,
    backdropFilter: 'blur(6px)',
    boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.45)',
    animation: `${fadeIn} 90ms ${T.ease}`
})

// Devtools style spacing indicator: hatched area + numeric badge
const dividerBase = {
    position: 'absolute',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto',
    zIndex: z(4),
    overflow: 'hidden',
    fontFamily: T.fontUi,
    fontSize: '10px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
    color: 'rgba(30, 41, 59, 0.85)',
    textShadow: '0 1px 0 rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(99, 102, 241, 0.07)',
    backgroundImage: 'repeating-linear-gradient(45deg, rgba(99, 102, 241, 0.16) 0 4px, transparent 4px 8px)',
    transition: `background-color 120ms ${T.ease}`,
    '&:hover': {
        backgroundColor: 'rgba(99, 102, 241, 0.16)'
    }
}

export const StyledHorizontalDivider = styled('div')({
    ...dividerBase,
    height: '4px',
    width: '100%',
    left: 0,
    right: 0,
    top: '100%',
    borderRadius: `0 0 ${T.radiusSm} ${T.radiusSm}`,
    cursor: 'ns-resize'
})

export const StyledVerticalDivider = styled('div')({
    ...dividerBase,
    width: '4px',
    height: '100%',
    top: 0,
    bottom: 0,
    left: '100%',
    borderRadius: `0 ${T.radiusSm} ${T.radiusSm} 0`,
    cursor: 'ew-resize',
    writingMode: 'vertical-rl'
})