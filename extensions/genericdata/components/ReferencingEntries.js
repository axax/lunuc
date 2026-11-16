import React, {useEffect, useState, useCallback} from 'react'
import {Box, Button, LinearProgress, Typography} from 'ui/admin'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import {client} from 'client/middleware/graphql'
import {propertyByPath} from '../../../client/util/json.mjs'

/*
 * Form field (uitype "referencingEntries") of a GenericData definition: lists the entries of another
 * definition that reference the entry being edited. Nothing is saved.
 *
 * The component is only mounted when its tab is opened (SimpleTabPanel renders the active tab only),
 * so the entries are loaded on demand.
 *
 * Field options:
 *   genericType     definition of the referencing entries (e.g. "ThalGeschaeftsberichtBeitrag")
 *   referenceField  field of genericType that holds the reference (e.g. "bereich")
 *   columns         optional [{field, label}], default: columns of genericType without referenceField
 *   sortField       optional, default: sortField of genericType
 *   limit           optional, default 500
 */

const OBJECT_ID = /^[0-9a-f]{24}$/

const parse = v => {
    if (typeof v === 'string') {
        try {
            return JSON.parse(v)
        } catch (e) {
            return null
        }
    }
    return v
}

const stripHtml = v => typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() : v

const pickerFieldsOf = field => {
    const pf = field && field.pickerField
    return (Array.isArray(pf) ? pf : (pf ? [pf] : ['name', 'title'])).filter(f => f.indexOf('.') < 0)
}

const labelOfData = (data, field) => {
    if (!data) return ''
    const parts = pickerFieldsOf(field).map(f => stripHtml(data[f])).filter(Boolean)
    return parts.length ? parts.join(' ') : (stripHtml(data.name || data.title) || '')
}

const idOf = v => v && typeof v === 'object' ? v._id : v

// cache of labels of referenced entries (e.g. Bericht)
const refLabels = {}

const loadRefLabels = async (ids, fieldsById) => {
    const missing = Array.from(new Set(ids.filter(id => id && OBJECT_ID.test(id) && refLabels[id] === undefined)))
    if (!missing.length) return
    const res = await client.query({
        fetchPolicy: 'network-only',
        query: 'query genericDatas($filter:String,$limit:Int){genericDatas(filter:$filter,limit:$limit){results{_id data}}}',
        variables: {limit: missing.length, filter: missing.map(id => `_id==${id}`).join(' || ')}
    })
    const results = (res && res.data && res.data.genericDatas && res.data.genericDatas.results) || []
    results.forEach(r => {
        refLabels[r._id] = labelOfData(parse(r.data), fieldsById[r._id]) || r._id
    })
    missing.forEach(id => {
        if (refLabels[id] === undefined) refLabels[id] = id
    })
}

const adminUrl = (genericType, params) =>
    `/admin/types/GenericData?fixType=GenericData&meta=${encodeURIComponent(genericType)}` +
    Object.keys(params).map(k => `&${k}=${encodeURIComponent(params[k])}`).join('')

