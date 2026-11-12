import React from 'react'
import {useTheme} from '@mui/material/styles'
import {_t} from '../../util/i18n.mjs'
import {
    GRID, parseSpan, effectiveSpans, hasOwnSpans, sameSpans, spanChanges, detectBreakpoint
} from '../../extensions/cms/util/columnLayout.mjs'

const BP_ICONS = {
    xs: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm4 16v.01',
    sm: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5 14h2',
    md: 'M5 5h14a1 1 0 0 1 1 1v9H4V6a1 1 0 0 1 1-1zM2 18h20',
    lg: 'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 20h8M12 16v4'
}

/** columns that end up on the same line (the grid wraps when a line is full) */
const rowIndexes = (spans) => {
    let row = 0, sum = 0
    return spans.map(s => {
        if (sum > 0 && sum + s > GRID) {
            row++
            sum = 0
        }
        sum += s
        return row
    })
}

const presetsForCount = (count) => {
    const list = []
    if (count === 2) {
        list.push([6, 6], [4, 8], [8, 4], [3, 9], [9, 3])
    } else if (count === 3) {
        list.push([4, 4, 4], [3, 6, 3], [6, 3, 3], [3, 3, 6], [2, 8, 2])
    }
    // equal widths, wrapping into full lines
    ;[1, 2, 3, 4, 6].forEach(s => {
        const perRow = GRID / s
        if (perRow <= count && count % perRow === 0) {
            const p = Array(count).fill(s)
            if (!list.some(l => l.join() === p.join())) list.push(p)
        }
    })
    list.push(Array(count).fill(GRID))
    return list
}

const presetLabel = (p) => {
    if (p.every(s => s === GRID)) return _t('elements.columnLayout.stacked')
    const sum = p.reduce((a, b) => a + b, 0)
    if (sum > GRID && p.every(s => s === p[0])) {
        return _t('elements.columnLayout.perRow', {n: GRID / p[0]})
    }
    return p.join(' · ')
}

/**
 * Visual editor for the column widths of a layout element (12 column grid).
 * values: {xs: [' col-xs-12 ', ...], sm: [...], ...} raw class values per breakpoint and column
 * keys: {xs: ['c_0_p_className@xs', ...], ...} form field per breakpoint and column
 * onChange({[key]: value, ...}) writes several form fields at once
 */
