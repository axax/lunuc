import React, {useEffect, useRef, useState} from 'react'
import {useTheme, alpha} from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import {_t} from 'util/i18n.mjs'
import {excelApiUrl, fetchExcelJson, mediaIdFromValue, colLetters, parseRange, parseHeaderRows, sumRowsOnly} from '../util/excel.mjs'

/*
 * Form fields for excel files (uitype excelSheet / excelPreview), registered in client-admin.js.
 * Both read the selected Media from another field of the form (field.mediaField, default "excel")
 * and load the file through the api system/excel2html.
 * excelSheet: on a change of the sheet the used range of the new sheet is written to field.rangeField (default "excelRange",
 * set rangeField to false to keep the range).
 */

// generic data fields are prefixed with "data_" inside the form
const relatedKey = (fieldKey, name) => (fieldKey && fieldKey.startsWith('data_') ? 'data_' : '') + name

const relatedValue = (values, fieldKey, name) => (values || {})[relatedKey(fieldKey, name)]

const apiUrl = excelApiUrl
const fetchJson = fetchExcelJson

const useDebounced = (value, delay) => {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay)
        return () => clearTimeout(t)
    }, [value, delay])
    return debounced
}

const fieldSx = (field, theme) => ({
    margin: 1,
    display: 'inline-flex',
    width: 'calc(100% - ' + theme.spacing(2) + ')',
    ...(!field.fullWidth && {
        [theme.breakpoints.up('md')]: {
            width: `calc(${field.twoThirdWidth ? '66.66' : field.fourthWidth ? '25' : field.thirdWidth ? '33.33' : '50'}% - ${theme.spacing(2)})`
        }
    })
})

/* list of the sheets of the selected excel file */
const useSheets = mediaId => {
    const [state, setState] = useState({sheets: [], loading: false, error: ''})
    useEffect(() => {
        if (!mediaId) {
            setState({sheets: [], loading: false, error: ''})
            return
        }
        let active = true
        setState(s => ({...s, loading: true, error: ''}))
        fetchJson(apiUrl({mediaId, format: 'sheets'}))
            .then(json => json.sheets)
            // older api without format=sheets: the data format also returns the sheet names
            .catch(() => fetchJson(apiUrl({mediaId, format: 'data', range: 'A1:A1'})).then(json => (json.sheets || []).map(name => ({name}))))
            .then(sheets => active && setState({sheets: sheets || [], loading: false, error: ''}))
            .catch(e => active && setState({sheets: [], loading: false, error: e.message}))
        return () => {
            active = false
        }
    }, [mediaId])
    return state
}

export function ExcelSheetSelect({form, field, fieldKey, value, values}) {
    const theme = useTheme()
    const mediaId = mediaIdFromValue(relatedValue(values, fieldKey, field.mediaField || 'excel'))
    const {sheets, loading, error} = useSheets(mediaId)
    const current = value || ''

    const items = sheets.map(sheet => ({
        value: sheet.name,
        label: sheet.name + (sheet.state && sheet.state !== 'visible' ? ' (' + _t('ExcelField.hidden') + ')' : ''),
        hint: sheet.range || (sheet.rows ? `A1:${colLetters(sheet.cols || 1)}${sheet.rows}` : '')
    }))
    if (current && !loading && mediaId && !items.some(i => i.value === current)) {
        items.push({value: current, label: current, hint: _t('ExcelField.sheetNotFound'), missing: true})
    } else if (current && !mediaId) {
        items.push({value: current, label: current})
    }

    let helperText = field.helperText || ''
    if (!mediaId) helperText = _t('ExcelField.selectFileFirst')
    else if (error) helperText = error
    else if (current && items.some(i => i.missing)) helperText = _t('ExcelField.sheetNotFound')

    return <TextField
        select
        key={fieldKey}
        name={fieldKey}
        label={field.label || field.name}
        value={current}
        disabled={field.readOnly || field.uiReadOnly}
        error={!!error || items.some(i => i.missing)}
        helperText={helperText}
        sx={fieldSx(field, theme)}
        slotProps={{
            inputLabel: {shrink: true},
            select: {
                displayEmpty: true,
                renderValue: v => v || <span style={{opacity: 0.6}}>{_t('ExcelField.firstSheet')}</span>,
                endAdornment: loading ? <CircularProgress size={18} sx={{mr: 3}}/> : null
            }
        }}
        onChange={async e => {
            const newSheet = e.target.value
            await form.handleInputChange({target: {name: fieldKey, value: newSheet}})
            // wait until the new sheet is in the form state, the next change is based on it
            await new Promise(resolve => form.setState({}, resolve))
            // take over the used range of the new sheet
            if (field.rangeField !== false) {
                const info = newSheet ? sheets.find(sh => sh.name === newSheet) : sheets[0]
                const usedRange = info && (info.range || (info.rows && info.cols ? `A1:${colLetters(info.cols)}${info.rows}` : ''))
                if (usedRange) {
                    await form.handleInputChange({target: {name: relatedKey(fieldKey, field.rangeField || 'excelRange'), value: usedRange}})
                }
            }
        }}>
        <MenuItem value=""><em>{_t('ExcelField.firstSheet')}</em></MenuItem>
        {items.map(item => <MenuItem key={item.value} value={item.value}>
            <span style={{flexGrow: 1}}>{item.label}</span>
            {item.hint && <small style={{marginLeft: '1.5rem', opacity: 0.6}}>{item.hint}</small>}
        </MenuItem>)}
    </TextField>
}

