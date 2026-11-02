import React from 'react'
import {SimpleDialog, TextField, Typography, LinearProgress, Box, Checkbox, FormControlLabel} from 'ui/admin'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import {client} from 'client/middleware/graphql'
import {firstError} from 'client/util/typeFiles.js'
import TypeFilesResult from 'client/components/TypeFilesResult'
import {_t} from 'util/i18n.mjs'
import {csvToObjects} from 'util/csv.mjs'

/*
 Import of entries into the type list: one dialog for
 - JSON / CSV (file or pasted text) -> importCollection (api/resolver/system.mjs)
 - files as zip (types with a files handler) -> importTypeFiles (api/util/typeFiles.mjs)
 with a preview, a dry run and a readable result.
 */

const MAX_PREVIEW_ROWS = 5

/** {format, count, columns, rows, error} of pasted / loaded text */
export const analyzeImportText = (text) => {
    text = (text || '').replace(/^﻿/, '').trim()
    if (!text) {
        return null
    }
    try {
        let json = JSON.parse(text)
        if (!Array.isArray(json)) {
            json = [json]
        }
        const columns = []
        json.forEach(e => e && typeof e === 'object' && Object.keys(e).forEach(k => {
            if (columns.indexOf(k) < 0) columns.push(k)
        }))
        return {
            format: 'json', count: json.length, columns,
            rows: json.slice(0, MAX_PREVIEW_ROWS).map(e => columns.map(c => e ? e[c] : undefined))
        }
    } catch (e) {
        if (/^\s*[\[{]/.test(text)) {
            return {format: 'json', error: _t('ImportDialog.invalidJson', {message: e.message})}
        }
    }
    // csv: same parser as the server (util/csv.mjs)
    const csv = csvToObjects(text)
    if (csv.rows.length === 0) {
        return {format: 'csv', error: _t('ImportDialog.noRows')}
    }
    return {format: 'csv', count: csv.rows.length, columns: csv.columns, rows: csv.rows.slice(0, MAX_PREVIEW_ROWS)}
}

const cellText = v => {
    if (v === undefined || v === null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.length > 60 ? s.substring(0, 57) + '…' : s
}

const styles = {
    drop: active => ({
        border: '2px dashed', borderColor: active ? 'var(--mui-palette-primary-main, #6366f1)' : 'rgba(127,127,127,0.4)',
        borderRadius: '8px', padding: '2rem 1rem', textAlign: 'center', cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.08)' : 'transparent', transition: 'all .15s'
    }),
    table: {borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%'},
    th: known => ({
        textAlign: 'left', padding: '0.3rem 0.5rem', whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(127,127,127,0.3)', opacity: known ? 1 : 0.45,
        textDecoration: known ? 'none' : 'line-through'
    }),
    td: {padding: '0.3rem 0.5rem', borderBottom: '1px solid rgba(127,127,127,0.15)', whiteSpace: 'nowrap'},
    chip: known => ({
        display: 'inline-block', fontSize: '0.75rem', padding: '0.1rem 0.5rem', margin: '0 0.3rem 0.3rem 0',
        borderRadius: '999px', background: known ? 'rgba(22,163,74,0.14)' : 'rgba(127,127,127,0.14)',
        color: known ? '#16a34a' : 'inherit', opacity: known ? 1 : 0.7
    })
}

/**
 * @param knownFields names of the fields the import uses (other columns are ignored by the server)
 * @param importZip optional (file, {dryRun, createMissing}) => result, for types with a files handler
 * @param onImported called after a real import (refresh of the list)
 */
const ImportDialog = ({open, onClose, type, meta, knownFields = [], importZip, onImported}) => {
    const zipAvailable = !!importZip
    const [tab, setTab] = React.useState('file')
    const [file, setFile] = React.useState(null)
    const [text, setText] = React.useState('')
    const [dragOver, setDragOver] = React.useState(false)
    const [createMissing, setCreateMissing] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [result, setResult] = React.useState(null)
    const [error, setError] = React.useState(null)
    const inputRef = React.useRef(null)

    React.useEffect(() => {
        if (open) {
            setTab('file')
            setFile(null)
            setText('')
            setResult(null)
            setError(null)
            setBusy(false)
        }
    }, [open])

    const isZip = !!(file && /\.zip$/i.test(file.name))
    // analysis of large pasted texts only after typing paused
    const [analyzedText, setAnalyzedText] = React.useState('')
    React.useEffect(() => {
        if (text.length < 20000) {
            setAnalyzedText(text)
            return
        }
        const timeout = setTimeout(() => setAnalyzedText(text), 300)
        return () => clearTimeout(timeout)
    }, [text])
    const analysis = React.useMemo(() => isZip ? null : analyzeImportText(analyzedText), [analyzedText, isZip])

    const resetResult = () => {
        setResult(null)
        setError(null)
    }

    const handleFile = async f => {
        resetResult()
        if (!f) return
        setFile(f)
        if (/\.zip$/i.test(f.name)) {
            if (!zipAvailable) {
                setError(_t('ImportDialog.zipNotSupported', {type}))
            }
            setText('')
        } else {
            try {
                setText(await f.text())
            } catch (e) {
                setError(e.message)
            }
        }
    }

    const known = new Set(['_id', 'createdBy', ...knownFields])
    const knownColumns = analysis && analysis.columns ? analysis.columns.filter(c => known.has(c) || c.indexOf('.') > 0) : []
    const unknownColumns = analysis && analysis.columns ? analysis.columns.filter(c => knownColumns.indexOf(c) < 0) : []
    const hasData = isZip ? zipAvailable : !!(analysis && !analysis.error && analysis.count > 0 && analyzedText === text)

    const runImport = async (dryRun) => {
        setBusy(true)
        resetResult()
        try {
            let res
            if (isZip) {
                res = await importZip(file, {dryRun, createMissing})
            } else {
                // importCollection is a query in the schema (api/schema/system.mjs)
                const response = await client.query({
                    fetchPolicy: 'network-only',
                    query: `query importCollection($collection: String!, $json: String!, $meta: String, $dryRun: Boolean, $createMissing: Boolean){importCollection(collection:$collection,json:$json,meta:$meta,dryRun:$dryRun,createMissing:$createMissing){result created updated skipped errors}}`,
                    variables: {collection: type, json: text, meta, dryRun, createMissing}
                })
                const err = firstError(response)
                if (err) throw err
                res = response.data.importCollection
            }
            setResult({...res, dryRun})
            if (!dryRun && onImported) {
                onImported(res)
            }
        } catch (e) {
            console.error('Import failed', e)
            setError(e.message || String(e))
        }
        setBusy(false)
    }

    const done = result && !result.dryRun

    const handleClose = action => {
        if (action && action.key === 'dryRun') {
            runImport(true)
        } else if (action && action.key === 'import') {
            runImport(false)
        } else {
            onClose()
        }
    }

    const actions = done ? [{key: 'close', label: _t('ImportDialog.close'), variant: 'contained'}] : [
        {key: 'cancel', label: _t('ImportDialog.cancel')},
        {key: 'dryRun', label: _t('ImportDialog.dryRun'), divider: true, disabled: busy || !hasData},
        {
            key: 'import', label: busy ? _t('ImportDialog.importing') : _t('ImportDialog.import'),
            variant: 'contained', disabled: busy || !hasData
        }]

    return <SimpleDialog open={open} maxWidth="md" fullWidth
                         title={_t('ImportDialog.title', {type})}
                         onClose={handleClose}
                         actions={actions}>

        {!done && <>
            <Tabs value={tab} onChange={(e, v) => {
                setTab(v)
                setFile(null)
                setText('')
                resetResult()
            }} sx={{mb: 2}}>
                <Tab value="file" label={_t('ImportDialog.tabFile')}/>
                <Tab value="paste" label={_t('ImportDialog.tabPaste')}/>
            </Tabs>

            {tab === 'file' ?
                <div style={styles.drop(dragOver)}
                     onClick={() => inputRef.current && inputRef.current.click()}
                     onDragOver={e => {
                         e.preventDefault()
                         setDragOver(true)
                     }}
                     onDragLeave={() => setDragOver(false)}
                     onDrop={e => {
                         e.preventDefault()
                         setDragOver(false)
                         handleFile(e.dataTransfer.files && e.dataTransfer.files[0])
                     }}>
                    <input ref={inputRef} type="file" style={{display: 'none'}}
                           accept={'.json,.csv,.txt,application/json,text/csv' + (zipAvailable ? ',.zip,application/zip' : '')}
                           onChange={e => {
                               handleFile(e.target.files && e.target.files[0])
                               e.target.value = ''
                           }}/>
                    {file ?
                        <Typography><strong>{file.name}</strong> ({Math.ceil(file.size / 1024)} KB)
                            · {_t('ImportDialog.otherFile')}</Typography> :
                        <>
                            <Typography>{_t('ImportDialog.dropHere')}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {zipAvailable ? 'JSON, CSV, ZIP' : 'JSON, CSV'}
                            </Typography>
                        </>}
                </div> :
                <TextField multiline fullWidth minRows={10} maxRows={20} value={text}
                           placeholder={_t('ImportDialog.pastePlaceholder')}
                           inputProps={{style: {fontFamily: 'monospace', fontSize: '0.8rem'}}}
                           onChange={e => {
                               resetResult()
                               setText(e.target.value)
                           }}/>}

            {isZip && zipAvailable &&
            <Typography variant="body2" sx={{mt: 2}}>{_t('ImportDialog.zipInfo')}</Typography>}

            {analysis && analysis.error &&
            <Typography color="error" variant="body2" sx={{mt: 2}}>{analysis.error}</Typography>}

            {analysis && !analysis.error && <Box sx={{mt: 2}}>
                <Typography variant="body2" sx={{mb: 1}}>
                    {_t('ImportDialog.detected', {count: analysis.count, format: analysis.format.toUpperCase()})}
                </Typography>
                <div>
                    {knownColumns.map(c => <span key={c} style={styles.chip(true)}>{c}</span>)}
                    {unknownColumns.map(c => <span key={c} style={styles.chip(false)}
                                                   title={_t('ImportDialog.unknownColumn')}>{c}</span>)}
                </div>
                {unknownColumns.length > 0 &&
                <Typography variant="caption" color="text.secondary" component="p">
                    {_t('ImportDialog.unknownColumns', {count: unknownColumns.length})}
                </Typography>}
                {analysis.rows.length > 0 && <Box sx={{overflowX: 'auto', mt: 1}}>
                    <table style={styles.table}>
                        <thead>
                        <tr>{analysis.columns.map(c => <th key={c} style={styles.th(knownColumns.indexOf(c) >= 0)}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                        {analysis.rows.map((row, i) => <tr key={i}>
                            {analysis.columns.map((c, j) => <td key={j} style={styles.td}>{cellText(row[j])}</td>)}
                        </tr>)}
                        </tbody>
                    </table>
                </Box>}
                <Typography variant="caption" color="text.secondary" component="p" sx={{mt: 1}}>
                    {_t('ImportDialog.matchInfo')}
                </Typography>
            </Box>}

            {hasData && <FormControlLabel sx={{mt: 1}} disabled={busy}
                                          control={<Checkbox size="small" checked={createMissing}
                                                             onChange={e => {
                                                                 resetResult()
                                                                 setCreateMissing(e.target.checked)
                                                             }}/>}
                                          label={_t('ImportDialog.createMissing')}/>}
        </>}

        {busy && <LinearProgress sx={{mt: 2}}/>}
        {error && <Typography color="error" sx={{mt: 2}}>{error}</Typography>}

        {result && <Box sx={{mt: 2}}>
            <Typography variant="subtitle2" sx={{mb: 1}}>
                {result.dryRun ? _t('ImportDialog.dryRunResult') : _t('ImportDialog.done')}
            </Typography>
            <TypeFilesResult result={result}/>
        </Box>}
    </SimpleDialog>
}

export default ImportDialog