const ReferencingEntries = ({field, ownerId}) => {
    const {genericType, referenceField, limit = 500} = field
    const [state, setState] = useState({loading: true})

    const load = useCallback(async () => {
        if (!ownerId || !genericType || !referenceField) {
            setState({loading: false, entries: []})
            return
        }
        setState(s => ({...s, loading: true, error: null}))
        try {
            const [defRes, res] = await Promise.all([
                client.query({
                    fetchPolicy: 'cache-first',
                    query: 'query genericDataDefinitions($filter:String){genericDataDefinitions(filter:$filter){results{_id name structure}}}',
                    variables: {filter: `name==${genericType}`}
                }),
                client.query({
                    fetchPolicy: 'network-only',
                    query: 'query genericDatas($filter:String,$limit:Int,$meta:String){genericDatas(filter:$filter,limit:$limit,meta:$meta){total results{_id data}}}',
                    variables: {
                        meta: genericType,
                        limit,
                        filter: `definition.name==${genericType} && data.${referenceField}==${ownerId}`
                    }
                })
            ])

            const def = defRes.data && defRes.data.genericDataDefinitions && defRes.data.genericDataDefinitions.results[0]
            const structure = (def && parse(def.structure)) || {}
            const structFields = structure.fields || []
            const fieldByName = name => structFields.find(f => f.name === name)

            const columns = (field.columns || structure.columns || [{field: structure.pickerField || 'name'}])
                .filter(c => c.field !== referenceField)
                .map(c => ({...c, def: fieldByName(c.field)}))

            const sortField = field.sortField || structure.sortField

            const results = (res.data && res.data.genericDatas && res.data.genericDatas.results) || []
            const entries = results.map(r => ({_id: r._id, data: parse(r.data) || {}}))

            // labels of references in the columns (e.g. Bericht)
            const refIds = [], fieldsById = {}
            entries.forEach(e => columns.forEach(c => {
                if (c.def && c.def.type === 'GenericData') {
                    const v = e.data[c.field]
                    ;(Array.isArray(v) ? v : [v]).forEach(item => {
                        if (item && typeof item === 'object' && item.data) {
                            refLabels[item._id] = labelOfData(item.data, c.def) || item._id
                        } else {
                            const id = idOf(item)
                            if (id) {
                                refIds.push(String(id))
                                fieldsById[String(id)] = c.def
                            }
                        }
                    })
                }
            }))
            await loadRefLabels(refIds, fieldsById)

            const cellValue = (e, c) => {
                const v = propertyByPath(c.field, e.data)
                if (c.def && c.def.type === 'GenericData') {
                    return (Array.isArray(v) ? v : [v]).map(idOf).filter(Boolean).map(id => refLabels[id] || id).join(', ')
                }
                if (typeof v === 'boolean') return v ? '✓' : ''
                if (c.def && c.def.enum) {
                    const opt = c.def.enum.find(o => o.value === v)
                    if (opt) return opt.name
                }
                if (v && typeof v === 'object') return ''
                return stripHtml(v)
            }

            const rows = entries.map(e => ({
                _id: e._id,
                sortValue: sortField ? (parseFloat(e.data[sortField]) || 0) : 0,
                cells: columns.map(c => cellValue(e, c))
            }))

            // group by the first column (e.g. Bericht, newest first), then by sortField
            rows.sort((a, b) => {
                const g = String(b.cells[0] || '').localeCompare(String(a.cells[0] || ''), undefined, {numeric: true})
                return g !== 0 ? g : a.sortValue - b.sortValue
            })

            setState({loading: false, columns, rows, total: res.data.genericDatas.total})
        } catch (e) {
            setState({loading: false, error: e.message})
        }
    }, [ownerId, genericType, referenceField, limit])

    useEffect(() => {
        load()
    }, [load])

    if (!ownerId) {
        return <Typography variant="body2" color="text.secondary">Bitte zuerst speichern.</Typography>
    }

    const listUrl = adminUrl(genericType, {
        title: field.label || genericType,
        baseFilter: `data.${referenceField}==${ownerId}`
    })

    const {loading, error, columns = [], rows = [], total} = state

    return <Box sx={{width: '100%'}}>
        <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1}}>
            <Typography variant="body2" color="text.secondary">
                {loading ? 'Lade…' : `${rows.length}${total > rows.length ? ' von ' + total : ''} Einträge`}
            </Typography>
            <Box sx={{display: 'flex', gap: 1}}>
                <Button size="small" onClick={load} disabled={loading}>Aktualisieren</Button>
                <Button size="small" variant="outlined" onClick={() => window.open(listUrl)}>In Liste öffnen / neu erstellen</Button>
            </Box>
        </Box>
        {loading && <LinearProgress/>}
        {error && <Typography color="error">{error}</Typography>}
        {!loading && !error && rows.length === 0 &&
            <Typography variant="body2" sx={{mt: 2}}>Keine verknüpften Einträge.</Typography>}
        {!error && rows.length > 0 && <Table size="small">
            <TableHead>
                <TableRow>
                    {columns.map(c => <TableCell key={c.field}>{c.label || c.field}</TableCell>)}
                </TableRow>
            </TableHead>
            <TableBody>
                {rows.map(r => <TableRow key={r._id} hover sx={{cursor: 'pointer'}}
                                         title="In neuem Fenster bearbeiten"
                                         onClick={() => window.open(adminUrl(genericType, {open: r._id}))}>
                    {r.cells.map((v, i) => <TableCell key={i}>{v}</TableCell>)}
                </TableRow>)}
            </TableBody>
        </Table>}
    </Box>
}

export default ReferencingEntries
