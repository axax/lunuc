import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react'
import {
    Typography,
    TextField,
    SimpleDialog,
    SimpleMenu,
    SimpleButton,
    IconButton,
    Tooltip,
    Chip,
    InputAdornment,
    CircularProgress,
    FolderIcon,
    InsertDriveFileIcon,
    LinkIcon,
    SearchIcon,
    RefreshIcon,
    DownloadIcon,
    SaveIcon,
    CloseIcon,
    AddIcon,
    CloudUploadIcon,
    HistoryIcon,
    ArrowUpwardIcon,
    ArrowDownwardIcon,
    ClearIcon
} from 'ui/admin'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import Util from 'client/util/index.mjs'
import {formatBytes} from 'client/util/format.mjs'
import {COMMAND_QUERY} from '../constants/admin.mjs'
import PropTypes from 'prop-types'
import {client} from '../middleware/graphql'
import FileDrop from '../components/FileDrop'
import Async from '../components/Async'
import {_t} from 'util/i18n.mjs'
import styled from '@emotion/styled'

/*
 * File browser of the admin (/admin/files), also embedded as editor (editOnly, e.g. ResourceEditor).
 * Server side: api/resolver/files.mjs (fs based, every path is checked against the spaces).
 * Files of system spaces (/etc/...) are only saved explicitly (Cmd+S / button, with a diff first)
 * and get a .bak on the first save; all other files are saved automatically.
 */

const SPACES_QUERY = 'query fileSpaces{fileSpaces{value name root system}}'
const LIST_QUERY = 'query listFiles($space:String!,$dir:String){listFiles(space:$space,dir:$dir){dir truncated entries{name type size mtime mode target targetType}}}'
const READ_QUERY = 'query readFile($space:String!,$path:String!,$backup:Boolean){readFile(space:$space,path:$path,backup:$backup){path content size mtime mode owner writable binary tooLarge hasBackup}}'
const SEARCH_QUERY = 'query searchFiles($space:String!,$dir:String,$text:String!){searchFiles(space:$space,dir:$dir,text:$text){truncated hits{path line text}}}'
const WRITE_MUTATION = 'mutation writeFile($space:String!,$path:String!,$content:String!,$expectedMtime:Float,$backup:Boolean,$force:Boolean){writeFile(space:$space,path:$path,content:$content,expectedMtime:$expectedMtime,backup:$backup,force:$force){path mtime size backup}}'
const OPERATION_MUTATION = 'mutation fileOperation($space:String!,$path:String!,$operation:String!,$newName:String){fileOperation(space:$space,path:$path,operation:$operation,newName:$newName){status path}}'
const TOKEN_QUERY = 'query getTokenLink($filePath:String){getTokenLink(filePath:$filePath){token}}'

const SYSTEMD_SPACE = '/etc/systemd/system'
const SERVICE_NAME_REGEX = /^[a-zA-Z0-9@._-]+\.service$/
const AUTOSAVE_DELAY = 1500
const RECENT_KEY = 'lunucFilesRecent'
const MAX_RECENT = 12

const tr = (key, replacements) => _t('FilesContainer.' + key, replacements)
const notify = (message) => _app_.dispatcher.addNotification({key: 'fileChange', message})
const showError = (msg) => _app_.dispatcher.addError({key: 'fileChange', msg})
const errorMessage = (e) => (e && e.error && e.error.message) || (e && e.message) || String(e)

const CodeEditor = (props) => <Async {...props} load={() => import(/* webpackChunkName: "codeeditor" */ '../components/CodeEditor')}/>

// dir: '' or '/a/b' (format of the url parameter)
const joinPath = (dir, name) => (dir ? dir + '/' : '/') + name
const splitPath = (p) => {
    const parts = ('/' + p).replace(/\/+/g, '/').split('/')
    const name = parts.pop()
    return {dir: parts.join('/'), name}
}
const isValidName = (name) => !!name && name !== '.' && name !== '..' && name.length <= 255 && !/[/\\\0]/.test(name)

const fileExtension = (name) => {
    const pos = name.lastIndexOf('.')
    return pos > 0 ? name.substring(pos + 1).toLowerCase() : ''
}
const editorType = (name) => {
    const ext = fileExtension(name)
    return ['mjs', 'cjs', 'jsx'].indexOf(ext) >= 0 ? 'js' : (ext || 'text')
}
const isDir = (entry) => entry.type === 'dir' || entry.targetType === 'dir'

// time only for today, date otherwise
const formatMtime = (mtime) => {
    if (!mtime) return ''
    const date = new Date(mtime)
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
        return Util.formatDate(date, {year: undefined, month: undefined, day: undefined, second: undefined, hour: '2-digit', minute: '2-digit'})
    }
    // undefined: the defaults of getDateTimeFormat contain the time
    return Util.formatDate(date, {hour: undefined, minute: undefined, second: undefined, year: '2-digit', month: '2-digit', day: '2-digit'})
}

const readRecent = () => {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY)) || []
    } catch (e) {
        return []
    }
}
const addRecent = (space, path) => {
    try {
        const recent = readRecent().filter(r => r.space !== space || r.path !== path)
        recent.unshift({space, path})
        localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
    } catch (e) {
        // no storage (private mode) -> no recent files
    }
}