const tableStyle = theme => ({
    borderCollapse: 'collapse',
    fontSize: '12px',
    lineHeight: 1.4,
    color: theme.palette.text.primary,
    width: 'max-content',
    minWidth: '100%'
})

// Same look as the preview of the page digithal/jahresbericht-import (green sum rows, section rows, text rows,
// variant «list»), always on a light background like on the website. Cells with .h are html (escaped by the api).
const PREVIEW_ROWS = 80
const PV = {green: '#239442', line: '#241c15', sum: '#ecf2d0', ink: '#1d1d1d'}

const ResultTable = React.memo(function ResultTable({data, sumOnly, variant}) {
    const shown = sumOnly ? sumRowsOnly(data) : data
    const rows = shown.rows || []
    const header = (shown.header || []).map(r => Array.isArray(r) ? r : (r.cells || []))
    const isList = variant === 'list'
    const cell = (c, i, isHeader, row) => {
        const isSum = row && row.sum, isSection = row && row.section, isText = row && row.text
        const style = isHeader ? {
            color: PV.green, textTransform: 'uppercase', fontSize: '0.78rem', fontWeight: 600, padding: '0.45em 0.5em',
            textAlign: c.n ? 'right' : (c.a || 'left'), borderBottom: '2px solid ' + PV.line
        } : {
            padding: '0.4em 0.5em', verticalAlign: 'top',
            textAlign: c.a || (c.n ? 'right' : 'left'),
            whiteSpace: c.n && !isText ? 'nowrap' : undefined,
            fontWeight: c.b || isSum || isSection ? 700 : 400,
            borderBottom: isText ? 'none' : '1px solid ' + (isList ? PV.green : PV.line),
            ...(isText ? {paddingTop: '1em', textAlign: 'left', whiteSpace: 'normal', fontWeight: c.b ? 700 : 400} : {}),
            ...(isSection ? {paddingTop: '1em'} : {}),
            ...(isSum ? {background: PV.sum, borderTop: '2px solid ' + PV.green, borderBottom: '2px solid ' + PV.green} : {})
        }
        const props = {key: i, style, colSpan: c.span > 1 ? c.span : undefined, rowSpan: c.rowspan > 1 ? c.rowspan : undefined}
        return c.h ? (isHeader ? <th {...props} dangerouslySetInnerHTML={{__html: c.h}}/> : <td {...props} dangerouslySetInnerHTML={{__html: c.h}}/>)
            : (isHeader ? <th {...props}>{c.v}</th> : <td {...props}>{c.v}</td>)
    }
    if (rows.length === 0 && header.length === 0) {
        return <p style={{margin: 0, opacity: 0.7}}>{_t('ExcelField.noData')}</p>
    }
    return <div style={{color: PV.ink}}>
        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', lineHeight: 1.35, marginBottom: '0.5rem'}}>
            {header.length > 0 && <thead>{header.map((cells, r) => <tr key={r}>{cells.filter(Boolean).map((c, i) => cell(c, i, true))}</tr>)}</thead>}
            <tbody>{rows.slice(0, PREVIEW_ROWS).map((row, r) => <tr key={r}>{(row.cells || []).filter(Boolean).map((c, i) => cell(c, i, false, row))}</tr>)}</tbody>
        </table>
        {rows.length > PREVIEW_ROWS && <small style={{opacity: 0.7}}>… {rows.length - PREVIEW_ROWS} weitere Zeilen</small>}
    </div>
})

