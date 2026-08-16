import React, {useCallback, useEffect, useMemo, useRef} from 'react'
import {_t} from '../../../util/i18n.mjs'
import styled from '@emotion/styled'
import {alpha} from '@mui/material/styles'
import ConsoleCapture from './ConsoleCapture'
import ResizableDivider from '../../../client/components/ResizableDivider'
import JsonViewer from './JsonViewer'
import {applyPatch, PatchError, buildPatchFeedback} from '../util/patch-utils.mjs'
import {
    applyTemplateOperation,
    normalizeOperation,
    parseTemplate,
    TemplateOpError
} from '../util/template-ops.mjs'


// Keys that may be changed through a lunuc_component message.
const PATCHABLE_KEYS = ['script', 'serverScript', 'style', 'dataResolver']
const ALLOWED_KEYS = ['template', ...PATCHABLE_KEYS]

const TABS = [
    {name: 'console', label: () => 'Console'},
    {name: 'scope', label: () => 'Scope'},
    {name: 'serverConsole', label: () => 'Server Console'},
    {name: 'aiAssistent', label: () => _t('CodeEditor.aiAssistent')}
]

const MIN_BOX_HEIGHT = 50
const MAX_BOX_HEIGHT_RATIO = 0.8 // matches CSS maxHeight: 80vh

const IFRAME_STYLE = {width: '100%', height: '100%', border: 'none'}


const StyledBox = styled('div')(({theme}) => ({
    position: 'fixed',
    right: 0,
    bottom: 0,
    top: 'auto',
    height: 'auto',
    zIndex: 1100,
    background: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
    borderLeft: `1px solid ${theme.palette.divider}`,
    boxShadow: theme.shadows[6],
    overflow: 'hidden'
}))

const StyledButtonGroup = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.75, 1),
    background: theme.palette.background.default,
    borderBottom: `1px solid ${theme.palette.divider}`
}))

// shouldForwardProp keeps the custom prop out of the DOM. Without it emotion
// forwards `height` as an html attribute.
const StyledInfoBox = styled('div', {
    shouldForwardProp: (prop) => prop !== 'height'
})(({theme, height}) => ({
    width: '100%',
    height: `${height}px`,
    maxHeight: '80vh',
    padding: 0,
    fontFamily: '"SFMono-Regular", "Menlo", "Consolas", monospace',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    // theme-consistent scrollbar
    '&::-webkit-scrollbar': {width: 6, height: 6},
    '&::-webkit-scrollbar-track': {background: 'transparent'},
    '&::-webkit-scrollbar-thumb': {
        background: theme.palette.grey[300],
        borderRadius: 99,
        '&:hover': {background: theme.palette.grey[400]}
    }
}))