const updateUrl = (history, params) => {
    if (!history) return
    const query = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null)
        .map(k => k + '=' + encodeURIComponent(params[k])).join('&')
    history.push(`${location.pathname}?${query}`)
}

const download = (absPath, name) => {
    client.query({query: TOKEN_QUERY, fetchPolicy: 'no-cache', variables: {filePath: absPath}}).then(response => {
        window.open(`${location.origin}/tokenlink/${response.data.getTokenLink.token}/-/${encodeURIComponent(name)}`, '_blank')
    }).catch(() => {})
}

// ─── styles ─────────────────────────────────────────────────────────────────

const StyledSpaces = styled('div')(() => ({
    display: 'flex',
    gap: '0.5rem',
    overflowX: 'auto',
    paddingBottom: '0.25rem',
    marginBottom: '1rem',
    // the theme gives chips a margin (themeBuilder.js) -> aligned by the gap only
    '& .MuiChip-root': {margin: 0}
}))

const StyledLayout = styled('div')(({theme}) => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(18rem, 26rem) minmax(0, 1fr)',
    gap: '1.5rem',
    height: 'calc(100vh - 15rem)',
    minHeight: '32rem',
    '& .MuiChip-root': {margin: 0},
    [theme.breakpoints.down('md')]: {
        gridTemplateColumns: 'minmax(0, 1fr)',
        height: 'auto',
        '&[data-has-file="true"] > [data-panel="list"]': {display: 'none'},
        '&[data-has-file="false"] > [data-panel="editor"]': {display: 'none'},
        '& > [data-panel]': {height: 'calc(100vh - 13rem)'}
    }
}))

const StyledPanel = styled('div')(({theme}) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '12px',
    background: theme.palette.background.paper,
    overflow: 'hidden'
}))

const StyledToolbar = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.5rem 0.5rem 0.5rem 0.75rem',
    borderBottom: `1px solid ${theme.palette.divider}`,
    minHeight: '3rem'
}))

