import React from 'react'
import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import {Box, Typography, Chip, Button, SimpleSelect, LinearProgress} from 'ui/admin'
import Async from '../../../client/components/Async'
import {_t} from '../../../util/i18n.mjs'

const CodeEditor = (props) => <Async {...props}
                                     load={() => import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

/*
 * Tab "Änderungen" in the edit dialog of a type.
 *
 * A History entry only holds the fields that were sent with a save (meta.keys) with their NEW value.
 * The value before a save is the value of the same field in the next older entry that contains it.
 * Creating an entry is not recorded, so the oldest recorded value of a field has no "before".
 */

// entries (only meta data) loaded per page, the content is loaded on demand
const PAGE_SIZE = 50
// keys of an update that are no real fields
const IGNORE_KEYS = ['_id', '_meta', '_version', 'modifiedAt']
// short single line values are shown inline instead of in a merge view
const INLINE_MAX_LENGTH = 160

const dataCache = new Map()

const loadEntryData = async (ids) => {
    const missing = ids.filter(id => id && !dataCache.has(id))
    if (missing.length === 0) {
        return
    }
    const res = await client.query({
        fetchPolicy: 'no-cache',
        query: 'query historys($filter:String,$limit:Int){historys(filter:$filter,limit:$limit){results{_id data}}}',
        variables: {filter: `_id=[${missing.join(',')}]`, limit: missing.length}
    })
    const results = (res && res.data && res.data.historys && res.data.historys.results) || []
    results.forEach(r => {
        let data = {}
        try {
            data = JSON.parse(r.data) || {}
        } catch (e) {
        }
        dataCache.set(r._id, data)
    })
    // keep the cache small, a save of a large object can be big
    while (dataCache.size > 200) {
        dataCache.delete(dataCache.keys().next().value)
    }
}

const parseEntry = (entry) => {
    let keys = []
    try {
        keys = (entry.meta ? JSON.parse(entry.meta).keys : []) || []
    } catch (e) {
    }
    return {
        _id: entry._id,
        action: entry.action,
        username: entry.createdBy ? entry.createdBy.username : '?',
        fields: keys.filter(k => IGNORE_KEYS.indexOf(k) < 0)
    }
}

const referenceIds = (value) => {
    if (Array.isArray(value)) {
        return value.map(v => v && v._id ? v._id : v)
    }
    return value && value._id ? value._id : value
}

const stripLocalized = (value) => {
    if (value && value.constructor === Object && value._localized) {
        const copy = Object.assign({}, value)
        delete copy._localized
        return copy
    }
    return value
}

/* value of a field as text for the diff: {text, json} */
const valueToText = (value, fieldDef) => {
    if (value === undefined || value === null) {
        return {text: '', json: false}
    }
    if (fieldDef && fieldDef.reference) {
        value = referenceIds(value)
    }
    value = stripLocalized(value)
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                return {text: JSON.stringify(JSON.parse(trimmed), null, 2), json: true}
            } catch (e) {
            }
        }
        return {text: value, json: false}
    }
    if (typeof value === 'object') {
        return {text: JSON.stringify(value, null, 2), json: true}
    }
    return {text: String(value), json: false}
}

const formatEntryTime = (id) => Util.formattedDateFromObjectId(id)

const isShort = (text) => text.length <= INLINE_MAX_LENGTH && text.indexOf('\n') < 0