function SheetGrid({data, range, headerRows, onSelectRange, theme}) {
    const [selection, setSelection] = useState(null)
    const dragging = useRef(false)
    const selectionRef = useRef(null)
    selectionRef.current = selection

    useEffect(() => {
        const up = () => {
            if (!dragging.current) return
            dragging.current = false
            const sel = selectionRef.current
            if (sel) {
                const r = {
                    top: Math.min(sel.start.r, sel.end.r), bottom: Math.max(sel.start.r, sel.end.r),
                    left: Math.min(sel.start.c, sel.end.c), right: Math.max(sel.start.c, sel.end.c)
                }
                onSelectRange(`${colLetters(r.left)}${r.top}:${colLetters(r.right)}${r.bottom}`)
            }
            setSelection(null)
        }
        document.addEventListener('mouseup', up)
        return () => document.removeEventListener('mouseup', up)
    }, [onSelectRange])

    const active = selection ? {
        top: Math.min(selection.start.r, selection.end.r), bottom: Math.max(selection.start.r, selection.end.r),
        left: Math.min(selection.start.c, selection.end.c), right: Math.max(selection.start.c, selection.end.c)
    } : range

    const cols = data.cols || 0
    const hiddenCols = new Set(data.hiddenCols || [])
    const border = '1px solid ' + theme.palette.divider
    const headBg = theme.palette.mode === 'dark' ? theme.palette.grey[800] : theme.palette.grey[100]
    const sticky = {position: 'sticky', background: headBg, zIndex: 1, fontWeight: 400, color: theme.palette.text.secondary, border, padding: '2px 6px', textAlign: 'center'}
    const inRange = (r, c) => active && r >= active.top && r <= active.bottom && c >= active.left && c <= active.right

    const colNumbers = []
    for (let c = 1; c <= cols; c++) colNumbers.push(c)

    return <table style={{...tableStyle(theme), userSelect: 'none', cursor: 'cell'}}>
        <thead>
        <tr>
            <th style={{...sticky, top: 0, left: 0, zIndex: 2}}/>
            {colNumbers.map(c => <th key={c} style={{
                ...sticky, top: 0,
                opacity: hiddenCols.has(c) ? 0.4 : 1,
                background: inRange(active ? active.top : 0, c) ? alpha(theme.palette.primary.main, 0.25) : headBg
            }}>{colLetters(c)}</th>)}
        </tr>
        </thead>
        <tbody>
        {data.rows.map(row => {
            const rowInRange = active && row.r >= active.top && row.r <= active.bottom
            const isHeaderRow = !selection && range && rowInRange && row.r < range.top + headerRows
            return <tr key={row.r} style={{opacity: row.hidden ? 0.4 : 1}}>
                <th style={{...sticky, left: 0, background: rowInRange ? alpha(theme.palette.primary.main, 0.25) : headBg}}>{row.r}</th>
                {colNumbers.map(c => {
                    const cell = row.cells[c - 1]
                    const selected = inRange(row.r, c)
                    return <td key={c}
                               onMouseDown={e => {
                                   e.preventDefault()
                                   dragging.current = true
                                   setSelection({start: {r: row.r, c}, end: {r: row.r, c}})
                               }}
                               onMouseEnter={() => {
                                   if (dragging.current) {
                                       setSelection(s => s ? {...s, end: {r: row.r, c}} : s)
                                   }
                               }}
                               style={{
                                   border,
                                   padding: '2px 6px',
                                   maxWidth: 260,
                                   overflow: 'hidden',
                                   textOverflow: 'ellipsis',
                                   whiteSpace: 'nowrap',
                                   textAlign: cell && cell.n ? 'right' : 'left',
                                   fontWeight: cell && cell.b ? 600 : 400,
                                   opacity: hiddenCols.has(c) ? 0.4 : 1,
                                   background: selected ? alpha(theme.palette.primary.main, isHeaderRow ? 0.28 : 0.12) : undefined
                               }}
                               title={cell && cell.v ? cell.v : undefined}>{cell ? cell.v : ''}</td>
                })}
            </tr>
        })}
        </tbody>
    </table>
}