// Same reason: `selected` is a valid attribute on <option>, so emotion would
// forward it and React warns about a non boolean value.
const StyledButton = styled('button', {
    shouldForwardProp: (prop) => prop !== 'selected'
})(({theme, selected}) => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '0.01em',
    cursor: 'pointer',
    border: 'none',
    borderRadius: theme.shape.borderRadius - 4,
    padding: theme.spacing(0.6, 1.75),
    transition: 'all 0.15s ease',
    color: selected ? theme.palette.primary.contrastText : theme.palette.text.secondary,
    background: selected
        ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`
        : 'transparent',
    boxShadow: selected ? theme.shadows[2] : 'none',
    '&:hover': {
        color: selected ? theme.palette.primary.contrastText : theme.palette.primary.main,
        background: selected
            ? `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`
            : alpha(theme.palette.primary.main, 0.08)
    }
}))


export default function CmsPageTools(props) {

    const [tab, setTab] = React.useState(props.tab)
    const [boxHeight, setBoxHeight] = React.useState(props.boxHeight || 200)

    // Tabs the user has opened at least once. Their iframes stay mounted so
    // switching tabs does not throw away the assistant conversation.
    const [mountedTabs, setMountedTabs] = React.useState(
        () => (props.tab ? {[props.tab]: true} : {})
    )

    // Forces a re-read of the global scope, which is not reactive on its own.
    const [scopeVersion, setScopeVersion] = React.useState(0)

    // Working copy of the page data. Acts as an accumulator across message
    // events; it does NOT need to trigger re-renders because nothing in the
    // JSX depends on it.
    const dataRef = useRef(props.data || {})
    const propsRef = useRef(props)

    // Keys changed locally that are not yet reflected in props.data.
    const pendingKeysRef = useRef({})

    // Mirrors the last COMMITTED boxHeight so the resize handler can read the
    // current value without being re-created on every render.
    const boxHeightRef = useRef(boxHeight)

    // Height at the moment the drag started. ResizableDivider reports the
    // cumulative distance since mousedown, so every event must be measured
    // against this frozen value - measuring against the current height would
    // apply the growing delta again and again, making the box accelerate.
    const dragStartHeightRef = useRef(null)

    // Keep refs in sync with the committed render, but preserve locally edited
    // parts so an unrelated parent re-render cannot discard in-flight edits.
    useEffect(() => {
        propsRef.current = props
        boxHeightRef.current = boxHeight

        const incoming = props.data || {}
        const merged = {...incoming, template: dataRef.current.template ?? incoming.template}

        for (const key of Object.keys(pendingKeysRef.current)) {
            // Once the parent reports the value we applied, the edit has round
            // tripped and no longer needs to be held locally.
            if (incoming[key] === pendingKeysRef.current[key]) {
                delete pendingKeysRef.current[key]
            } else {
                merged[key] = pendingKeysRef.current[key]
            }
        }
        dataRef.current = merged
    })

    const handleMessage = useCallback((event) => {
        // Only accept messages from our own origin. The assistant runs in a
        // same-origin iframe; nothing else may inject script or serverScript.
        if (event.origin !== window.location.origin) {
            return
        }
        if (!event.data || !event.data.lunuc_component || !event.data.key) {
            return
        }

        const key = event.data.key
        if (ALLOWED_KEYS.indexOf(key) < 0) {
            return
        }

        // Normalize the op / operation aliases up front. Doing this later meant
        // an `op="remove"` message failed the "missing data" check below.
        const operation = normalizeOperation(event.data)

        // Always read the current data / props via refs to avoid stale closures.
        const currentData = dataRef.current
        const currentProps = propsRef.current

        // Sends the result of an applied change back to the source iframe (ai
        // assistant) so it can show success / error feedback to the user.
        const respond = (success, error, extra) => {
            if (event.source && event.source.postMessage) {
                event.source.postMessage({
                    lunuc_component_result: true,
                    key,
                    operation,
                    path: event.data.path,
                    success,
                    error: error || null,
                    ...extra
                }, event.origin)
            }
        }

        try {
            if (key === 'template') {
                let template

                if (event.data.path) {
                    template = parseTemplate(currentData.template)
                    applyTemplateOperation(template, {
                        path: event.data.path,
                        operation: operation || 'update',
                        data: event.data.data,
                        location: event.data.location
                    })
                } else {
                    if (event.data.data === undefined) {
                        respond(false, 'Missing data for template replacement')
                        return
                    }
                    template = event.data.data
                }

                // Update local working copy so the next event starts from here.
                dataRef.current = {...currentData, template: JSON.stringify(template)}
                currentProps.onTemplateChange(template, true)
                respond(true)
                return
            }

            let newValue
            let matchedVia = null
            const isPatch = typeof event.data.old_data === 'string' && event.data.old_data.length > 0

            if (isPatch) {
                const applied = applyPatch(currentData[key], {
                    oldData: event.data.old_data,
                    data: event.data.data == null ? '' : event.data.data
                }, {key})

                newValue = applied.result
                matchedVia = applied.matchedVia

                if (applied.degraded) {
                    console.warn(`[lunuc] patch on "${key}" applied via fallback match: ${matchedVia}`)
                }
            } else {
                newValue = event.data.data == null ? '' : event.data.data
            }

            // Keep the working copy in sync so a follow up patch on the same key
            // sees the result of this one, even before props.data updates.
            dataRef.current = {...currentData, [key]: newValue}
            pendingKeysRef.current[key] = newValue

            currentProps.setCmsPageValue({key, forceUpdateEditor: true}, newValue)
            respond(true, null, matchedVia ? {matchedVia} : undefined)

        } catch (e) {
            if (e instanceof PatchError) {
                respond(false, buildPatchFeedback(e, key), {code: e.code})
                return
            }
            if (e instanceof TemplateOpError) {
                respond(false, e.message)
                return
            }
            console.error('Error applying component change:', e)
            respond(false, e.message)
        }
    }, [])

    useEffect(() => {
        window.addEventListener('message', handleMessage)
        // Cleanup to remove the listener when the component unmounts
        return () => {
            window.removeEventListener('message', handleMessage)
        }
    }, [handleMessage])

    // ResizableDivider offers no end callback, so the drag baseline is reset on
    // mouseup. Without this the next drag would jump back to the height the
    // first drag started from. The divider listens on document, which bubbles
    // before window, so this always runs after the last mousemove.
    useEffect(() => {
        const resetDragBaseline = () => {
            dragStartHeightRef.current = null
        }
        window.addEventListener('mouseup', resetDragBaseline)
        return () => {
            window.removeEventListener('mouseup', resetDragBaseline)
        }
    }, [])

    const toggleTab = (name) => {
        const newTab = tab === name ? false : name

        setTab(newTab)
        if (newTab) {
            setMountedTabs((prev) => (prev[newTab] ? prev : {...prev, [newTab]: true}))
            if (newTab === 'scope') {
                setScopeVersion((v) => v + 1)
            }
        }
        if (props.onTab) {
            props.onTab(newTab)
        }
    }

    // Side effects must stay out of the state updater: React invokes updaters
    // twice in StrictMode, which would fire onBoxHeightChange twice per event.
    const handleResize = useCallback((newPosition) => {
        if (dragStartHeightRef.current === null) {
            dragStartHeightRef.current = boxHeightRef.current
        }

        const maxHeight = window.innerHeight * MAX_BOX_HEIGHT_RATIO
        const next = Math.min(
            Math.max(dragStartHeightRef.current - newPosition, MIN_BOX_HEIGHT),
            maxHeight
        )

        if (next === boxHeightRef.current) {
            return
        }

        setBoxHeight(next)

        if (propsRef.current.onBoxHeightChange) {
            propsRef.current.onBoxHeightChange(next)
        }
    }, [])

    // Memoized so the iframe src stays referentially stable across re-renders
    // and the assistant is not reloaded.
    const aiAssistenUrl = useMemo(
        () => `/system/aiassistent?preview=true&slug=${encodeURIComponent(props.data?.slug || '')}`,
        [props.data?.slug]
    )

    // Iframe tabs own internal state, so once opened they stay mounted and are
    // only hidden. Unmounting them would discard the assistant conversation.
    const renderIframeTab = (name, src, title) => {
        if (!mountedTabs[name]) {
            return null
        }
        return <StyledInfoBox
            height={boxHeight}
            style={{overflow: 'hidden', display: tab === name ? 'block' : 'none'}}>
            <iframe src={src} title={title} style={IFRAME_STYLE}/>
        </StyledInfoBox>
    }

    return <StyledBox style={props.style}>
        {tab && <ResizableDivider direction="vertical" onResize={handleResize}/>}

        <StyledButtonGroup role="tablist">
            {TABS.map(({name, label}) => (
                <StyledButton
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === name}
                    selected={tab === name}
                    onClick={() => toggleTab(name)}>
                    {label()}
                </StyledButton>
            ))}
        </StyledButtonGroup>

        {tab === 'console' &&
            <StyledInfoBox height={boxHeight}><ConsoleCapture/></StyledInfoBox>}

        {tab === 'scope' &&
            <StyledInfoBox height={boxHeight}>
                <JsonViewer key={scopeVersion} json={_app_.JsonDom.scope}/>
            </StyledInfoBox>}

        {renderIframeTab(
            'serverConsole',
            '/system/console?preview=true&embedded=true&cmd=luapi',
            'Server console'
        )}
        {renderIframeTab('aiAssistent', aiAssistenUrl, _t('CodeEditor.aiAssistent'))}
    </StyledBox>
}