import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import React from 'react'
import {
    Typography,
    SimpleSelect,
    SimpleDialog,
    Pagination,
    Stack,
    SimpleTab,
    SimpleTabPanel,
    SimpleTabs,
    Slider,
    Chip,
    Box,
    Button,
    LinearProgress
} from 'ui/admin'
import Async from '../../../client/components/Async'
import {_t} from '../../../util/i18n.mjs'
import JsonDomIFrame from './JsonDomIFrame'
import {
    REVISION_FIELDS,
    CONTENT_FIELDS,
    parseEntryMeta,
    groupSessions,
    loadStates,
    findFieldChanges,
    summarizeChange,
    resolvedDataForState,
    relativeTime
} from '../util/revisionUtil'

const CodeEditor = (props) => <Async {...props}
                                     load={() => import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

// newest entries that are loaded for one page (only the meta data, the content is loaded on demand)
const ENTRY_LIMIT = 1000

const CODE_TYPES = {template: 'json', dataResolver: 'json', style: 'css', script: 'js', serverScript: 'js'}

const fieldLabel = (field) => _t('CmsRevision.field.' + field)

const summaryLabels = () => ({
    elementsAdded: (count) => _t('CmsRevision.elementsAdded', {count}),
    elementsRemoved: (count) => _t('CmsRevision.elementsRemoved', {count}),
    textsMoved: _t('CmsRevision.textsMoved'),
    properties: _t('CmsRevision.properties'),
    fieldChanged: (field) => _t('CmsRevision.fieldChanged', {field: fieldLabel(field)}),
    firstRecorded: (field) => _t('CmsRevision.firstRecorded', {field: fieldLabel(field)}),
    // "Button «eine Stelle»: Link, CSS class changed"
    propertyChanged: (element, props) => {
        const type = element.key ? _t('elements.key.' + element.key, null, element.key) : element.tag
        const name = type + (element.text ? ' «' + element.text + '»' : '')
        return _t('CmsRevision.propertyChanged', {
            element: name,
            props: props.map(prop => _t('CmsRevision.prop.' + prop, null, prop)).join(', ')
        })
    },
    moreElements: (count) => _t('CmsRevision.moreElements', {count})
})

const formatTime = (time, options) => Util.getDateTimeFormat(options).format(new Date(time))

const isSameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString()

// "heute 14:05-14:32" / "12.10.2026 14:05-14:32"
const formatSpan = (start, end) => {
    const from = formatTime(start)
    if (start === end) {
        return from
    }
    if (isSameDay(start, end)) {
        return from + '–' + formatTime(end, {year: undefined, month: undefined, day: undefined})
    }
    return from + ' – ' + formatTime(end)
}

// reverted: several saves that end with the state they started with
const TextChanges = ({summary, max = 2, reverted}) => {
    if (!summary) {
        return null
    }
    const items = summary.texts.slice(0, max).map((t, i) =>
        <Box key={'t' + i} component="span" sx={{display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            <Box component="span" sx={{textDecoration: 'line-through', opacity: 0.6}}>„{t.from}“</Box>
            {' → '}„{t.to}“
        </Box>)
    if (summary.texts.length > max) {
        items.push(<Box key="more" component="span" sx={{display: 'block', opacity: 0.6}}>
            {_t('CmsRevision.moreTexts', {count: summary.texts.length - max})}</Box>)
    }
    summary.lines.forEach((line, i) => items.push(<Box key={'l' + i} component="span" sx={{display: 'block'}}>{line}</Box>))
    if (items.length === 0) {
        items.push(<Box key="none" component="span" sx={{display: 'block', opacity: 0.6}}>
            {_t(reverted ? 'CmsRevision.reverted' : 'CmsRevision.noChange')}</Box>)
    }
    return items
}

const FieldChips = ({fields}) => fields.map(field => <Chip key={field} size="small" label={fieldLabel(field)}
                                                           sx={{height: '1.25rem', fontSize: '0.7rem', mr: 0.5}}/>)


function CmsRevisionDialog(props) {
    const {
        entries, filtered, position, setPosition, cmsPage, canMangeCmsTemplate, allowedFields, shownFields,
        getCurrentValues, onRestore, onClose, ...rest
    } = props

    const [tab, setTab] = React.useState(0)
    const [compareMode, setCompareMode] = React.useState('previous')
    const [codeField, setCodeField] = React.useState(null)
    const [loaded, setLoaded] = React.useState(null)
    const [error, setError] = React.useState(null)
    const [confirm, setConfirm] = React.useState(false)
    // the slider moves freely while dragging, the version is only loaded when it is released
    const [sliderValue, setSliderValue] = React.useState(position)
    React.useEffect(() => setSliderValue(position), [position])

    const item = filtered[position]
    const fullIndex = item.index

    React.useEffect(() => {
        let cancelled = false
        setError(null)
        const indices = fullIndex > 0 ? [fullIndex, fullIndex - 1] : [fullIndex]
        loadStates(entries, indices, cmsPage).then(states => {
            if (!cancelled) {
                setLoaded({fullIndex, state: states[0], prev: states[1] || null})
            }
        }).catch(e => {
            if (!cancelled) setError(e.message)
        })
        return () => {
            cancelled = true
        }
    }, [fullIndex, entries])

    // arrow keys step through the versions (not while typing or inside the code editor / slider)
    React.useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            const target = e.target
            if (target && target.closest && target.closest('input,textarea,[contenteditable],.cm-editor,.MuiSlider-root')) return
            e.preventDefault()
            setConfirm(false)
            setPosition(p => Math.max(0, Math.min(filtered.length - 1, p + (e.key === 'ArrowLeft' ? -1 : 1))))
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [filtered.length])

    const ready = loaded && loaded.fullIndex === fullIndex
    const state = ready ? loaded.state : (loaded ? loaded.state : null)
    const prev = ready ? loaded.prev : null

    const current = React.useMemo(() => getCurrentValues(), [ready, fullIndex])

    const summary = React.useMemo(() => ready && prev ? summarizeChange(prev, state, summaryLabels(), shownFields) : null, [ready, fullIndex])

    const restoreFields = state ? allowedFields.filter(field => state[field] !== undefined && state[field] !== current[field]) : []

    const jsonDom = React.useMemo(() => state ? {
        history: {
            listen: () => {
            },
            push: () => {
            }
        },
        location: {},
        template: state.template,
        script: state.script,
        style: state.style,
        ssrStyle: cmsPage.ssrStyle,
        resolvedData: resolvedDataForState(state, cmsPage),
        parseResolvedData: cmsPage.parseResolvedData,
        resources: cmsPage.resources,
        title: cmsPage.name,
        dynamic: true,
        editMode: false,
        inEditor: false,
        ...rest
    } : null, [state])

    const compareState = compareMode === 'current' ? current : prev
    const codeFields = state && compareState ? allowedFields.filter(f => state[f] !== compareState[f]) : []
    const activeCodeField = codeFields.indexOf(codeField) >= 0 ? codeField : (codeFields[0] || allowedFields[0])

    const time = item.time
    const marks = []
    filtered.forEach((entry, i) => {
        if (i === 0 || !isSameDay(filtered[i - 1].time, entry.time)) {
            marks.push({value: i, label: formatTime(entry.time, {hour: undefined, minute: undefined, second: undefined})})
        }
    })

    const actions = confirm ? [
        {key: 'cancelRestore', label: _t('CmsRevision.cancel')},
        {key: 'confirmRestore', label: _t('CmsRevision.confirmYes'), type: 'secondary', variant: 'contained', autoFocus: true}
    ] : [
        {key: 'restore', label: _t('CmsRevisionDialog.restore'), type: 'secondary', disabled: !ready || restoreFields.length === 0},
        {key: 'ok', label: _t('CmsRevisionDialog.close'), type: 'primary'}
    ]

    return <SimpleDialog fullWidth={true}
                         maxWidth="lg"
                         fullScreen={true}
                         key="revisionDialog"
                         open={true}
                         onClose={(action) => {
                             const key = action && action.key
                             if (key === 'restore') {
                                 setConfirm(true)
                             } else if (key === 'cancelRestore') {
                                 setConfirm(false)
                             } else if (key === 'confirmRestore') {
                                 const values = {}
                                 restoreFields.forEach(field => values[field] = state[field])
                                 onRestore(values)
                                 onClose()
                             } else {
                                 onClose()
                             }
                         }}
                         actions={actions}
                         title={_t('CmsRevisionDialog.title', {username: item.username, date: formatTime(time)})}>

        <Box sx={{display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1, flexWrap: 'wrap'}}>
            <Box sx={{flex: '1 1 20rem', minWidth: 0, fontSize: '0.875rem'}}>
                <Box sx={{mb: 0.5}}>
                    <FieldChips fields={summary ? summary.fields : item.fields}/>
                    <Typography component="span" variant="caption" sx={{opacity: 0.7}}>
                        {_t('CmsRevision.version', {index: position + 1, total: filtered.length})}
                        {' · '}{relativeTime(time)}
                        {ready && restoreFields.length === 0 ? ' · ' + _t('CmsRevision.sameAsCurrent') : ''}
                    </Typography>
                </Box>
                {fullIndex === 0 ? <Box sx={{opacity: 0.6}}>{_t('CmsRevision.oldest')}</Box> :
                    <TextChanges summary={summary} max={4}/>}
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" disabled={position === 0}
                        onClick={() => {
                            setConfirm(false)
                            setPosition(position - 1)
                        }}>‹ {_t('CmsRevision.older')}</Button>
                <Button size="small" variant="outlined" disabled={position === filtered.length - 1}
                        onClick={() => {
                            setConfirm(false)
                            setPosition(position + 1)
                        }}>{_t('CmsRevision.newer')} ›</Button>
            </Stack>
        </Box>

        {confirm && <Box sx={{mb: 1, p: 1.5, borderRadius: 1, bgcolor: 'warning.light', color: 'warning.contrastText', fontSize: '0.875rem'}}>
            {_t('CmsRevision.confirmRestore', {
                date: formatTime(time),
                fields: restoreFields.map(fieldLabel).join(', ')
            })}
        </Box>}

        {filtered.length > 1 && <Box sx={{px: 2, mb: 1}}>
            <Slider value={sliderValue}
                    min={0}
                    max={filtered.length - 1}
                    step={1}
                    marks={marks}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(value) => filtered[value] ? formatTime(filtered[value].time) + ' · ' + filtered[value].username : ''}
                    onChange={(e, value) => setSliderValue(value)}
                    onChangeCommitted={(e, value) => {
                        setConfirm(false)
                        setPosition(value)
                    }}/>
        </Box>}

        {canMangeCmsTemplate && <SimpleTabs style={{width: '100%'}} value={tab} onChange={(e, value) => setTab(value)}>
            <SimpleTab key="tabView" label={_t('CmsRevision.view')}/>
            <SimpleTab key="tabCode" label={_t('CmsRevision.code')}/>
        </SimpleTabs>}

        <Box sx={{height: '0.25rem'}}>{(!ready && !error) && <LinearProgress/>}</Box>
        {error && <Typography color="error">{_t('CmsRevision.error', {message: error})}</Typography>}

        <SimpleTabPanel style={{border: 'solid 1px rgba(234,234,234)'}} key="tabPanelView" value={tab} index={0}>
            {jsonDom && <JsonDomIFrame style={{border: 0, width: '100%', height: 'calc(100vh - 22rem)', minHeight: '20rem'}}
                                       jsonDom={jsonDom}/>}
        </SimpleTabPanel>

        {canMangeCmsTemplate && <SimpleTabPanel key="tabPanelCode" value={tab} index={1}>
            <Stack direction="row" spacing={2} sx={{mb: 1, mt: 1}}>
                <SimpleSelect label={_t('CmsRevision.area')}
                              value={activeCodeField}
                              style={{marginTop: 0, marginBottom: 0, minWidth: '12rem'}}
                              onChange={(e) => setCodeField(e.target.value)}
                              items={allowedFields.map(f => ({
                                  value: f,
                                  name: fieldLabel(f) + (codeFields.indexOf(f) >= 0 ? ' •' : '')
                              }))}/>
                <SimpleSelect label={_t('CmsRevision.compareWith')}
                              value={compareMode}
                              style={{marginTop: 0, marginBottom: 0, minWidth: '12rem'}}
                              onChange={(e) => setCompareMode(e.target.value)}
                              items={[{value: 'previous', name: _t('CmsRevision.compare.previous')},
                                  {value: 'current', name: _t('CmsRevision.compare.current')}]}/>
            </Stack>
            {state && <CodeEditor key={activeCodeField + compareMode + fullIndex}
                                  mergeView={true}
                                  style={{border: 0, width: '100%', height: 'calc(100vh - 25rem)', overflow: 'auto'}}
                                  mergeValue={(compareState && compareState[activeCodeField]) || ''}
                                  lineNumbers type={CODE_TYPES[activeCodeField]}
                                  readOnly={true}>{state[activeCodeField] || ''}</CodeEditor>}
        </SimpleTabPanel>}
    </SimpleDialog>
}

export default function CmsRevision(props) {
    const {historyLimit = 10, cmsPage, canMangeCmsTemplate, getCurrentValues, onRestore, ...rest} = props

    const [entries, setEntries] = React.useState(null)
    const [error, setError] = React.useState(null)
    const [typeFilter, setTypeFilter] = React.useState('all')
    const [page, setPage] = React.useState(1)
    const [dialogPosition, setDialogPosition] = React.useState(null)
    const [summaries, setSummaries] = React.useState({})
    // per type filter: which saves really changed the field {field: {entryId: bool}}
    const [fieldChanges, setFieldChanges] = React.useState({})

    const pageId = cmsPage && cmsPage._id
    const modifiedAt = cmsPage && cmsPage.modifiedAt

    // reload after a save, so the new version shows up. Debounced: while typing the page is saved every
    // ~1.5 s, the list is only reloaded after a pause (the first load right away)
    const loadedFor = React.useRef(null)
    React.useEffect(() => {
        if (!pageId) return
        let cancelled = false
        const load = () => client.query({
            fetchPolicy: 'network-only',
            query: 'query historys($sort:String,$filter:String,$limit:Int){historys(sort:$sort,filter:$filter,limit:$limit){results{_id meta createdBy{username}}}}',
            variables: {sort: '_id desc', limit: ENTRY_LIMIT, filter: `data._id==${pageId}`}
        }).then(res => {
            if (cancelled) return
            const results = (res && res.data && res.data.historys && res.data.historys.results) || []
            setEntries(results.map(parseEntryMeta).reverse())
            setError(null)
        }).catch(e => {
            if (!cancelled) setError(e.message)
        })
        // another page: right away
        const timer = setTimeout(load, loadedFor.current === pageId ? 3000 : 0)
        loadedFor.current = pageId
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [pageId, modifiedAt])

    const allowedFields = canMangeCmsTemplate ? REVISION_FIELDS : CONTENT_FIELDS
    const shownFields = typeFilter === 'all' ? allowedFields : [typeFilter]

    // a type filter only shows saves that really changed that field (saves also contain unchanged fields)
    React.useEffect(() => {
        if (!entries || typeFilter === 'all') return
        let cancelled = false
        findFieldChanges(pageId, typeFilter, ENTRY_LIMIT).then(changes => {
            if (!cancelled) setFieldChanges(c => ({...c, [typeFilter]: changes}))
        }).catch(e => {
            if (!cancelled) setError(e.message)
        })
        return () => {
            cancelled = true
        }
    }, [entries, typeFilter])

    const changes = typeFilter === 'all' ? null : fieldChanges[typeFilter]
    const checkingChanges = typeFilter !== 'all' && !changes

    // entries of the selected type, with the position in the complete list (needed to rebuild the state)
    const filtered = React.useMemo(() => {
        if (checkingChanges) return []
        return (entries || [])
            .map((entry, index) => ({
                ...entry,
                index,
                fields: changes ? [typeFilter] : entry.fields.filter(f => allowedFields.indexOf(f) >= 0)
            }))
            .filter(entry => changes ? changes[entry._id] === true : entry.fields.some(f => shownFields.indexOf(f) >= 0))
    }, [entries, typeFilter, changes, canMangeCmsTemplate])

    const sessions = React.useMemo(() => groupSessions(filtered), [filtered])
    const pageCount = Math.ceil(sessions.length / historyLimit)
    const pageSessions = sessions.slice((page - 1) * historyLimit, page * historyLimit)

    // summary per session: state before the first save compared to the state after the last save
    React.useEffect(() => {
        if (!entries || pageSessions.length === 0) return
        let cancelled = false
        const pairs = pageSessions.map(s => ({
            key: typeFilter + ':' + filtered[s.first].index + '-' + filtered[s.last].index,
            from: filtered[s.first].index - 1,
            to: filtered[s.last].index
        })).filter(p => p.from >= 0 && !summaries[p.key])
        if (pairs.length === 0) return
        const indices = []
        pairs.forEach(p => [p.from, p.to].forEach(i => indices.indexOf(i) < 0 && indices.push(i)))
        loadStates(entries, indices, cmsPage).then(states => {
            if (cancelled) return
            const byIndex = {}
            indices.forEach((index, i) => byIndex[index] = states[i])
            const labels = summaryLabels()
            const next = {}
            pairs.forEach(p => {
                next[p.key] = summarizeChange(byIndex[p.from], byIndex[p.to], labels, shownFields)
            })
            setSummaries(s => ({...s, ...next}))
        }).catch(e => console.warn('revision summary failed', e))
        return () => {
            cancelled = true
        }
    }, [entries, page, filtered])

    if (!cmsPage) {
        return null
    }

    let content
    if (error) {
        content = <p>{_t('CmsRevision.error', {message: error})}</p>
    } else if (!entries || checkingChanges) {
        content = <p>{_t('CmsRevision.loading')}</p>
    } else if (sessions.length === 0) {
        content = <p>{_t('CmsRevision.noRevisionEntries')}</p>
    } else {
        content = <>
            <Box sx={{mt: 1}}>
                {pageSessions.map(session => {
                    const first = filtered[session.first], last = filtered[session.last]
                    const key = typeFilter + ':' + first.index + '-' + last.index
                    const summary = summaries[key]
                    return <Box key={key}
                                role="button"
                                tabIndex={0}
                                onClick={() => setDialogPosition(session.last)}
                                onKeyDown={(e) => e.key === 'Enter' && setDialogPosition(session.last)}
                                sx={{
                                    px: 1, py: 0.75, mb: 0.5, borderRadius: 1, cursor: 'pointer', fontSize: '0.8125rem',
                                    '&:hover': {bgcolor: 'action.hover'}
                                }}>
                        <Box sx={{display: 'flex', justifyContent: 'space-between', gap: 1}}>
                            <Box component="strong" sx={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                {session.username}</Box>
                            <Box component="span" sx={{opacity: 0.7, whiteSpace: 'nowrap'}}>
                                {relativeTime(session.end) || formatTime(session.end, {hour: undefined, minute: undefined, second: undefined})}</Box>
                        </Box>
                        <Box sx={{opacity: 0.7, fontSize: '0.75rem', mb: 0.25}}>
                            {formatSpan(session.start, session.end)}
                            {session.count > 1 ? ' · ' + _t('CmsRevision.savedTimes', {count: session.count}) : ''}
                        </Box>
                        <Box sx={{mb: 0.25}}><FieldChips fields={summary ? summary.fields : session.fields}/></Box>
                        <Box sx={{fontSize: '0.75rem'}}>
                            {first.index === 0 ? <Box component="span" sx={{opacity: 0.6}}>{_t('CmsRevision.oldest')}</Box> :
                                <TextChanges summary={summary} reverted={session.count > 1}/>}
                        </Box>
                    </Box>
                })}
            </Box>
            {pageCount > 1 && <Stack spacing={2} justifyContent="center" alignItems="center">
                <Pagination size="small"
                            page={page}
                            onChange={(e, p) => setPage(p)}
                            count={pageCount}/>
            </Stack>}
        </>
    }

    return <>
        {canMangeCmsTemplate && <SimpleSelect
            fullWidth={true}
            label={_t('CmsRevision.type')}
            value={typeFilter}
            style={{marginBottom: 0, marginTop: 0}}
            onChange={(e) => {
                setPage(1)
                setTypeFilter(e.target.value)
            }}
            items={[{name: _t('CmsRevision.all'), value: 'all'},
                ...REVISION_FIELDS.map(field => ({name: fieldLabel(field), value: field}))]}
        />}
        {content}
        {dialogPosition !== null && filtered[dialogPosition] ?
            <CmsRevisionDialog entries={entries}
                               filtered={filtered}
                               position={dialogPosition}
                               setPosition={setDialogPosition}
                               cmsPage={cmsPage}
                               canMangeCmsTemplate={canMangeCmsTemplate}
                               allowedFields={allowedFields}
                               shownFields={shownFields}
                               getCurrentValues={getCurrentValues}
                               onRestore={onRestore}
                               onClose={() => setDialogPosition(null)}
                               {...rest}/> : null}
    </>
}