const StyledBreadcrumb = styled('div')(({theme}) => ({
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    fontSize: '0.875rem',
    '& button': {
        border: 0,
        background: 'none',
        color: theme.palette.primary.main,
        cursor: 'pointer',
        padding: '0.125rem 0.25rem',
        borderRadius: '4px',
        font: 'inherit',
        maxWidth: '12rem',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    '& button:hover': {background: theme.palette.action.hover},
    '& button:last-of-type': {color: theme.palette.text.primary, fontWeight: 600},
    '& span': {color: theme.palette.text.disabled}
}))

const GRID_COLUMNS = 'minmax(0, 1fr) 4.5rem 4.75rem 2rem'

const StyledHeader = styled('div')(({theme}) => ({
    display: 'grid',
    gridTemplateColumns: GRID_COLUMNS,
    alignItems: 'center',
    padding: '0.25rem 0.25rem 0.25rem 0.75rem',
    borderBottom: `1px solid ${theme.palette.divider}`,
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    '& button': {
        display: 'flex',
        alignItems: 'center',
        gap: '0.125rem',
        border: 0,
        background: 'none',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        padding: 0
    },
    '& button:nth-of-type(n+2)': {justifySelf: 'end'},
    '& svg': {fontSize: '0.875rem'}
}))

const StyledRows = styled('div')(() => ({
    flex: 1,
    overflow: 'auto',
    minHeight: 0
}))

const StyledRow = styled('div')(({theme}) => ({
    display: 'grid',
    gridTemplateColumns: GRID_COLUMNS,
    alignItems: 'center',
    minHeight: '2.25rem',
    padding: '0 0.25rem 0 0.75rem',
    cursor: 'pointer',
    userSelect: 'none',
    '&:hover': {background: theme.palette.action.hover},
    '&[data-selected="true"]': {background: theme.palette.action.selected},
    '& > [data-name]': {display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0},
    '& > [data-name] svg': {fontSize: '1.125rem', flexShrink: 0, color: theme.palette.text.secondary},
    '& > [data-name] svg[data-dir]': {color: theme.palette.primary.main},
    '& [data-text]': {minWidth: 0, lineHeight: 1.2},
    '& [data-text] > div': {overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem'},
    '& [data-text] > small': {
        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: '0.75rem', color: theme.palette.text.secondary
    },
    '& small[data-broken]': {color: theme.palette.error.main},
    '& > [data-meta]': {
        justifySelf: 'end', fontSize: '0.75rem', color: theme.palette.text.secondary,
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'
    },
    '& > [data-more]': {opacity: 0.4},
    '&:hover > [data-more], & > [data-more]:focus-visible': {opacity: 1}
}))

const StyledSearchRow = styled(StyledRow)(() => ({
    gridTemplateColumns: 'minmax(0, 1fr)',
    padding: '0.375rem 0.75rem'
}))

const StyledEmpty = styled('div')(({theme}) => ({
    padding: '2rem 1rem',
    textAlign: 'center',
    color: theme.palette.text.secondary,
    fontSize: '0.875rem'
}))

const StyledDropOverlay = styled('div')(({theme}) => ({
    position: 'absolute',
    inset: 0,
    zIndex: 5,
    padding: '1rem',
    background: theme.palette.background.paper,
    display: 'flex',
    flexDirection: 'column',
    '& > div:last-of-type': {flex: 1}
}))

const StyledEditorHeader = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.5rem 0.5rem 0.75rem',
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexWrap: 'wrap',
    '& [data-title]': {flex: 1, minWidth: '10rem'},
    '& [data-title] > div': {fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'},
    '& [data-title] > small': {
        display: 'block', color: theme.palette.text.secondary, fontSize: '0.75rem',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left'
    },
    '& [data-info]': {display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap'},
    '& [data-actions]': {display: 'flex', alignItems: 'center'},
    '& [data-back]': {display: 'none', [theme.breakpoints.down('md')]: {display: 'inline-flex'}}
}))

const StyledStatus = styled('span')(({theme}) => ({
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    color: theme.palette.text.secondary,
    '&[data-status="unsaved"]': {color: theme.palette.warning.main},
    '&[data-status="error"]': {color: theme.palette.error.main},
    '&[data-status="saved"]': {color: theme.palette.success.main}
}))

const StyledEditorBody = styled('div')(() => ({
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    '& > [data-message]': {padding: '1.5rem'}
}))

const StyledSystemdBar = styled('div')(({theme}) => ({
    display: 'flex',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    borderBottom: `1px solid ${theme.palette.divider}`
}))

// ─── list ───────────────────────────────────────────────────────────────────

const Breadcrumb = ({spaceName, dir, onNavigate}) => {
    const parts = dir ? dir.split('/').filter(x => x) : []
    return <StyledBreadcrumb>
        <button type="button" title={spaceName} onClick={() => onNavigate('')}>{spaceName}</button>
        {parts.map((part, i) => [
            <span key={'s' + i}>/</span>,
            <button type="button" key={'b' + i} title={part}
                    onClick={() => onNavigate('/' + parts.slice(0, i + 1).join('/'))}>{part}</button>
        ])}
    </StyledBreadcrumb>
}

const SortButton = ({sortKey, sort, onSort, children}) => <button type="button" onClick={() => onSort(sortKey)}>
    {children}
    {sort.key === sortKey && (sort.desc ? <ArrowDownwardIcon/> : <ArrowUpwardIcon/>)}
</button>

const EntryRow = ({entry, selected, onOpen, onMenu}) => {
    const dir = isDir(entry)
    const Icon = entry.type === 'link' && !dir ? LinkIcon : dir ? FolderIcon : InsertDriveFileIcon
    const openMenu = (e) => {
        e.preventDefault()
        e.stopPropagation()
        onMenu(entry, {left: e.clientX + 2, top: e.clientY - 6})
    }
    return <StyledRow data-selected={selected} onClick={() => onOpen(entry)} onContextMenu={openMenu}
                      title={entry.mode ? `${entry.name} (${entry.mode})` : entry.name}>
        <div data-name>
            <Icon data-dir={dir ? 'true' : undefined}/>
            <div data-text>
                <div>{entry.name}</div>
                {entry.target && <small data-broken={entry.targetType === 'broken' ? 'true' : undefined}>
                    → {entry.target}{entry.targetType === 'broken' ? ' (' + tr('brokenLink') + ')' : ''}
                </small>}
            </div>
        </div>
        <div data-meta>{dir ? '' : formatBytes(entry.size || 0)}</div>
        <div data-meta>{formatMtime(entry.mtime)}</div>
        <IconButton data-more size="small" aria-label={tr('actions')} onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            e.stopPropagation()
            onMenu(entry, {left: rect.left, top: rect.bottom})
        }}><MoreVertIcon fontSize="small"/></IconButton>
    </StyledRow>
}

const sortEntries = (entries, sort) => {
    const factor = sort.desc ? -1 : 1
    return entries.slice().sort((a, b) => {
        const dirs = isDir(b) - isDir(a)
        if (dirs) return dirs
        if (sort.key === 'size') return factor * ((a.size || 0) - (b.size || 0))
        if (sort.key === 'mtime') return factor * ((a.mtime || 0) - (b.mtime || 0))
        return factor * a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'})
    })
}

// ─── editor ─────────────────────────────────────────────────────────────────