const DiffContent = ({entryId, field, before, after, beforeUnknown, compareLabel}) => {
    if (!beforeUnknown && before.text === after.text) {
        return <Typography variant="body2" sx={{opacity: 0.6}}>{_t('TypeHistory.unchanged')}</Typography>
    }
    if (beforeUnknown) {
        return <>
            <Typography variant="body2" sx={{opacity: 0.6, mb: 0.5}}>{_t('TypeHistory.firstRecorded')}</Typography>
            {isShort(after.text) ?
                <Box sx={{fontFamily: 'monospace', fontSize: '0.85rem'}}>{after.text || <i>{_t('TypeHistory.empty')}</i>}</Box> :
                <CodeEditor key={entryId + field + 'single'} readOnly lineNumbers
                            type={after.json ? 'json' : undefined}
                            style={{border: '1px solid rgba(0,0,0,0.12)', maxHeight: '40vh', overflow: 'auto'}}>
                    {after.text}</CodeEditor>}
        </>
    }
    if (isShort(before.text) && isShort(after.text)) {
        return <Box sx={{fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-word'}}>
            <Box component="span" sx={{bgcolor: 'rgba(220,0,0,0.12)', textDecoration: 'line-through', px: 0.5}}>
                {before.text || <i>{_t('TypeHistory.empty')}</i>}</Box>
            {' → '}
            <Box component="span" sx={{bgcolor: 'rgba(0,160,0,0.15)', px: 0.5}}>
                {after.text || <i>{_t('TypeHistory.empty')}</i>}</Box>
        </Box>
    }
    return <CodeEditor key={entryId + field + compareLabel.join('|')}
                       mergeView={true}
                       mergeLabels={compareLabel}
                       readOnly={true}
                       lineNumbers
                       type={before.json || after.json ? 'json' : undefined}
                       style={{border: '1px solid rgba(0,0,0,0.12)', maxHeight: '50vh', overflow: 'auto'}}
                       mergeValue={after.text}>{before.text}</CodeEditor>
}

/*
 * one changed field of an entry. Collapsed nothing is loaded or rendered,
 * the data of the entry (and of the entry with the value before) is only loaded when it is opened
 */
const FieldRow = ({entries, index, field, label, fieldDef, compareMode, getCurrent, open, onToggle}) => {
    const entry = entries[index]
    const [loaded, setLoaded] = React.useState(null)
    const [error, setError] = React.useState(null)

    // the entry that holds the value of the field before this save
    let prevId = null
    if (compareMode === 'previous') {
        for (let i = index + 1; i < entries.length; i++) {
            if (entries[i].fields.indexOf(field) >= 0) {
                prevId = entries[i]._id
                break
            }
        }
    }
    const loadKey = entry._id + '|' + prevId + '|' + compareMode

    React.useEffect(() => {
        if (!open) {
            return
        }
        let cancelled = false
        setError(null)
        loadEntryData([entry._id, prevId]).then(() => {
            if (!cancelled) {
                setLoaded(loadKey)
            }
        }).catch(e => !cancelled && setError(e.message))
        return () => {
            cancelled = true
        }
    }, [open, loadKey])

    let content = null
    if (open) {
        if (error) {
            content = <Typography color="error" variant="body2">{_t('TypeHistory.error')}: {error}</Typography>
        } else if (loaded !== loadKey) {
            content = <LinearProgress/>
        } else {
            const value = valueToText((dataCache.get(entry._id) || {})[field], fieldDef)
            let before, after, beforeUnknown = false, labels
            if (compareMode === 'current') {
                before = value
                after = valueToText((getCurrent() || {})[field], fieldDef)
                labels = [_t('TypeHistory.thisVersion'), _t('TypeHistory.currentVersion')]
            } else {
                after = value
                labels = [_t('TypeHistory.before'), _t('TypeHistory.after')]
                if (prevId) {
                    before = valueToText((dataCache.get(prevId) || {})[field], fieldDef)
                } else {
                    before = {text: '', json: false}
                    beforeUnknown = true
                }
            }
            content = <DiffContent entryId={entry._id} field={field} before={before} after={after}
                                   beforeUnknown={beforeUnknown} compareLabel={labels}/>
        }
    }

    return <Box sx={{mb: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1}}>
        <Box onClick={() => onToggle(field)}
             sx={{
                 display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, cursor: 'pointer', userSelect: 'none',
                 '&:hover': {bgcolor: 'action.hover'}
             }}>
            <Box component="span" sx={{
                display: 'inline-block', width: '1rem', transition: 'transform 0.15s',
                transform: open ? 'rotate(90deg)' : 'none'
            }}>▸</Box>
            <Typography variant="subtitle2">
                {label}{label !== field && <Box component="span" sx={{opacity: 0.5, fontWeight: 'normal'}}> ({field})</Box>}
            </Typography>
        </Box>
        {open && <Box sx={{px: 1.5, pb: 1.5}}>{content}</Box>}
    </Box>
}

export default function TypeHistory({type, _id, fieldDefs, getCurrent}) {
    const [entries, setEntries] = React.useState(null)
    const [total, setTotal] = React.useState(0)
    const [error, setError] = React.useState(null)
    const [selected, setSelected] = React.useState(0)
    const [compareMode, setCompareMode] = React.useState('previous')
    // opened fields, they stay open when another entry is selected
    const [openFields, setOpenFields] = React.useState({})
    const [loadingMore, setLoadingMore] = React.useState(false)

    const loadEntries = React.useCallback(async (offset) => {
        const res = await client.query({
            fetchPolicy: 'no-cache',
            query: 'query historys($sort:String,$filter:String,$limit:Int,$offset:Int){historys(sort:$sort,filter:$filter,limit:$limit,offset:$offset){total results{_id action meta createdBy{username}}}}',
            variables: {sort: '_id desc', limit: PAGE_SIZE, offset, filter: `data._id==${_id}`}
        })
        const historys = res && res.data && res.data.historys
        return {
            total: historys ? historys.total : 0,
            results: ((historys && historys.results) || []).filter(e => e.action !== 'delete').map(parseEntry)
        }
    }, [_id])

    React.useEffect(() => {
        let cancelled = false
        setError(null)
        loadEntries(0).then(({results, total}) => {
            if (!cancelled) {
                setEntries(results)
                setTotal(total)
                setSelected(0)
            }
        }).catch(e => !cancelled && setError(e.message))
        return () => {
            cancelled = true
        }
    }, [loadEntries])

    const loadMore = () => {
        setLoadingMore(true)
        loadEntries(entries.length).then(({results}) => {
            setEntries(entries.concat(results))
            setLoadingMore(false)
        }).catch(e => {
            setError(e.message)
            setLoadingMore(false)
        })
    }

    const entry = entries && entries[selected]

    const toggleField = (field) => setOpenFields(open => Object.assign({}, open, {[field]: !open[field]}))

    if (error) {
        return <Typography color="error">{_t('TypeHistory.error')}: {error}</Typography>
    }
    if (!entries) {
        return <LinearProgress/>
    }
    if (entries.length === 0) {
        return <Typography sx={{opacity: 0.7}}>{_t('TypeHistory.noEntries')}</Typography>
    }

    const fieldLabel = (field) => {
        const def = fieldDefs && fieldDefs[field]
        return def && def.label ? def.label : field
    }

    const allOpen = entry.fields.length > 0 && entry.fields.every(f => openFields[f])
    const diffs = entry.fields.length === 0 ?
        <Typography sx={{opacity: 0.7}}>{_t('TypeHistory.noFields')}</Typography> :
        entry.fields.map(field => <FieldRow key={field} entries={entries} index={selected} field={field}
                                            label={fieldLabel(field)} fieldDef={fieldDefs && fieldDefs[field]}
                                            compareMode={compareMode} getCurrent={getCurrent}
                                            open={!!openFields[field]} onToggle={toggleField}/>)

    return <Box sx={{display: 'flex', gap: 3, flexWrap: {xs: 'wrap', md: 'nowrap'}, alignItems: 'flex-start'}}>
        <Box sx={{
            width: {xs: '100%', md: '18rem'}, flexShrink: 0, maxHeight: {xs: '30vh', md: '65vh'}, overflow: 'auto',
            borderRight: {md: '1px solid rgba(0,0,0,0.12)'}, pr: {md: 1}
        }}>
            <Typography variant="caption" sx={{display: 'block', mb: 1, opacity: 0.7}}>
                {_t('TypeHistory.count', {count: total})}
            </Typography>
            {entries.map((e, i) => <Box key={e._id}
                                        onClick={() => setSelected(i)}
                                        sx={{
                                            p: 1, mb: 0.5, borderRadius: 1, cursor: 'pointer',
                                            bgcolor: i === selected ? 'action.selected' : 'transparent',
                                            '&:hover': {bgcolor: i === selected ? 'action.selected' : 'action.hover'}
                                        }}>
                <Typography variant="body2" sx={{fontWeight: i === selected ? 600 : 400}}>
                    {formatEntryTime(e._id)}
                </Typography>
                <Typography variant="caption" sx={{display: 'block', opacity: 0.7}}>{e.username}</Typography>
                <Box sx={{mt: 0.5}}>
                    {e.fields.slice(0, 4).map(f => <Chip key={f} size="small" label={fieldLabel(f)}
                                                         sx={{height: '1.25rem', fontSize: '0.7rem', mr: 0.5, mb: 0.5}}/>)}
                    {e.fields.length > 4 && <Typography variant="caption" sx={{opacity: 0.7}}>+{e.fields.length - 4}</Typography>}
                </Box>
            </Box>)}
            {entries.length < total &&
            <Button size="small" disabled={loadingMore} onClick={loadMore} sx={{mt: 1}}>
                {_t('TypeHistory.loadMore')}
            </Button>}
        </Box>
        <Box sx={{flex: 1, minWidth: 0}}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap'}}>
                <Typography variant="subtitle1" sx={{flex: 1}}>
                    {formatEntryTime(entry._id)} · {entry.username}
                </Typography>
                {entry.fields.length > 1 && <Button size="small" onClick={() => {
                    const open = Object.assign({}, openFields)
                    entry.fields.forEach(f => open[f] = !allOpen)
                    setOpenFields(open)
                }}>{_t(allOpen ? 'TypeHistory.collapseAll' : 'TypeHistory.expandAll')}</Button>}
                <SimpleSelect label={_t('TypeHistory.compareWith')}
                              value={compareMode}
                              style={{marginTop: 0, marginBottom: 0, minWidth: '14rem'}}
                              onChange={(e) => setCompareMode(e.target.value)}
                              items={[{value: 'previous', name: _t('TypeHistory.compare.previous')},
                                  {value: 'current', name: _t('TypeHistory.compare.current')}]}/>
            </Box>
            {diffs}
        </Box>
    </Box>
}
