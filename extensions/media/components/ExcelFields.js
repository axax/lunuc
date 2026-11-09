import React, {useEffect, useRef, useState} from 'react'
import {useTheme} from '@mui/material/styles'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import {_t} from 'util/i18n.mjs'
import {getSxProps} from 'client/components/GenericForm'
import {excelApiUrl, fetchExcelJson, mediaIdFromValue, colLetters, parseHeaderRows} from '../util/excel.mjs'
// range picker and preview (desktop / phone) in plain DOM, shared with the cms page digithal/jahresbericht-import
import {previewTable, rangePicker, mobileMode, MOBILE_NAMES} from '../util/excelUi.mjs'

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

// same widths as the other fields of the form (thirdWidth, fourthWidth …)
const fieldSx = getSxProps

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

const MODES = ['result', 'phone', 'sheet']

export function ExcelPreview({form, field, fieldKey, values}) {
    const theme = useTheme()
    const get = (prop, def) => relatedValue(values, fieldKey, field[prop] || def)
    const mediaId = mediaIdFromValue(get('mediaField', 'excel'))
    const sheet = get('sheetField', 'excelSheet') || ''
    const range = (get('rangeField', 'excelRange') || '').trim()
    const headerRows = parseHeaderRows(get('headerRowsField', 'excelHeaderRows'))
    // «Titelzeilen von»: rows further up in the sheet as header of the range (optional)
    const headerRange = (get('headerRangeField', 'excelHeaderRange') || '').trim()
    const sumOnlyValue = get('sumOnlyField', 'excelSumOnly')
    const sumOnly = sumOnlyValue === true || sumOnlyValue === 'true'
    const variant = get('variantField', 'tableVariant') || 'statement'
    const mobileView = get('mobileViewField', 'mobileView') || 'auto'

    // result = as on the website (desktop), phone = mobile display, sheet = whole sheet to choose range / header rows
    const [mode, setMode] = useState(() => {
        try {
            const m = localStorage.getItem('ExcelPreview.mode')
            return MODES.includes(m) ? m : 'result'
        } catch (e) {
            return 'result'
        }
    })
    // selected column of the column switch in the phone preview
    const [col, setCol] = useState(null)
    const [state, setState] = useState({data: null, loading: false, error: ''})

    // «nur Summen» and the layout for the phone are computed (and cached) by the api
    const params = useDebounced(mode === 'sheet' ?
        {mediaId, format: 'grid', sheet} :
        {mediaId, format: 'data', sheet, range, headerRows, headerRange, sumOnly: sumOnly ? 1 : '', layout: 1}, 400)
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
    const headerRowsKey = relatedKey(fieldKey, field.headerRowsField || 'excelHeaderRows')
    // chosen in the sheet: range (and header rows) into the fields of the form
    const onPick = React.useCallback(async (newRange, newHeaderRows) => {
        await form.handleInputChange({target: {name: rangeKey, value: newRange}})
        if (newHeaderRows !== null && newHeaderRows !== undefined) {
            // wait until the range is in the form state, the next change is based on it
            await new Promise(resolve => form.setState({}, resolve))
            await form.handleInputChange({target: {name: headerRowsKey, value: newHeaderRows}})
        }
    }, [form, rangeKey, headerRowsKey])

    const {data, loading, error} = state
    const dataMatchesMode = !!data && (mode === 'sheet' ? !!data.rows && data.cols !== undefined : !!data.header)

    // the plain DOM ui is rendered into this box; the picker is only created again for another sheet / file
    const boxRef = useRef(null)
    const pickerRef = useRef(null)
    useEffect(() => {
        const box = boxRef.current
        if (!box) return
        pickerRef.current = null
        if (!dataMatchesMode || error) {
            box.replaceChildren()
            return
        }
        if (mode === 'sheet') {
            pickerRef.current = rangePicker(box, data, {range, headerRows, onPick})
        } else {
            box.replaceChildren(previewTable(data, {
                variant, view: mode === 'phone' ? 'phone' : 'desktop', mobileView, col, onCol: setCol, emptyText: _t('ExcelField.noData')
            }))
        }
        // range / header rows are not dependencies: the result gets new data anyway, the picker is synced below
    }, [data, dataMatchesMode, error, mode, variant, mobileView, col, onPick])
    useEffect(() => {
        if (pickerRef.current) pickerRef.current.sync(range, headerRows)
    }, [range, headerRows])

    let message = null
    if (!mediaId) {
        message = <p style={{margin: 0, opacity: 0.7}}>{_t('ExcelField.selectFileFirst')}</p>
    } else if (error) {
        message = <p style={{margin: 0, color: theme.palette.error.main}}>{error === 'Invalid range: ' + range ? _t('ExcelField.invalidRange', {range}) : error}</p>
    } else if (!dataMatchesMode) {
        message = <CircularProgress size={24}/>
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
                <ToggleButton value="phone">{_t('ExcelField.modePhone')}</ToggleButton>
                <ToggleButton value="sheet">{_t('ExcelField.modeSheet')}</ToggleButton>
            </ToggleButtonGroup>
            {loading && dataMatchesMode && <CircularProgress size={16}/>}
            <small style={{opacity: 0.7}}>
                {mode === 'sheet' ? (dataMatchesMode && data.truncated ? _t('ExcelField.truncated', {rows: data.rows.length, total: data.rowCount}) : '') :
                    (dataMatchesMode ? _t('ExcelField.resultInfo', {
                        sheet: data.sheet,
                        range: range || _t('ExcelField.wholeSheet'),
                        rows: (data.rows || []).length
                    }) + (mode === 'phone' ? ' · ' + _t('ExcelField.phoneMode', {mode: MOBILE_NAMES[mobileMode(data, mobileView)]}) : '') : '')}
            </small>
        </div>
        {message}
        <div ref={boxRef} style={{
            display: message ? 'none' : 'block',
            ...(mode === 'sheet' ? {} : {
                maxHeight: field.maxHeight || 640,
                overflow: 'auto',
                border: '1px solid ' + theme.palette.divider,
                borderRadius: theme.shape.borderRadius,
                padding: theme.spacing(1.5),
                background: '#fff'
            })
        }}/>
    </div>
}