export function ExcelPreview({form, field, fieldKey, values}) {
    const theme = useTheme()
    const get = (prop, def) => relatedValue(values, fieldKey, field[prop] || def)
    const mediaId = mediaIdFromValue(get('mediaField', 'excel'))
    const sheet = get('sheetField', 'excelSheet') || ''
    const range = (get('rangeField', 'excelRange') || '').trim()
    const headerRows = parseHeaderRows(get('headerRowsField', 'excelHeaderRows'))
    const sumOnlyValue = get('sumOnlyField', 'excelSumOnly')
    const sumOnly = sumOnlyValue === true || sumOnlyValue === 'true'
    const variant = get('variantField', 'tableVariant') || 'statement'


    const [mode, setMode] = useState(() => {
        try {
            return localStorage.getItem('ExcelPreview.mode') || 'result'
        } catch (e) {
            return 'result'
        }
    })
    const [state, setState] = useState({data: null, loading: false, error: ''})

    const params = useDebounced(mode === 'sheet' ?
        {mediaId, format: 'grid', sheet} :
        {mediaId, format: 'data', sheet, range, headerRows}, 400)
    const url = params.mediaId ? apiUrl(params) : ''

    useEffect(() => {
        if (!url) {
            setState({data: null, loading: false, error: ''})
            return
        }
        let active = true
        setState(s => ({...s, loading: true, error: ''}))
        fetchJson(url)
            .then(data => active && setState({data, loading: false, error: ''}))
            .catch(e => active && setState({data: null, loading: false, error: e.message}))
        return () => {
            active = false
        }
    }, [url])

    const rangeKey = relatedKey(fieldKey, field.rangeField || 'excelRange')
    const onSelectRange = React.useCallback(newRange => {
        form.handleInputChange({target: {name: rangeKey, value: newRange}})
    }, [form, rangeKey])

    const {data, loading, error} = state
    const dataMatchesMode = data && (mode === 'sheet' ? !!data.rows && data.cols !== undefined : !!data.header)

    let content
    if (!mediaId) {
        content = <p style={{margin: 0, opacity: 0.7}}>{_t('ExcelField.selectFileFirst')}</p>
    } else if (error) {
        content = <p style={{margin: 0, color: theme.palette.error.main}}>{error === 'Invalid range: ' + range ? _t('ExcelField.invalidRange', {range}) : error}</p>
    } else if (!dataMatchesMode) {
        content = <CircularProgress size={24}/>
    } else if (mode === 'sheet') {
        content = <SheetGrid data={data} range={parseRange(range)} headerRows={headerRows} onSelectRange={onSelectRange} theme={theme}/>
    } else {
        content = <ResultTable data={data} sumOnly={sumOnly} variant={variant}/>
    }

    return <div key={fieldKey} style={{margin: theme.spacing(1), width: 'calc(100% - ' + theme.spacing(2) + ')'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: theme.spacing(2), flexWrap: 'wrap', marginBottom: theme.spacing(1)}}>
            <strong style={{fontSize: '0.875rem'}}>{field.label || _t('ExcelField.preview')}</strong>
            <ToggleButtonGroup size="small" exclusive value={mode} onChange={(e, v) => {
                if (v) {
                    setMode(v)
                    try {
                        localStorage.setItem('ExcelPreview.mode', v)
                    } catch (e) {
                    }
                }
            }}>
                <ToggleButton value="result">{_t('ExcelField.modeResult')}</ToggleButton>
                <ToggleButton value="sheet">{_t('ExcelField.modeSheet')}</ToggleButton>
            </ToggleButtonGroup>
            {loading && dataMatchesMode && <CircularProgress size={16}/>}
            <small style={{opacity: 0.7}}>
                {mode === 'sheet' ? _t('ExcelField.sheetHint') :
                    (dataMatchesMode ? _t('ExcelField.resultInfo', {
                        sheet: data.sheet,
                        range: range || _t('ExcelField.wholeSheet'),
                        rows: (data.rows || []).length
                    }) : '')}
                {mode === 'sheet' && dataMatchesMode && data.truncated ? ' ' + _t('ExcelField.truncated', {rows: data.rows.length, total: data.rowCount}) : ''}
            </small>
        </div>
        <div style={{
            maxHeight: field.maxHeight || 480,
            overflow: 'auto',
            border: '1px solid ' + theme.palette.divider,
            borderRadius: theme.shape.borderRadius,
            padding: mode === 'sheet' ? 0 : theme.spacing(1.5),
            background: mode === 'sheet' ? theme.palette.background.paper : '#fff'
        }}>{content}</div>
    </div>
}
