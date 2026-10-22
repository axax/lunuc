import React from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import {
    TextField,
    SimpleSwitch,
    Chip,
    Typography,
    Box,
    Stack,
    LinearProgress,
    Paper,
    Tooltip
} from 'ui/admin'
import FileDrop from '../../../client/components/FileDrop'
import {client} from '../../../client/middleware/graphql'
import {getTypeQueries} from '../../../util/types.mjs'
import {_t} from '../../../util/i18n.mjs'

const SETTINGS_KEY = 'StaticFile.multiUpload.settings'
const DEFAULT_PREFIX = 'icons/'
const ACCEPT = 'image/svg+xml,text/*,application/json,application/javascript,application/xml'

const MIME_BY_EXT = {
    svg: 'image/svg+xml',
    css: 'text/css',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    html: 'text/html',
    htm: 'text/html',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown'
}

const STATUS_COLOR = {
    pending: 'default',
    added: 'success',
    replaced: 'info',
    renamed: 'warning',
    error: 'error'
}

const loadSettings = () => {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY))
        if (s && typeof s === 'object') {
            return s
        }
    } catch (e) {
    }
    return {}
}

const saveSettings = (settings) => {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch (e) {
    }
}

/* "icons" -> "icons/", "/icons/" -> "icons/", "" -> "" */
export const normalizePrefix = (prefix) => {
    let p = (prefix || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/')
    if (p && !p.endsWith('/')) {
        p += '/'
    }
    return p
}

const guessMimeType = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    return MIME_BY_EXT[ext] || file.type || 'text/plain'
}

/* finds the next free name: quote.svg -> quote-1.svg -> quote-2.svg ... */
export const nextFreeName = (name, existing) => {
    if (!existing.has(name)) {
        return name
    }
    const slash = name.lastIndexOf('/')
    const dir = name.substring(0, slash + 1)
    const file = name.substring(slash + 1)
    const dot = file.lastIndexOf('.')
    const base = dot > 0 ? file.substring(0, dot) : file
    const ext = dot > 0 ? file.substring(dot) : ''
    let i = 1
    let candidate
    do {
        candidate = `${dir}${base}-${i}${ext}`
        i++
    } while (existing.has(candidate))
    return candidate
}

const firstResult = (response) => {
    const data = response?.data
    return data ? Object.values(data)[0] : null
}

