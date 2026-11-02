import React from 'react'
import {SimpleDialog, TextField, Typography, LinearProgress, Box, Checkbox, FormControlLabel} from 'ui/admin'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormLabel from '@mui/material/FormLabel'
import FormControl from '@mui/material/FormControl'
import {downloadAs} from 'client/util/download.js'
import {getExportAiGuide, setExportAiGuide} from 'client/util/typeFiles.js'
import {_t} from 'util/i18n.mjs'
import {toCsv as entriesToCsv} from 'util/csv.mjs'

const toInt = v => {
    const n = parseInt(v)
    return isNaN(n) ? 0 : n
}

/**
 * One dialog for all exports of the type table (menu of the list, selected entries, single entry)
 *
 * @param loadEntries async ({allFields, useFilter, from, to, ids, idsOnly, onProgress, isCancelled}) => entries
 *        from/to are 1-based positions in the (sorted) list, to = 0 means up to the end
 *        ids: only these entries (selection)
 * @param toCsv optional converter (entries) => csv string, e.g. set by a hook for GenericData
 * @param selectedIds selected entries (or the one entry if single is true)
 * @param exportZip optional async ({ids, aiGuide}) => count, only for types with a files handler
 */
const ExportDialog = ({
                          open, onClose, type, total, page, limit, filterActive, filename, loadEntries, toCsv,
                          selectedIds = [], single = false, exportZip
                      }) => {
    const pageFrom = Math.max(1, (page - 1) * limit + 1),
        pageTo = Math.max(pageFrom, Math.min(total || page * limit, page * limit))
    const hasSelection = selectedIds.length > 0

    const [format, setFormat] = React.useState('csv')
    const [fields, setFields] = React.useState('all')
    const [scope, setScope] = React.useState(hasSelection ? 'selection' : 'page')
    const [useFilter, setUseFilter] = React.useState(true)
    const [aiGuide, setAiGuide] = React.useState(getExportAiGuide())
    const [from, setFrom] = React.useState(pageFrom)
    const [to, setTo] = React.useState(pageTo)
    const [progress, setProgress] = React.useState(null)
    const [error, setError] = React.useState(null)
    const cancelled = React.useRef(false)

    React.useEffect(() => {
        if (open) {
            setFrom(pageFrom)
            setTo(pageTo)
            setScope(hasSelection ? 'selection' : 'page')
            setProgress(null)
            setError(null)
            cancelled.current = false
        }
    }, [open])

    const busy = progress !== null
    // without the filter the total of the list is not the total of the export
    const totalKnown = useFilter || !filterActive
    const rangeInvalid = scope === 'range' && (toInt(from) < 1 || toInt(to) < toInt(from))

    let count = null
    if (scope === 'selection') {
        count = selectedIds.length
    } else if (scope === 'page') {
        count = total ? Math.max(0, pageTo - pageFrom + 1) : 0
    } else if (scope === 'all') {
        count = totalKnown ? (total || 0) : null
    } else if (!rangeInvalid) {
        count = toInt(to) - toInt(from) + 1
        if (totalKnown) {
            count = Math.max(0, Math.min(count, (total || 0) - toInt(from) + 1))
        }
    }

    const rangeOfScope = () => {
        if (scope === 'page') {
            return {from: pageFrom, to: pageTo}
        } else if (scope === 'range') {
            return {from: toInt(from), to: toInt(to)}
        }
        return {from: 1, to: 0}
    }

    const baseName = () => {
        const range = rangeOfScope()
        return (filename || type || 'export') +
            (scope === 'selection' ? (single ? '-' + selectedIds[0] : '-selection') :
                scope === 'page' ? '-page' + page : scope === 'range' ? `-${range.from}-${range.to}` : '')
    }

    const handleExport = async () => {
        cancelled.current = false
        setError(null)
        setProgress(0)
        const range = rangeOfScope()
        const common = {
            useFilter: totalKnown,
            from: range.from,
            to: range.to,
            ids: scope === 'selection' ? selectedIds : null,
            onProgress: p => setProgress(Math.round(p * 100)),
            isCancelled: () => cancelled.current
        }
        try {
            if (format === 'zip') {
                setExportAiGuide(aiGuide)
                let ids = selectedIds
                if (scope !== 'selection') {
                    ids = (await loadEntries({...common, idsOnly: true})).map(e => e._id)
                }
                if (cancelled.current) {
                    return
                }
                if (ids.length === 0) {
                    throw new Error(_t('ExportDialog.nothingToExport'))
                }
                setProgress(0)
                await exportZip({ids, aiGuide})
            } else {
                const entries = await loadEntries({...common, allFields: fields === 'all'})
                if (cancelled.current) {
                    return
                }
                if (format === 'json') {
                    downloadAs(JSON.stringify(entries, null, 2), baseName() + '.json')
                } else {
                    // BOM so that Excel detects UTF-8 (umlauts)
                    downloadAs('﻿' + (toCsv ? toCsv(entries) : entriesToCsv(entries)), baseName() + '.csv')
                }
            }
            setProgress(null)
            onClose()
        } catch (e) {
            console.error('Export failed', e)
            setProgress(null)
            setError(e.message || String(e))
        }
    }

    const handleClose = action => {
        if (action && action.key === 'export') {
            handleExport()
        } else {
            cancelled.current = true
            setProgress(null)
            onClose()
        }
    }

    const hint = format === 'json' ? _t('ExportDialog.jsonHint') :
        format === 'zip' ? _t('ExportDialog.zipHint') : _t('ExportDialog.csvHint')

    return <SimpleDialog open={open} maxWidth="sm" fullWidth maximizable={false}
                         title={_t('ExportDialog.title', {type})}
                         onClose={handleClose}
                         actions={[
                             {key: 'cancel', label: _t('ExportDialog.cancel')},
                             {
                                 key: 'export',
                                 label: busy ? _t('ExportDialog.exporting') : _t('ExportDialog.download'),
                                 variant: 'contained',
                                 disabled: busy || rangeInvalid || count === 0
                             }]}>

        <FormLabel sx={{display: 'block', mb: 1}}>{_t('ExportDialog.format')}</FormLabel>
        <ToggleButtonGroup exclusive size="small" color="primary" value={format} disabled={busy}
                           onChange={(e, v) => v && setFormat(v)}>
            <ToggleButton value="csv" sx={{px: 3}}>CSV</ToggleButton>
            <ToggleButton value="json" sx={{px: 3}}>JSON</ToggleButton>
            {exportZip && <ToggleButton value="zip" sx={{px: 3}}>{_t('ExportDialog.zip')}</ToggleButton>}
        </ToggleButtonGroup>
        <Typography variant="caption" component="p" color="text.secondary" sx={{mt: 0.5}}>{hint}</Typography>

        {format === 'zip' ?
            <FormControlLabel sx={{display: 'flex', mt: 2}} disabled={busy}
                              control={<Checkbox size="small" checked={aiGuide}
                                                 onChange={e => setAiGuide(e.target.checked)}/>}
                              label={_t('ExportDialog.aiGuide')}/> :
            <FormControl sx={{display: 'block', mt: 3}} disabled={busy}>
                <FormLabel>{_t('ExportDialog.fields')}</FormLabel>
                <RadioGroup value={fields} onChange={e => setFields(e.target.value)}>
                    <FormControlLabel value="all" control={<Radio size="small"/>}
                                      label={_t('ExportDialog.fieldsAll')}/>
                    <FormControlLabel value="visible" control={<Radio size="small"/>}
                                      label={_t('ExportDialog.fieldsVisible')}/>
                </RadioGroup>
            </FormControl>}

        <FormControl sx={{display: 'block', mt: 2}} disabled={busy}>
            <FormLabel>{_t('ExportDialog.entries')}</FormLabel>
            <RadioGroup value={scope} onChange={e => setScope(e.target.value)}>
                {hasSelection && <FormControlLabel value="selection" control={<Radio size="small"/>}
                                                   label={single ? _t('ExportDialog.scopeSingle') :
                                                       _t('ExportDialog.scopeSelection', {count: selectedIds.length})}/>}
                <FormControlLabel value="page" control={<Radio size="small"/>}
                                  label={_t('ExportDialog.scopePage', {from: pageFrom, to: pageTo})}/>
                <FormControlLabel value="all" control={<Radio size="small"/>}
                                  label={_t('ExportDialog.scopeAll') + (totalKnown ? ` (${total || 0})` : '')}/>
                <FormControlLabel value="range" control={<Radio size="small"/>}
                                  label={_t('ExportDialog.scopeRange')}/>
            </RadioGroup>
            {scope === 'range' && <Box sx={{display: 'flex', gap: 2, ml: 4, mt: 1, alignItems: 'center'}}>
                <TextField size="small" type="number" label={_t('ExportDialog.from')} value={from}
                           inputProps={{min: 1}} sx={{width: '8rem'}}
                           onChange={e => setFrom(e.target.value)}/>
                <span>–</span>
                <TextField size="small" type="number" label={_t('ExportDialog.to')} value={to}
                           inputProps={{min: 1}} sx={{width: '8rem'}} error={rangeInvalid}
                           onChange={e => setTo(e.target.value)}/>
            </Box>}
        </FormControl>

        {filterActive && scope !== 'selection' &&
        <FormControlLabel sx={{mt: 2}} disabled={busy}
                          control={<Checkbox size="small" checked={useFilter}
                                             onChange={e => setUseFilter(e.target.checked)}/>}
                          label={_t('ExportDialog.useFilter')}/>}

        <Typography variant="body2" sx={{mt: 2}}>
            {count === null ? _t('ExportDialog.countUnknown') : _t('ExportDialog.count', {count})}
        </Typography>

        {busy && <Box sx={{mt: 2}}>
            <LinearProgress variant={progress > 0 ? 'determinate' : 'indeterminate'} value={progress}/>
            {progress > 0 && <Typography variant="caption" color="text.secondary">{progress}%</Typography>}
        </Box>}
        {error && <Typography color="error" sx={{mt: 2}}>{error}</Typography>}
    </SimpleDialog>
}

export default ExportDialog
