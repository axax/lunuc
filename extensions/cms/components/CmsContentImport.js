import React from 'react'
import {styled} from '@mui/material/styles'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import TextField from '@mui/material/TextField'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import LinearProgress from '@mui/material/LinearProgress'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import {SimpleDialog} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'

/**
 * "Inhalt importieren" in the element palette of the cms editor: converts a document (Word, PDF, Excel, HTML,
 * Markdown/Text, pictures), a web page or pasted text into elements of the template
 * (server: Api system/content2json -> api/util/contentToJson.mjs).
 *
 * props:
 * - hasContent: there is already content (the user chooses: append or replace)
 * - onApply(elements, mode)  mode 'append' | 'replace'
 */

const API = '/lunucapi/system/content2json'
const ACCEPT = '.docx,.pdf,.xlsx,.xlsm,.xls,.csv,.html,.htm,.md,.txt,image/*'

// same look as the template picker / the search field of the element palette
const StyledButton = styled('button')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 0 8px 0',
    padding: '6px 8px',
    borderRadius: '8px',
    border: `1px dashed ${theme.palette.divider}`,
    background: 'transparent',
    color: theme.palette.text.secondary,
    font: 'inherit',
    fontSize: '0.8rem',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'border-color .15s, color .15s, background-color .15s',
    '&:hover, &:focus-visible': {
        borderColor: theme.palette.primary.main,
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.action.hover,
        outline: 'none'
    },
    '& .label': {flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
    '& svg': {fontSize: 18, flexShrink: 0, color: theme.palette.primary.main}
}))

const StyledDrop = styled('label')(({theme, active}) => ({
    display: 'block',
    padding: '24px 16px',
    border: `2px dashed ${active ? theme.palette.primary.main : theme.palette.divider}`,
    borderRadius: 8,
    textAlign: 'center',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    fontSize: '0.9rem',
    background: active ? theme.palette.action.hover : 'transparent',
    '& input': {display: 'none'},
    '& strong': {color: theme.palette.text.primary}
}))

const upload = (files, onProgress) => new Promise((resolve, reject) => {
    const form = new FormData()
    files.forEach(f => form.append('file', f))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/graphql/upload')
    xhr.withCredentials = true
    xhr.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
        let json = {}
        try {
            json = JSON.parse(xhr.responseText)
        } catch (e) {
        }
        if (json.status !== 'success' || !json.fileIds || !json.fileIds.length) {
            reject(new Error(json.message || ('HTTP ' + xhr.status)))
        } else {
            resolve(json.fileIds.map(String))
        }
    }
    xhr.onerror = () => reject(new Error(_t('CmsContentImport.connectionError')))
    xhr.send(form)
})

const convert = async (body) => {
    const res = await fetch(API, {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    })
    let json
    try {
        json = await res.json()
    } catch (e) {
        throw new Error('HTTP ' + res.status)
    }
    if (json.error || json.status === 'error') throw new Error(json.error || json.message)
    return json
}