const MultiUpload = ({type = 'StaticFile', onUploaded}) => {
    const initial = React.useMemo(loadSettings, [])
    const [prefix, setPrefix] = React.useState(initial.prefix !== undefined ? initial.prefix : DEFAULT_PREFIX)
    const [overwrite, setOverwrite] = React.useState(initial.overwrite !== undefined ? !!initial.overwrite : true)
    const [prefixOptions, setPrefixOptions] = React.useState([])
    const [entries, setEntries] = React.useState([])

    // map of all existing names -> _id (kept up to date while uploading)
    const existingRef = React.useRef(null)
    const queueRef = React.useRef(Promise.resolve())
    const settingsRef = React.useRef({prefix, overwrite})
    settingsRef.current = {prefix: normalizePrefix(prefix), overwrite}

    React.useEffect(() => {
        saveSettings({prefix, overwrite})
    }, [prefix, overwrite])

    const loadExisting = React.useCallback(() => {
        return client.query({
            fetchPolicy: 'network-only',
            query: `query staticFiles($limit:Int){staticFiles(limit:$limit){results{_id name}}}`,
            variables: {limit: 100000}
        }).then(response => {
            const map = new Map()
            const prefixes = new Set([DEFAULT_PREFIX])
            ;(response?.data?.staticFiles?.results || []).forEach(item => {
                if (item?.name) {
                    map.set(item.name, item._id)
                    const parts = item.name.split('/')
                    for (let i = 1; i < parts.length; i++) {
                        prefixes.add(parts.slice(0, i).join('/') + '/')
                    }
                }
            })
            existingRef.current = map
            setPrefixOptions(Array.from(prefixes).sort())
            return map
        })
    }, [])

    React.useEffect(() => {
        loadExisting().catch(() => {
            existingRef.current = null
        })
    }, [loadExisting])

    const updateEntry = (id, data) => {
        setEntries(list => list.map(e => e.id === id ? {...e, ...data} : e))
    }

    const processFile = async (entryId, file, content) => {
        const queries = getTypeQueries(type)
        const {prefix, overwrite} = settingsRef.current
        try {
            const existing = existingRef.current || await loadExisting()
            const targetName = `${prefix}${file.name}`
            const existingId = existing.get(targetName)

            if (existingId && overwrite) {
                const res = await client.mutate({
                    mutation: queries.update,
                    variables: {_id: existingId, content}
                })
                if (res?.errors?.length) {
                    throw new Error(res.errors[0].message)
                }
                updateEntry(entryId, {status: 'replaced', target: targetName})
            } else {
                const finalName = existingId ? nextFreeName(targetName, existing) : targetName
                // reserve the name immediately so following files don't collide
                existing.set(finalName, true)
                const res = await client.mutate({
                    mutation: queries.create,
                    variables: {
                        content,
                        name: finalName,
                        mimeType: guessMimeType(file),
                        active: true
                    }
                })
                if (res?.errors?.length) {
                    existing.delete(finalName)
                    throw new Error(res.errors[0].message)
                }
                const created = firstResult(res)
                if (created?._id) {
                    existing.set(finalName, created._id)
                }
                updateEntry(entryId, {
                    status: finalName !== targetName ? 'renamed' : 'added',
                    target: finalName
                })
            }
        } catch (error) {
            updateEntry(entryId, {status: 'error', message: error.message})
        }
    }

    const handleFileContent = (file, content) => {
        const entryId = `${Date.now()}-${Math.random()}`
        setEntries(list => [...list, {id: entryId, name: file.name, size: file.size, status: 'pending'}])
        // process strictly one after another -> no race conditions with numbering
        queueRef.current = queueRef.current
            .then(() => processFile(entryId, file, content))
            .then(() => onUploaded && onUploaded())
    }

    const counts = entries.reduce((acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1
        return acc
    }, {})
    const done = entries.length - (counts.pending || 0)
    const normalizedPrefix = normalizePrefix(prefix)

    return <Stack spacing={3} sx={{pt: 1}}>
        <Paper variant="outlined" sx={{p: 2}}>
            <Typography variant="subtitle2" sx={{mb: 2}}>{_t('StaticFile.multiUpload.settings')}</Typography>
            <Stack direction={{xs: 'column', md: 'row'}} spacing={3} alignItems={{md: 'center'}}>
                <Autocomplete
                    freeSolo
                    sx={{flex: 1, minWidth: 260}}
                    options={prefixOptions}
                    inputValue={prefix}
                    onInputChange={(e, value) => setPrefix(value)}
                    renderInput={(params) => <TextField {...params}
                                                        size="small"
                                                        label={_t('StaticFile.multiUpload.prefix')}
                                                        helperText={_t('StaticFile.multiUpload.prefixHint', {example: `${normalizedPrefix}datei.svg`})}/>}
                />
                <Box sx={{flex: 1}}>
                    <SimpleSwitch label={_t('StaticFile.multiUpload.overwrite')}
                                  checked={overwrite}
                                  onChange={(e) => setOverwrite(e.target.checked)}/>
                    <Typography variant="caption" component="div" color="text.secondary">
                        {overwrite ? _t('StaticFile.multiUpload.overwriteOn') : _t('StaticFile.multiUpload.overwriteOff')}
                    </Typography>
                </Box>
            </Stack>
        </Paper>

        <FileDrop multi={true}
                  accept={ACCEPT}
                  maxSize={10}
                  imagePreview={false}
                  label={_t('StaticFile.multiUpload.dropArea')}
                  style={{minHeight: '10rem'}}
                  onFileContent={handleFileContent}/>

        {entries.length > 0 && <Paper variant="outlined" sx={{p: 2}}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{mb: 1}}>
                <Typography variant="subtitle2" sx={{mr: 1}}>
                    {_t('StaticFile.multiUpload.progress', {done, total: entries.length})}
                </Typography>
                {['added', 'replaced', 'renamed', 'error'].map(s => counts[s] ?
                    <Chip key={s} size="small" color={STATUS_COLOR[s]}
                          label={`${_t('StaticFile.multiUpload.status.' + s)}: ${counts[s]}`}/> : null)}
            </Stack>
            <LinearProgress variant="determinate" value={entries.length ? done / entries.length * 100 : 0}
                            sx={{mb: 2}}/>
            <Box sx={{maxHeight: '40vh', overflow: 'auto'}}>
                <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem'}}>
                    <thead>
                    <tr style={{textAlign: 'left'}}>
                        <th style={{padding: '0.4rem', width: '8rem'}}>{_t('StaticFile.multiUpload.col.status')}</th>
                        <th style={{padding: '0.4rem'}}>{_t('StaticFile.multiUpload.col.file')}</th>
                        <th style={{padding: '0.4rem'}}>{_t('StaticFile.multiUpload.col.target')}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {entries.map(e => <tr key={e.id} style={{borderTop: 'solid 1px rgba(0,0,0,0.08)'}}>
                        <td style={{padding: '0.4rem'}}>
                            <Chip size="small" variant={e.status === 'pending' ? 'outlined' : 'filled'}
                                  color={STATUS_COLOR[e.status]}
                                  label={_t('StaticFile.multiUpload.status.' + e.status)}/>
                        </td>
                        <td style={{padding: '0.4rem'}}>{e.name}</td>
                        <td style={{padding: '0.4rem'}}>
                            {e.status === 'error' ?
                                <Typography variant="body2" color="error">{e.message}</Typography> :
                                e.target ? <Tooltip title={_t('StaticFile.multiUpload.open')}>
                                    <a href={`/${e.target}`} target="_blank" rel="noopener noreferrer">{e.target}</a>
                                </Tooltip> : '…'}
                        </td>
                    </tr>)}
                    </tbody>
                </table>
            </Box>
        </Paper>}
    </Stack>
}

export default MultiUpload