const FileEditor = ({space, spaceRoot, explicitSave, filePath, editOnly, onClose, onSaved}) => {
    const {name} = splitPath(filePath)
    const [info, setInfo] = useState(null)
    const [loadError, setLoadError] = useState(null)
    const [version, setVersion] = useState(0)
    const [status, setStatus] = useState('')
    const [dialog, setDialog] = useState(null)

    const contentRef = useRef(null)
    const loadedRef = useRef(null)
    const mtimeRef = useRef(null)
    const timerRef = useRef(null)
    const backedUpRef = useRef({})
    const statusRef = useRef('')

    const setStatusIfChanged = (newStatus) => {
        if (statusRef.current !== newStatus) {
            statusRef.current = newStatus
            setStatus(newStatus)
        }
    }

    const load = useCallback(() => {
        setInfo(null)
        setLoadError(null)
        client.query({query: READ_QUERY, fetchPolicy: 'no-cache', variables: {space, path: filePath}}).then(response => {
            const data = response.data.readFile
            loadedRef.current = data.content
            contentRef.current = data.content
            mtimeRef.current = data.mtime
            setStatusIfChanged('')
            setInfo(data)
            setVersion(v => v + 1)
        }).catch(e => setLoadError(errorMessage(e)))
    }, [space, filePath])

    const save = useCallback((content, force) => {
        clearTimeout(timerRef.current)
        const backup = explicitSave && !backedUpRef.current[filePath]
        setStatusIfChanged('saving')
        return client.mutate({
            mutation: WRITE_MUTATION,
            silent: true,
            variables: {space, path: filePath, content, expectedMtime: mtimeRef.current, backup, force: !!force}
        }).then(response => {
            const result = response.data.writeFile
            if (backup) {
                backedUpRef.current[filePath] = true
            }
            loadedRef.current = content
            mtimeRef.current = result.mtime
            if (result.backup) {
                setInfo(i => i ? {...i, hasBackup: true} : i)
            }
            setStatusIfChanged(contentRef.current === content ? 'saved' : 'unsaved')
            if (onSaved) onSaved()
            if (explicitSave) notify(tr('saved', {name}))
        }).catch(e => {
            setStatusIfChanged('error')
            const message = errorMessage(e)
            if (message === 'FILE_CHANGED') {
                setDialog({key: 'conflict', content})
            } else {
                showError(tr('saveError', {name, message}))
            }
        })
    }, [space, filePath, explicitSave, name, onSaved])

    // saves a pending automatic save right away (before switching the file or running systemctl)
    const flush = useCallback(() => {
        if (timerRef.current && !explicitSave && contentRef.current !== loadedRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
            if (contentRef.current && contentRef.current.trim()) {
                return save(contentRef.current)
            }
        }
        return Promise.resolve()
    }, [explicitSave, save])

    useEffect(() => {
        load()
        return () => {
            flush()
        }
    }, [load])

    // explicit save: warn before leaving the page with unsaved changes
    useEffect(() => {
        if (!explicitSave) return
        const handler = (e) => {
            if (contentRef.current !== loadedRef.current) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [explicitSave])

    const onChange = (content) => {
        contentRef.current = content
        const changed = content !== loadedRef.current
        clearTimeout(timerRef.current)
        if (!changed) {
            setStatusIfChanged('')
            return
        }
        setStatusIfChanged('unsaved')
        if (!explicitSave) {
            timerRef.current = setTimeout(() => {
                timerRef.current = null
                if (!content.trim()) {
                    // never auto save an empty file (guard against wiping files)
                    notify(tr('emptyNotSaved', {name}))
                    return
                }
                save(content)
            }, AUTOSAVE_DELAY)
        }
    }

    const requestSave = () => {
        if (contentRef.current === loadedRef.current) {
            return
        }
        if (explicitSave) {
            setDialog({key: 'save'})
        } else {
            save(contentRef.current)
        }
    }

    const onKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault()
            requestSave()
        }
    }

    const showBackup = () => {
        client.query({query: READ_QUERY, fetchPolicy: 'no-cache', variables: {space, path: filePath, backup: true}}).then(response => {
            setDialog({key: 'backup', backup: response.data.readFile.content || ''})
        }).catch(() => {})
    }

    const runSystemctl = (restart) => {
        if (explicitSave && contentRef.current !== loadedRef.current) {
            notify(tr('saveFirst'))
            return
        }
        // restart is detached (systemd-run) because restarting lunuc-api would kill the process running this command
        const command = 'systemctl daemon-reload' + (restart ? ` && systemd-run --on-active=2 --unit="lunuc-restart-$(date +%s)" systemctl restart "${name}"` : '')
        flush().then(() => client.query({
            fetchPolicy: 'no-cache',
            query: COMMAND_QUERY,
            variables: {sync: true, command: command + ' 2>&1'}
        })).then(response => {
            const out = (response.data && response.data.run && response.data.run.response || '').trim()
            notify((restart ? tr('restartScheduled', {name}) : tr('daemonReloaded')) + (out ? ': ' + out : ''))
        }).catch(e => showError('Error: ' + errorMessage(e)))
    }

    const absPath = spaceRoot + filePath
    const closeDialog = () => setDialog(null)
    const isSystemd = space === SYSTEMD_SPACE && SERVICE_NAME_REGEX.test(name)

    let body
    if (loadError) {
        body = <Typography data-message color="error">{loadError}</Typography>
    } else if (!info) {
        body = <div data-message><CircularProgress size={24}/></div>
    } else if (info.binary || info.tooLarge) {
        body = <div data-message>
            <Typography gutterBottom>{tr(info.binary ? 'binaryFile' : 'largeFile', {size: formatBytes(info.size)})}</Typography>
            <SimpleButton variant="contained" startIcon={DownloadIcon}
                          onClick={() => download(absPath, name)}>{tr('download')}</SimpleButton>
        </div>
    } else {
        body = <CodeEditor key={filePath + ':' + version} identifier={filePath} lineNumbers
                           height={editOnly ? '50rem' : '100%'}
                           readOnly={!info.writable}
                           onChange={onChange} type={editorType(name)}>{info.content}</CodeEditor>
    }

    return <StyledPanel data-panel="editor" onKeyDown={onKeyDown}>
        <StyledEditorHeader>
            {onClose && <IconButton data-back size="small" aria-label={tr('back')} onClick={onClose}><ArrowBackIcon/></IconButton>}
            <div data-title>
                <div title={name}>{name}</div>
                <small title={absPath}>{'‎' + absPath}</small>
            </div>
            {info && <div data-info>
                {info.mode && <Chip size="small" variant="outlined" label={info.mode + (info.owner ? ' · ' + info.owner : '')}/>}
                {!info.writable && <Chip size="small" color="warning" variant="outlined" label={tr('readOnly')}/>}
                {explicitSave && <Chip size="small" variant="outlined" label={tr('manualSave')}/>}
                <StyledStatus data-status={status}>{status ? tr('status.' + status) : ''}</StyledStatus>
            </div>}
            <div data-actions>
                {info && info.writable && !info.binary && !info.tooLarge && <Tooltip title={tr('save') + ' (⌘S)'}>
                    <span><IconButton size="small" color={status === 'unsaved' ? 'primary' : 'default'}
                                      disabled={status !== 'unsaved' && status !== 'error'}
                                      aria-label={tr('save')} onClick={requestSave}><SaveIcon/></IconButton></span>
                </Tooltip>}
                {info && info.hasBackup && <Tooltip title={tr('backup')}>
                    <IconButton size="small" aria-label={tr('backup')} onClick={showBackup}><HistoryIcon/></IconButton>
                </Tooltip>}
                <Tooltip title={tr('reload')}>
                    <IconButton size="small" aria-label={tr('reload')} onClick={() => {
                        if (contentRef.current !== loadedRef.current) {
                            setDialog({key: 'reload'})
                        } else {
                            load()
                        }
                    }}><RefreshIcon/></IconButton>
                </Tooltip>
                <Tooltip title={tr('download')}>
                    <IconButton size="small" aria-label={tr('download')} onClick={() => download(absPath, name)}><DownloadIcon/></IconButton>
                </Tooltip>
            </div>
        </StyledEditorHeader>
        {isSystemd && <StyledSystemdBar>
            <SimpleButton variant="outlined" size="small" onClick={() => runSystemctl(false)}>daemon-reload</SimpleButton>
            <SimpleButton variant="outlined" size="small" onClick={() => runSystemctl(true)}>daemon-reload + restart</SimpleButton>
        </StyledSystemdBar>}
        <StyledEditorBody>{body}</StyledEditorBody>

        {dialog && dialog.key === 'save' && <SimpleDialog open fullWidth maxWidth="lg" title={tr('confirmSave', {name})}
                                                         onClose={(e) => {
                                                             closeDialog()
                                                             if (e.key === 'save') save(contentRef.current)
                                                         }}
                                                         actions={[{key: 'cancel', label: _t('core.cancel')}, {key: 'save', label: tr('save'), type: 'primary'}]}>
            <CodeEditor identifier={filePath + '-savediff'} lineNumbers readOnly mergeView
                        mergeLabels={[tr('onServer'), tr('yourChanges')]}
                        mergeValue={contentRef.current} type={editorType(name)}
                        style={{height: '60vh'}}>{loadedRef.current}</CodeEditor>
        </SimpleDialog>}

        {dialog && dialog.key === 'backup' && <SimpleDialog open fullWidth maxWidth="lg" title={tr('backupTitle', {name})}
                                                           onClose={(e) => {
                                                               closeDialog()
                                                               if (e.key === 'restore') {
                                                                   save(dialog.backup).then(load)
                                                               }
                                                           }}
                                                           actions={[{key: 'cancel', label: _t('core.cancel')}, {key: 'restore', label: tr('restoreBackup'), type: 'primary'}]}>
            <CodeEditor identifier={filePath + '-backupdiff'} lineNumbers readOnly mergeView
                        mergeLabels={['.bak', tr('current')]}
                        mergeValue={contentRef.current} type={editorType(name)}
                        style={{height: '60vh'}}>{dialog.backup}</CodeEditor>
        </SimpleDialog>}

        {dialog && dialog.key === 'conflict' && <SimpleDialog open title={tr('conflictTitle')}
                                                             onClose={(e) => {
                                                                 closeDialog()
                                                                 if (e.key === 'overwrite') save(dialog.content, true)
                                                                 else if (e.key === 'reload') load()
                                                             }}
                                                             actions={[{key: 'cancel', label: _t('core.cancel')},
                                                                 {key: 'reload', label: tr('reloadDiscard')},
                                                                 {key: 'overwrite', label: tr('overwrite'), type: 'primary'}]}>
            {tr('conflictText', {name})}
        </SimpleDialog>}

        {dialog && dialog.key === 'reload' && <SimpleDialog open title={tr('discardTitle')}
                                                           onClose={(e) => {
                                                               closeDialog()
                                                               if (e.key === 'yes') load()
                                                           }}
                                                           actions={[{key: 'no', label: _t('core.cancel')}, {key: 'yes', label: tr('discard'), type: 'primary'}]}>
            {tr('discardText', {name})}
        </SimpleDialog>}
    </StyledPanel>
}