const ColumnLayoutEditor = ({values, keys, breakpoints, label, onChange}) => {
    const theme = useTheme()
    const gridRef = React.useRef()
    const dragRef = React.useRef(null)
    const [current, setCurrent] = React.useState(() => {
        const bp = detectBreakpoint()
        return breakpoints.some(b => b.short === bp) ? bp : breakpoints[0].short
    })
    const [draft, setDraft] = React.useState(null)

    const spans = React.useMemo(() => {
        const s = {}
        breakpoints.forEach(bp => {
            s[bp.short] = (values[bp.short] || []).map(parseSpan)
        })
        return s
    }, [values, breakpoints])

    const effective = React.useMemo(() => effectiveSpans(spans, breakpoints), [spans, breakpoints])

    const bpIndex = breakpoints.findIndex(bp => bp.short === current)
    const hasOwn = bp => hasOwnSpans(spans, bp)
    // where the current breakpoint takes its values from
    const sourceOf = (index) => {
        for (let k = index; k > 0; k--) {
            if (hasOwn(breakpoints[k].short)) return breakpoints[k]
        }
        return breakpoints[0]
    }
    const source = sourceOf(bpIndex)
    const inherits = bpIndex > 0 && source.short !== current
    const shown = draft || effective[current]
    const rows = rowIndexes(shown)

    const commit = (newSpans) => {
        if (sameSpans(effective[current], newSpans) && !inherits) return
        const changes = {}
        spanChanges(spans, current, newSpans, breakpoints).forEach(({bp, index, value}) => {
            changes[keys[bp][index]] = value
        })
        onChange(changes)
    }

    const resetToInherit = () => {
        const changes = {}
        keys[current].forEach(key => {
            changes[key] = ' '
        })
        onChange(changes)
    }

    const startDrag = (e, i) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = {
            i,
            x: e.clientX,
            unit: gridRef.current.getBoundingClientRect().width / GRID,
            start: shown.slice(),
            last: null
        }
    }

    const onDrag = (e) => {
        const d = dragRef.current
        if (!d) return
        const a = d.start[d.i], b = d.start[d.i + 1]
        const delta = Math.max(1 - a, Math.min(b - 1, Math.round((e.clientX - d.x) / d.unit)))
        if (d.last === delta) return
        d.last = delta
        const next = d.start.slice()
        next[d.i] = a + delta
        next[d.i + 1] = b - delta
        setDraft(next)
    }

    const endDrag = () => {
        const d = dragRef.current
        dragRef.current = null
        if (!d) return
        setDraft(null)
        if (d.last) {
            const next = d.start.slice()
            next[d.i] += d.last
            next[d.i + 1] -= d.last
            commit(next)
        }
    }

    const onHandleKey = (e, i) => {
        const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
        if (!dir) return
        e.preventDefault()
        const next = shown.slice()
        if (next[i] + dir < 1 || next[i + 1] - dir < 1) return
        next[i] += dir
        next[i + 1] -= dir
        commit(next)
    }

    const primary = theme.palette.primary.main
    const border = theme.palette.divider
    const muted = theme.palette.text.secondary

    return <div style={{width: '100%', margin: theme.spacing(1), marginBottom: theme.spacing(2)}}>
        {label ? <div style={{marginBottom: 8}}>{label}</div> : null}
        <div role="tablist" style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
            {breakpoints.map(bp => {
                const active = bp.short === current
                const own = bp.short === breakpoints[0].short || hasOwn(bp.short)
                return <button key={bp.short}
                               type="button"
                               role="tab"
                               aria-selected={active}
                               onClick={() => setCurrent(bp.short)}
                               style={{
                                   display: 'inline-flex', alignItems: 'center', gap: 6,
                                   padding: '6px 12px',
                                   font: 'inherit', fontSize: '0.875rem',
                                   cursor: 'pointer',
                                   borderRadius: 6,
                                   color: active ? primary : theme.palette.text.primary,
                                   background: active ? theme.palette.action.selected : 'transparent',
                                   border: `1px solid ${active ? primary : border}`
                               }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d={BP_ICONS[bp.short]}/>
                    </svg>
                    {bp.long}
                    {own ? null :
                        <small style={{color: muted, fontSize: '0.7rem'}}>{_t('elements.columnLayout.inherits')}</small>}
                </button>
            })}
        </div>

        <div style={{
            position: 'relative',
            padding: 10,
            borderRadius: 10,
            background: theme.palette.action.hover,
            userSelect: 'none',
            touchAction: 'none'
        }}>
            {/* 12 column grid in the background */}
            <div style={{
                position: 'absolute', inset: 10, display: 'grid',
                gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`, columnGap: 8, pointerEvents: 'none'
            }}>
                {Array.from({length: GRID}, (_, i) => <div key={i}
                                                          style={{borderLeft: `1px dashed ${border}`}}/>)}
            </div>
            <div ref={gridRef} style={{
                position: 'relative', display: 'grid',
                gridTemplateColumns: `repeat(${GRID}, minmax(0, 1fr))`, gap: 8
            }}>
                {shown.map((s, i) => {
                    const handle = i < shown.length - 1 && rows[i] === rows[i + 1]
                    return <div key={i} style={{
                        gridColumn: `span ${Math.max(1, Math.min(GRID, s))}`,
                        position: 'relative',
                        height: 72,
                        borderRadius: 6,
                        border: `1px solid ${inherits ? border : primary}`,
                        borderStyle: inherits ? 'dashed' : 'solid',
                        background: theme.palette.background.paper,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1.2, overflow: 'visible', minWidth: 0
                    }}>
                        <span style={{fontSize: '1.05rem', fontWeight: 500}}>{s}/{GRID}</span>
                        <small style={{color: muted}}>{Math.round(s / GRID * 100)}%</small>
                        {handle ? <div role="slider"
                                       tabIndex={0}
                                       aria-label={_t('elements.columnLayout.handle', {a: i + 1, b: i + 2})}
                                       aria-valuemin={1}
                                       aria-valuemax={s + shown[i + 1] - 1}
                                       aria-valuenow={s}
                                       onPointerDown={e => startDrag(e, i)}
                                       onPointerMove={onDrag}
                                       onPointerUp={endDrag}
                                       onPointerCancel={endDrag}
                                       onKeyDown={e => onHandleKey(e, i)}
                                       style={{
                                           position: 'absolute', right: -9, top: '50%',
                                           width: 10, height: 40, marginTop: -20,
                                           borderRadius: 5, background: primary,
                                           cursor: 'col-resize', zIndex: 1
                                       }}/> : null}
                    </div>
                })}
            </div>
        </div>

        <div style={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12}}>
            <small style={{color: muted, marginRight: 4}}>{_t('elements.columnLayout.presets')}</small>
            {presetsForCount(shown.length).map(p => {
                const active = !inherits && sameSpans(p, shown)
                return <button key={p.join()}
                               type="button"
                               onClick={() => commit(p)}
                               style={{
                                   padding: '4px 10px', font: 'inherit', fontSize: '0.8rem', cursor: 'pointer',
                                   borderRadius: 6,
                                   color: active ? primary : theme.palette.text.primary,
                                   background: 'transparent',
                                   border: `1px solid ${active ? primary : border}`
                               }}>{presetLabel(p)}</button>
            })}
        </div>

        <div style={{display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10}}>
            <small style={{color: muted}}>
                {inherits ?
                    _t('elements.columnLayout.inheritInfo', {from: source.long, bp: breakpoints[bpIndex].long}) :
                    _t('elements.columnLayout.hint')}
            </small>
            {!inherits && bpIndex > 0 ? <button type="button"
                                                onClick={resetToInherit}
                                                style={{
                                                    padding: 0, border: 0, background: 'none', cursor: 'pointer',
                                                    font: 'inherit', fontSize: '0.8rem',
                                                    color: primary, textDecoration: 'underline',
                                                    textUnderlineOffset: 3
                                                }}>{_t('elements.columnLayout.reset', {from: sourceOf(bpIndex - 1).long})}</button> : null}
        </div>
    </div>
}

export default ColumnLayoutEditor