export default function CmsContentImport({hasContent, onApply}) {
    const [open, setOpen] = React.useState(false)
    const [tab, setTab] = React.useState('file')
    const [files, setFiles] = React.useState([])
    const [url, setUrl] = React.useState('')
    const [text, setText] = React.useState('')
    const [mode, setMode] = React.useState('append')
    const [importImages, setImportImages] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [progress, setProgress] = React.useState(null)
    const [message, setMessage] = React.useState(null)
    const [dragOver, setDragOver] = React.useState(false)

    const reset = () => {
        setFiles([])
        setUrl('')
        setText('')
        setMessage(null)
        setProgress(null)
    }

    const run = async () => {
        setBusy(true)
        setMessage(null)
        try {
            let results = []
            if (tab === 'file') {
                if (!files.length) throw new Error(_t('CmsContentImport.noFile'))
                setProgress(0)
                const ids = await upload(files, p => setProgress(p))
                setProgress(null)
                // one after the other, in the order of the chosen files
                for (const mediaId of ids) {
                    results.push(await convert({mediaId, importImages}))
                }
            } else if (tab === 'url') {
                if (!/^https?:\/\//i.test(url.trim())) throw new Error(_t('CmsContentImport.invalidUrl'))
                results.push(await convert({url: url.trim(), importImages}))
            } else {
                if (!text.trim()) throw new Error(_t('CmsContentImport.noText'))
                // pasted html (e.g. from a web page) or plain text / markdown
                results.push(await convert(/<[a-z][\s\S]*>/i.test(text) ? {html: text, importImages} : {text}))
            }
            const elements = results.reduce((all, r) => all.concat(r.elements || []), [])
            const warnings = results.reduce((all, r) => all.concat(r.warnings || []), [])
            if (!elements.length) throw new Error(_t('CmsContentImport.empty'))
            onApply(elements, hasContent ? mode : 'replace')
            if (warnings.length) {
                setMessage({type: 'warning', text: warnings.join('\n')})
            } else {
                setOpen(false)
                reset()
            }
        } catch (e) {
            setMessage({type: 'error', text: e.message})
        } finally {
            setBusy(false)
            setProgress(null)
        }
    }

    const fileList = list => setFiles(Array.from(list || []))

    return <>
        <StyledButton type="button" onClick={() => setOpen(true)}>
            <UploadFileIcon/>
            <span className="label">{_t('CmsContentImport.button')}</span>
        </StyledButton>

        {open && <SimpleDialog open={open}
                               fullWidth
                               maxWidth="sm"
                               title={_t('CmsContentImport.title')}
                               onClose={(action) => {
                                   if (action && action.key === 'import') {
                                       run()
                                       return
                                   }
                                   if (!busy) {
                                       setOpen(false)
                                       reset()
                                   }
                               }}
                               actions={[
                                   {key: 'cancel', label: _t('core.cancel'), disabled: busy},
                                   {key: 'import', label: _t('CmsContentImport.import'), type: 'primary', variant: 'contained', disabled: busy}
                               ]}>
            <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{mb: 2}}>
                <Tab value="file" label={_t('CmsContentImport.tabFile')}/>
                <Tab value="url" label={_t('CmsContentImport.tabUrl')}/>
                <Tab value="text" label={_t('CmsContentImport.tabText')}/>
            </Tabs>

            {tab === 'file' && <StyledDrop active={dragOver ? 1 : 0}
                                           onDragOver={e => {
                                               e.preventDefault()
                                               setDragOver(true)
                                           }}
                                           onDragLeave={() => setDragOver(false)}
                                           onDrop={e => {
                                               e.preventDefault()
                                               setDragOver(false)
                                               fileList(e.dataTransfer.files)
                                           }}>
                <input type="file" multiple accept={ACCEPT} onChange={e => fileList(e.target.files)}/>
                {files.length ? <strong>{files.map(f => f.name).join(', ')}</strong> : _t('CmsContentImport.drop')}
                <div style={{fontSize: '0.75rem', marginTop: 6}}>{_t('CmsContentImport.formats')}</div>
            </StyledDrop>}

            {tab === 'url' && <TextField fullWidth
                                         autoFocus
                                         label={_t('CmsContentImport.url')}
                                         placeholder="https://"
                                         value={url}
                                         onChange={e => setUrl(e.target.value)}
                                         helperText={_t('CmsContentImport.urlHelp')}/>}

            {tab === 'text' && <TextField fullWidth
                                          autoFocus
                                          multiline
                                          minRows={6}
                                          maxRows={16}
                                          label={_t('CmsContentImport.text')}
                                          value={text}
                                          onChange={e => setText(e.target.value)}
                                          helperText={_t('CmsContentImport.textHelp')}/>}

            {tab !== 'text' && <FormControlLabel sx={{mt: 1}}
                                                 control={<Checkbox size="small" checked={importImages}
                                                                    onChange={e => setImportImages(e.target.checked)}/>}
                                                 label={_t('CmsContentImport.importImages')}/>}

            {hasContent && <RadioGroup row value={mode} onChange={e => setMode(e.target.value)}>
                <FormControlLabel value="append" control={<Radio size="small"/>} label={_t('CmsContentImport.append')}/>
                <FormControlLabel value="replace" control={<Radio size="small"/>} label={_t('CmsContentImport.replace')}/>
            </RadioGroup>}

            {busy && <LinearProgress sx={{mt: 2}} variant={progress !== null ? 'determinate' : 'indeterminate'}
                                     value={progress !== null ? progress * 100 : undefined}/>}
            {busy && <div style={{fontSize: '0.8rem', marginTop: 6}}>
                {progress !== null ? _t('CmsContentImport.uploading') : _t('CmsContentImport.converting')}
            </div>}
            {message && <div style={{
                marginTop: 12, whiteSpace: 'pre-wrap', fontSize: '0.85rem',
                color: message.type === 'error' ? '#b42318' : '#8a5a00'
            }}>{message.type === 'warning' ? _t('CmsContentImport.doneWithWarnings') + '\n' : ''}{message.text}</div>}
        </SimpleDialog>}
    </>
}

/**
 * adds the elements to a template (json string): into the children of the root container
 * (e.g. [{"t":"#div","c":[...]}] or the default template {"p":{"id":"page"},"c":[]}), or replaces its children
 */
export const addElementsToTemplate = (template, elements, mode = 'append') => {
    let json = null
    try {
        json = template && template.trim() ? JSON.parse(template) : null
    } catch (e) {
        json = null
    }
    const root = Array.isArray(json) ? (json.length === 1 && json[0] && typeof json[0] === 'object' && !json[0].$for ? json[0] : null) : json
    if (!json || (Array.isArray(json) && !root)) {
        if (Array.isArray(json) && mode === 'append') {
            return JSON.stringify(json.concat(elements), null, 2)
        }
        return JSON.stringify([{t: '#div', c: elements}], null, 2)
    }
    let children = root.c
    if (children === undefined || children === null || children === '') children = []
    else if (!Array.isArray(children)) children = [children]
    root.c = mode === 'replace' ? elements : children.concat(elements)
    return JSON.stringify(json, null, 2)
}