// ─── container ──────────────────────────────────────────────────────────────

const FilesContainer = (props) => {
    const {embedded, editOnly, history} = props
    const params = useMemo(() => Util.extractQueryParams(), [])

    const [spaces, setSpaces] = useState([])
    const [space, setSpace] = useState(props.space || params.space || '.')
    const [dir, setDir] = useState(params.dir || '')
    const [file, setFile] = useState(props.file ? joinPath('', props.file) : (params.file || null))
    const [list, setList] = useState(null)
    const [listError, setListError] = useState(null)
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('')
    const [search, setSearch] = useState(null)
    const [sort, setSort] = useState({key: 'name', desc: false})
    const [menu, setMenu] = useState(null)
    const nameValueRef = useRef('')
    const [dialog, setDialogState] = useState(null)
    const setDialog = (d) => {
        if (d && d.key === 'name') {
            nameValueRef.current = d.value || ''
        }
        setDialogState(d)
    }
    const [showDrop, setShowDrop] = useState(false)
    const [recent, setRecent] = useState(readRecent)
    const dropTimerRef = useRef(null)

    useEffect(() => {
        client.query({query: SPACES_QUERY}).then(response => setSpaces(response.data.fileSpaces || [])).catch(() => {})
    }, [])

    const currentSpace = spaces.find(s => s.value === space)
    const spaceName = currentSpace ? currentSpace.name : space
    // absolute path of the space as shown in the editor header (spaces like './build/' are not in the list)
    const spaceRoot = currentSpace ? currentSpace.root : space.replace(/\/$/, '')
    const explicitSave = currentSpace ? !!currentSpace.system : space.indexOf('/etc/') === 0

    const loadList = useCallback(() => {
        if (editOnly) return
        setLoading(true)
        setListError(null)
        client.query({query: LIST_QUERY, fetchPolicy: 'no-cache', variables: {space, dir}}).then(response => {
            setList(response.data.listFiles)
            setLoading(false)
        }).catch(e => {
            setListError(errorMessage(e))
            setList(null)
            setLoading(false)
        })
    }, [space, dir, editOnly])

    useEffect(() => {
        loadList()
    }, [loadList])

    useEffect(() => {
        if (!search || !search.text) return
        setSearch(s => ({...s, loading: true}))
        client.query({query: SEARCH_QUERY, fetchPolicy: 'no-cache', variables: {space, dir, text: search.text}}).then(response => {
            setSearch(s => s && s.text === search.text ? {...s, loading: false, result: response.data.searchFiles} : s)
        }).catch(() => setSearch(s => s ? {...s, loading: false} : s))
    }, [search && search.text, space, dir])

    const navigate = (newSpace, newDir, newFile) => {
        setSpace(newSpace)
        setDir(newDir)
        setFile(newFile || null)
        setFilter('')
        if (newSpace !== space || newDir !== dir) {
            setSearch(null)
        }
        if (newFile) {
            addRecent(newSpace, newFile)
            setRecent(readRecent())
        }
        updateUrl(history, {space: newSpace, dir: newDir, file: newFile || undefined})
    }

    const openEntry = (entry) => {
        const path = joinPath(dir, entry.name)
        if (isDir(entry)) {
            navigate(space, path, null)
        } else if (path !== file) {
            navigate(space, dir, path)
        }
    }

    const openSearchHit = (hit) => {
        const p = joinPath('', hit.path)
        // keep the search open, only the file changes
        setFile(p)
        addRecent(space, p)
        setRecent(readRecent())
        updateUrl(history, {space, dir, file: p})
    }

    const runOperation = (operation, path, newName) => client.mutate({
        mutation: OPERATION_MUTATION,
        variables: {space, path, operation, newName}
    }).then(response => {
        loadList()
        return response.data.fileOperation
    })

    const entries = useMemo(() => {
        if (!list) return []
        const f = filter.trim().toLowerCase()
        const filtered = f ? list.entries.filter(e => e.name.toLowerCase().indexOf(f) >= 0) : list.entries
        return sortEntries(filtered, sort)
    }, [list, filter, sort])

    const onSort = (key) => setSort(s => ({key, desc: s.key === key ? !s.desc : key !== 'name'}))

    const menuItems = menu ? [
        {name: tr('renameFile'), icon: 'edit', onClick: () => setDialog({key: 'name', operation: 'rename', entry: menu.entry, value: menu.entry.name})},
        {name: tr('copyFile'), icon: 'contentCopy', onClick: () => {
            const n = menu.entry.name
            const pos = n.lastIndexOf('.')
            setDialog({key: 'name', operation: 'copy', entry: menu.entry, value: pos > 0 ? n.substring(0, pos) + '_copy' + n.substring(pos) : n + '_copy'})
        }},
        !isDir(menu.entry) && {name: tr('download'), icon: 'download', onClick: () => download(spaceRoot + joinPath(dir, menu.entry.name), menu.entry.name)},
        {name: tr('deleteFile'), icon: 'delete', danger: true, divider: true, onClick: () => setDialog({key: 'delete', entry: menu.entry})}
    ] : []

    const closeNameDialog = (e) => {
        if (e.key !== 'save') {
            setDialog(null)
            return
        }
        // ref: always the latest input, independent of the render the dialog's handler comes from
        const value = nameValueRef.current.trim()
        if (!isValidName(value)) {
            setDialog({...dialog, error: tr('invalidName')})
            return
        }
        const {operation, entry} = dialog
        const path = entry ? joinPath(dir, entry.name) : joinPath(dir, value)
        runOperation(operation, path, entry ? value : undefined).then(() => {
            setDialog(null)
            notify(tr('done.' + operation, {name: value}))
            if (operation === 'touch') {
                navigate(space, dir, joinPath(dir, value))
            } else if (operation === 'rename' && file === path) {
                navigate(space, dir, joinPath(dir, value))
            }
        }).catch(() => {})
    }

    const editor = file && <FileEditor key={space + '|' + file} space={space} spaceRoot={spaceRoot} explicitSave={explicitSave}
                                       filePath={file} editOnly={editOnly}
                                       onSaved={editOnly ? undefined : loadList}
                                       onClose={editOnly ? undefined : () => navigate(space, dir, null)}/>

    if (editOnly) {
        return editor || null
    }

    const showUpload = () => {
        clearTimeout(dropTimerRef.current)
        setShowDrop(true)
    }

    let listContent
    if (search) {
        const hits = search.result ? search.result.hits : []
        listContent = search.loading ? <StyledEmpty><CircularProgress size={20}/></StyledEmpty> :
            !hits.length ? <StyledEmpty>{tr('noHits')}</StyledEmpty> :
                [hits.map(hit => <StyledSearchRow key={hit.path} data-selected={joinPath('', hit.path) === file}
                                                  onClick={() => openSearchHit(hit)}>
                    <div data-text>
                        <div>{hit.path}</div>
                        <small>{hit.line ? hit.line + ': ' : ''}{hit.text}</small>
                    </div>
                </StyledSearchRow>), search.result.truncated && <StyledEmpty key="more">{tr('searchTruncated')}</StyledEmpty>]
    } else if (listError) {
        listContent = <StyledEmpty><Typography color="error" variant="body2">{listError}</Typography></StyledEmpty>
    } else if (!list) {
        listContent = <StyledEmpty><CircularProgress size={20}/></StyledEmpty>
    } else if (!entries.length) {
        listContent = <StyledEmpty>{filter ? tr('noMatch') : tr('emptyFolder')}</StyledEmpty>
    } else {
        listContent = [
            entries.map(entry => <EntryRow key={entry.name} entry={entry}
                                           selected={file === joinPath(dir, entry.name)}
                                           onOpen={openEntry}
                                           onMenu={(e, position) => setMenu({entry: e, position})}/>),
            list.truncated && <StyledEmpty key="more">{tr('listTruncated')}</StyledEmpty>
        ]
    }

    const recentHere = recent.filter(r => spaces.length === 0 || spaces.some(s => s.value === r.space))

    const content = <>
        <StyledSpaces>
            {spaces.map(s => <Chip key={s.value} label={s.name} clickable
                                   color={s.value === space ? 'primary' : 'default'}
                                   variant={s.value === space ? 'filled' : 'outlined'}
                                   onClick={() => navigate(s.value, '', null)}/>)}
        </StyledSpaces>
        <StyledLayout data-has-file={file ? 'true' : 'false'}>
            <StyledPanel data-panel="list"
                         onDragEnter={(e) => {
                             if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
                                 showUpload()
                             }
                         }}>
                <StyledToolbar>
                    <Breadcrumb spaceName={spaceName} dir={dir} onNavigate={(d) => navigate(space, d, null)}/>
                    {loading && <CircularProgress size={16}/>}
                    <Tooltip title={tr('reload')}>
                        <IconButton size="small" aria-label={tr('reload')} onClick={loadList}><RefreshIcon fontSize="small"/></IconButton>
                    </Tooltip>
                    <Tooltip title={tr('createFile')}>
                        <IconButton size="small" aria-label={tr('createFile')}
                                    onClick={() => setDialog({key: 'name', operation: 'touch', value: ''})}><NoteAddIcon fontSize="small"/></IconButton>
                    </Tooltip>
                    <Tooltip title={tr('createFolder')}>
                        <IconButton size="small" aria-label={tr('createFolder')}
                                    onClick={() => setDialog({key: 'name', operation: 'mkdir', value: ''})}><CreateNewFolderIcon fontSize="small"/></IconButton>
                    </Tooltip>
                    <Tooltip title={tr('upload')}>
                        <IconButton size="small" aria-label={tr('upload')} onClick={showUpload}><CloudUploadIcon fontSize="small"/></IconButton>
                    </Tooltip>
                </StyledToolbar>
                <div style={{padding: '0.5rem 0.5rem 0.25rem'}}>
                    {search ?
                        <Chip label={tr('searchChip', {text: search.text})} onDelete={() => setSearch(null)}
                              deleteIcon={<ClearIcon/>} color="primary" variant="outlined" sx={{maxWidth: '100%'}}/>
                        :
                        <TextField size="small" fullWidth type="search" placeholder={tr('filterPlaceholder')}
                                   value={filter}
                                   onChange={(e) => setFilter(e.target.value)}
                                   onKeyDown={(e) => {
                                       if (e.key === 'Enter' && filter.trim()) {
                                           setSearch({text: filter.trim()})
                                           setFilter('')
                                       } else if (e.key === 'Escape') {
                                           setFilter('')
                                       }
                                   }}
                                   slotProps={{input: {startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small"/></InputAdornment>}}}
                                   helperText={tr('filterHelp')}/>
                    }
                </div>
                {!search && <StyledHeader>
                    <SortButton sortKey="name" sort={sort} onSort={onSort}>{tr('name')}</SortButton>
                    <SortButton sortKey="size" sort={sort} onSort={onSort}>{tr('size')}</SortButton>
                    <SortButton sortKey="mtime" sort={sort} onSort={onSort}>{tr('modified')}</SortButton>
                </StyledHeader>}
                <StyledRows>{listContent}</StyledRows>

                {showDrop && <StyledDropOverlay onDragLeave={(e) => {
                    // only when the pointer leaves the overlay itself (not one of its children)
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        setShowDrop(false)
                    }
                }}>
                    <div style={{display: 'flex', alignItems: 'center', marginBottom: '0.5rem'}}>
                        <Typography variant="subtitle2" style={{flex: 1}}>{tr('uploadTo', {path: spaceName + (dir || '/')})}</Typography>
                        <IconButton size="small" aria-label={_t('core.cancel')} onClick={() => setShowDrop(false)}><CloseIcon fontSize="small"/></IconButton>
                    </div>
                    <FileDrop maxSize={10000000} multi style={{width: '100%', height: '100%'}}
                              accept="*/*"
                              uploadTo="/graphql/upload"
                              data={{keepFileName: true, createMediaEntry: false, uploadDir: space + dir}}
                              resizeImages={false}
                              onSuccess={() => {
                                  loadList()
                                  clearTimeout(dropTimerRef.current)
                                  dropTimerRef.current = setTimeout(() => setShowDrop(false), 2000)
                              }}
                              label={tr('dropHere')}/>
                </StyledDropOverlay>}
            </StyledPanel>

            {editor || <StyledPanel data-panel="editor">
                <StyledEditorHeader><div data-title><div>{tr('recent')}</div></div></StyledEditorHeader>
                <StyledRows>
                    {recentHere.length ? recentHere.map(r => {
                        const s = spaces.find(x => x.value === r.space)
                        const {dir: recentDir, name} = splitPath(r.path)
                        return <StyledSearchRow key={r.space + r.path} onClick={() => navigate(r.space, recentDir, r.path)}>
                            <div data-text>
                                <div>{name}</div>
                                <small>{(s ? s.name : r.space) + ' · ' + (recentDir || '/')}</small>
                            </div>
                        </StyledSearchRow>
                    }) : <StyledEmpty>{tr('noFileOpen')}</StyledEmpty>}
                </StyledRows>
            </StyledPanel>}
        </StyledLayout>

        {menu && <SimpleMenu open={menu.position} anchorReference="anchorPosition" anchorPosition={menu.position}
                             onClose={() => setMenu(null)} noButton items={menuItems}/>}

        {dialog && dialog.key === 'delete' && <SimpleDialog open title={tr('confirmDeletionTitle')}
                                                           onClose={(e) => {
                                                               const entry = dialog.entry
                                                               setDialog(null)
                                                               if (e.key === 'yes') {
                                                                   const path = joinPath(dir, entry.name)
                                                                   runOperation('delete', path).then(() => {
                                                                       notify(tr('done.delete', {name: entry.name}))
                                                                       if (file && (file === path || file.indexOf(path + '/') === 0)) {
                                                                           navigate(space, dir, null)
                                                                       }
                                                                   }).catch(() => {})
                                                               }
                                                           }}
                                                           actions={[{key: 'no', label: _t('core.cancel'), type: 'primary'}, {key: 'yes', label: tr('deleteFile')}]}>
            {tr(isDir(dialog.entry) ? 'confirmFolderDeletion' : 'confirmDeletion', {fileName: dialog.entry.name})}
        </SimpleDialog>}

        {dialog && dialog.key === 'name' && <SimpleDialog open onClose={closeNameDialog}
                                                         title={tr({rename: 'renameFile', copy: 'copyFile', mkdir: 'createFolder', touch: 'createFile'}[dialog.operation])}
                                                         actions={[{key: 'cancel', label: _t('core.cancel')}, {key: 'save', label: _t('core.save'), type: 'primary'}]}>
            <TextField autoFocus fullWidth placeholder={tr('name')} value={dialog.value}
                       error={!!dialog.error} helperText={dialog.error}
                       onChange={(e) => {
                           nameValueRef.current = e.target.value
                           setDialog({...dialog, value: e.target.value, error: null})
                       }}
                       onKeyDown={(e) => {
                           if (e.key === 'Enter') closeNameDialog({key: 'save'})
                       }}/>
        </SimpleDialog>}
    </>

    if (embedded) {
        return content
    }
    return <>
        <Typography variant="h3" gutterBottom>Files</Typography>
        {content}
    </>
}

FilesContainer.propTypes = {
    file: PropTypes.string,
    space: PropTypes.string,
    embedded: PropTypes.bool,
    editOnly: PropTypes.bool
}

export default FilesContainer
