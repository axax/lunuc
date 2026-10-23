import React, {useEffect, useMemo, useRef, useState} from 'react'
import {styled, alpha} from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Checkbox from '@mui/material/Checkbox'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import AddRounded from '@mui/icons-material/AddRounded'
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined'
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import NavigateNextRounded from '@mui/icons-material/NavigateNextRounded'
import SortRounded from '@mui/icons-material/SortRounded'
import CheckRounded from '@mui/icons-material/CheckRounded'
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded'
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded'
import LinkRounded from '@mui/icons-material/LinkRounded'
import CloseRounded from '@mui/icons-material/CloseRounded'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded'
import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import UploadUtil from '../../../client/util/upload'
import {getImageSrc} from '../../../client/util/media'
import {_t} from '../../../util/i18n.mjs'
import {
    ContextMenu,
    createNewEntry,
    createCompare,
    createdTime,
    modifiedTime,
    formatDate,
    formatSize,
    formatKind,
    extractIds,
    SORT_FIELDS,
    DEFAULT_SORT,
    SERVER_SORT,
    DESC_FIRST
} from './MediaFileExplorer'

/*
 * Grid view of the media library ("large icons"), similar to the media manager of Wix:
 * folders and files as big tiles, breadcrumb navigation, a detail panel on the right,
 * upload by button or drag & drop and moving entries by dragging them onto a folder.
 */

const PAGE_SIZE = 200
const DRAG_TYPE = 'application/x-lunuc-media'
const RESIZABLE_IMAGE = /^image\/(jpe?g|png|webp)$/i
const DEFAULT_CONVERSION = [{quality: 0.9, maxWidth: 2400}]

// ─── Styled components ───────────────────────────────────────────────────────
const Root = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(2),
    position: 'relative'
}))

const Main = styled('div')(({theme}) => ({
    flex: 1,
    minWidth: 0,
    background: theme.palette.background.paper,
    borderRadius: theme.spacing(1.5),
    border: `1px solid ${theme.palette.divider}`,
    position: 'relative'
}))

const Bar = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexWrap: 'wrap',
    minHeight: 56
}))

const Crumb = styled('button')(({theme}) => ({
    border: 0,
    background: 'none',
    font: 'inherit',
    fontSize: '1rem',
    padding: theme.spacing(0.5, 1),
    borderRadius: theme.spacing(0.75),
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    '&:hover': {background: alpha(theme.palette.primary.main, 0.08), color: theme.palette.primary.main},
    '&[data-current]': {color: theme.palette.text.primary, fontWeight: 600, cursor: 'default', background: 'none'},
    '&[data-dragover]': {background: alpha(theme.palette.primary.main, 0.16), color: theme.palette.primary.main}
}))

const GridArea = styled('div')(({theme}) => ({
    position: 'relative',
    padding: theme.spacing(3),
    minHeight: 360,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: theme.spacing(3, 2),
    alignContent: 'start',
    [theme.breakpoints.down('sm')]: {
        padding: theme.spacing(2),
        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        gap: theme.spacing(2, 1.5)
    }
}))

const Tile = styled('div')(({theme}) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.spacing(1),
    cursor: 'pointer',
    outline: 0,
    userSelect: 'none',
    '& .tile-thumb': {
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: theme.spacing(1),
        border: '2px solid transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: 'background-color .15s, border-color .15s',
        background: 'transparent'
    },
    '&[data-file] .tile-thumb': {
        background: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.04) : '#f4f6f9'
    },
    '& .tile-thumb > img, & .tile-thumb > video': {
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        display: 'block',
        pointerEvents: 'none'
    },
    '& .tile-actions, & .tile-check': {
        position: 'absolute',
        top: 6,
        opacity: 0,
        transition: 'opacity .15s'
    },
    '& .tile-actions': {right: 6},
    '& .tile-check': {left: 6},
    '&:hover .tile-thumb, &:focus-visible .tile-thumb': {
        background: alpha(theme.palette.primary.main, 0.08)
    },
    '&:hover .tile-actions, &:focus-within .tile-actions, &:hover .tile-check, &[data-selected] .tile-check, &[data-picker-multi] .tile-check': {
        opacity: 1
    },
    '&[data-selected] .tile-thumb': {
        borderColor: theme.palette.primary.main,
        background: alpha(theme.palette.primary.main, 0.1)
    },
    '&[data-dragover] .tile-thumb': {
        borderColor: theme.palette.primary.main,
        borderStyle: 'dashed',
        background: alpha(theme.palette.primary.main, 0.16)
    },
    '&[data-dragging]': {opacity: 0.4},
    '& .tile-name': {
        width: '100%',
        textAlign: 'center',
        fontSize: '0.875rem',
        lineHeight: 1.3,
        color: theme.palette.text.primary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: theme.spacing(0, 0.5)
    },
    '&[data-selected] .tile-name': {color: theme.palette.primary.main, fontWeight: 500}
}))

const RoundAction = styled(IconButton)(({theme}) => ({
    width: 28,
    height: 28,
    background: alpha(theme.palette.grey[900], 0.75),
    color: theme.palette.common.white,
    '&:hover': {background: theme.palette.grey[900]}
}))

const DropOverlay = styled('div')(({theme}) => ({
    position: 'absolute',
    inset: 8,
    zIndex: 5,
    borderRadius: theme.spacing(1.5),
    border: `2px dashed ${theme.palette.primary.main}`,
    background: alpha(theme.palette.primary.main, 0.08),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    color: theme.palette.primary.main,
    fontWeight: 500,
    pointerEvents: 'none'
}))

const Panel = styled('aside')(({theme}) => ({
    width: 300,
    flexShrink: 0,
    position: 'sticky',
    top: 82, // below the fixed admin header
    background: theme.palette.background.paper,
    borderRadius: theme.spacing(1.5),
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    [theme.breakpoints.down('lg')]: {display: 'none'},
    '& .panel-preview': {
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        borderRadius: theme.spacing(1),
        background: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.04) : '#eef2f8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        marginBottom: theme.spacing(2)
    },
    '& .panel-preview > img, & .panel-preview > video': {maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block'},
    '& .panel-name': {fontWeight: 600, fontSize: '1rem', wordBreak: 'break-word', marginBottom: theme.spacing(2)},
    '& dl': {margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: theme.spacing(0.75, 2), fontSize: '0.8125rem'},
    '& dt': {color: theme.palette.text.secondary},
    '& dd': {margin: 0, wordBreak: 'break-word'},
    '& .panel-hint': {color: theme.palette.text.secondary, fontSize: '0.875rem', lineHeight: 1.5}
}))

const UploadToast = styled('div')(({theme}) => ({
    position: 'fixed',
    left: theme.spacing(2),
    bottom: theme.spacing(2),
    zIndex: theme.zIndex.snackbar,
    width: 340,
    maxWidth: 'calc(100vw - 32px)',
    borderRadius: theme.spacing(1),
    overflow: 'hidden',
    boxShadow: theme.shadows[8],
    background: theme.palette.background.paper,
    '& .toast-head': {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(1),
        minHeight: 44,
        padding: theme.spacing(0.5, 1, 0.5, 2),
        background: theme.palette.grey[900],
        color: theme.palette.common.white,
        fontWeight: 600,
        fontSize: '0.9375rem'
    },
    '& .toast-body': {
        padding: theme.spacing(1.25, 2),
        fontSize: '0.8125rem',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(1)
    },
    '& .toast-body span': {flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}
}))

const PickerBar = styled('div')(({theme}) => ({
    position: 'sticky',
    bottom: 0,
    zIndex: 4,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.spacing(0, 0, 1.5, 1.5),
    background: theme.palette.background.paper
}))

// ─── Icons / thumbnails ──────────────────────────────────────────────────────
const FolderGraphic = ({size = '62%'}) => (
    <svg viewBox="0 0 120 92" style={{width: size, height: 'auto', display: 'block'}} aria-hidden="true">
        <path d="M6 14a8 8 0 0 1 8-8h28.5a8 8 0 0 1 6.2 2.95L54.5 16H106a8 8 0 0 1 8 8v56a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z"
              fill="#dfeafa" stroke="#a9c6ef" strokeWidth="2.5" strokeLinejoin="round"/>
        <path d="M6 30a8 8 0 0 1 8-8h92a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z"
              fill="#e8f0fc" stroke="#a9c6ef" strokeWidth="2.5" strokeLinejoin="round"/>
    </svg>
)

const fileExtension = (item) => {
    const match = /\.([a-z0-9]{1,5})$/i.exec(item.name || '')
    if (match) return match[1].toLowerCase()
    const subtype = (item.mimeType || '').split('/')[1] || ''
    return subtype.replace(/^(x-|vnd\.)/, '').split(/[.+-]/)[0].substring(0, 5) || 'file'
}

const DocGraphic = ({item}) => (
    <Box sx={{position: 'relative', width: '46%'}}>
        <svg viewBox="0 0 80 100" style={{width: '100%', height: 'auto', display: 'block'}} aria-hidden="true">
            <path d="M8 4h44l20 20v68a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill="#fff" stroke="#cfd6e0" strokeWidth="2"/>
            <path d="M52 4v16a4 4 0 0 0 4 4h16" fill="#eef1f5" stroke="#cfd6e0" strokeWidth="2" strokeLinejoin="round"/>
            <path d="M18 40h36M18 48h36M18 56h24" stroke="#3b6fd8" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <Box sx={{
            position: 'absolute', right: '-14%', bottom: '14%', px: 0.75,
            border: '1.5px solid', borderColor: 'primary.main', color: 'primary.main', bgcolor: 'background.paper',
            borderRadius: 0.75, fontSize: '0.75rem', fontWeight: 600, lineHeight: 1.5
        }}>.{fileExtension(item)}</Box>
    </Box>
)

const mediaUrl = (item) => getImageSrc(item, null)

const thumbUrl = (item, width) => {
    const src = mediaUrl(item)
    if ((item.mimeType || '').indexOf('svg') >= 0) return src
    return src + (src.indexOf('?') >= 0 ? '&' : '?') + `format=webp&quality=70&width=${width}`
}

const Thumbnail = ({item, size = 320}) => {
    const [failed, setFailed] = useState(false)
    if (item.fileType !== 'doc') return <FolderGraphic/>
    const mimeType = item.mimeType || ''
    if (!failed && mimeType.startsWith('image/')) {
        return <img src={thumbUrl(item, size)} alt={item.alt || item.label} loading="lazy" draggable={false}
                    onError={() => setFailed(true)}/>
    }
    if (!failed && mimeType.startsWith('video/')) {
        return <>
            <video src={mediaUrl(item) + '#t=0.5'} preload="metadata" muted playsInline onError={() => setFailed(true)}/>
            <Box sx={{
                position: 'absolute', width: 44, height: 44, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.45)', color: '#fff'
            }}><PlayArrowRounded/></Box>
        </>
    }
    return <DocGraphic item={item}/>
}

// ─── Main component ──────────────────────────────────────────────────────────
const MediaGridExplorer = ({TypeContainerRef, pageParams}) => {

    const typeSettings = () => TypeContainerRef.getSettingsForType?.('Media', pageParams.meta) || {}

    // ── sorting (shared with the tree view) ──
    const [sort, setSort] = useState(() => {
        const saved = typeSettings().treeSort
        return saved && SORT_FIELDS.indexOf(saved.field) >= 0 ? {...DEFAULT_SORT, ...saved} : DEFAULT_SORT
    })
    const compareItems = useMemo(() => createCompare(sort), [sort.field, sort.dir])
    const [sortAnchor, setSortAnchor] = useState(null)
    const changeSort = (field) => {
        const newSort = field === sort.field ?
            {field, dir: sort.dir === 'asc' ? 'desc' : 'asc'} :
            {field, dir: DESC_FIRST.indexOf(field) >= 0 ? 'desc' : 'asc'}
        setSort(newSort)
        TypeContainerRef.setSettingsForType?.('Media', {treeSort: newSort})
    }

    // ── current folder (remembered, so the user comes back to the same place) ──
    const isSearch = !!pageParams.filter
    const [path, setPath] = useState(() => {
        const saved = typeSettings().gridPath
        return Array.isArray(saved) ? saved.filter(entry => entry && entry._id) : []
    })
    const currentFolder = path.length ? path[path.length - 1] : null
    const currentFolderId = currentFolder ? currentFolder._id : ''
    const currentFolderRef = useRef(currentFolderId)
    currentFolderRef.current = currentFolderId

    const navigate = (newPath) => {
        setPath(newPath)
        TypeContainerRef.setSettingsForType?.('Media', {gridPath: newPath.map(({_id, name}) => ({_id, name}))})
    }
    const openFolder = (item) => navigate([...path, {_id: item.id, name: item.label}])

    // ── picker mode (media view opened from a TypePicker / editor) ──
    const isPicker = !!(typeof window !== 'undefined' && window.opener && pageParams.opener)
    const isMulti = pageParams.multi === 'true'

    // ── state ──
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [mediaTotal, setMediaTotal] = useState(0)
    const [mediaPage, setMediaPage] = useState(1)
    const [selectedIds, setSelectedIds] = useState([])
    const [contextMenu, setContextMenu] = useState(null)
    const [message, setMessage] = useState(null)
    const [resolving, setResolving] = useState(false)
    const [dragId, setDragId] = useState(null)
    const [dragOverId, setDragOverId] = useState(null)
    const [fileDragActive, setFileDragActive] = useState(false)
    const [upload, setUpload] = useState(null) // {total, done, failed, current, progress, finished}
    const requestRef = useRef(0)
    const fileDragCounter = useRef(0)
    const fileInputRef = useRef(null)

    // ── data ──
    const mediaFilter = (filter) => TypeContainerRef.extendFilter ? TypeContainerRef.extendFilter(filter) : filter
    const serverSort = () => `${SERVER_SORT[sort.field] || 'name'} ${sort.dir}`

    const load = async (page = 1) => {
        const requestId = ++requestRef.current
        const folderId = currentFolderId
        setLoading(true)
        try {
            const mediaQueries = TypeContainerRef.getTypeQueriesFiltered('Media', {loadAll: false})
            const groupQueries = TypeContainerRef.getTypeQueriesFiltered('MediaGroup', {loadAll: false})
            const [groupResponse, mediaResponse] = await Promise.all([
                isSearch || page > 1 ? null : client.query({
                    query: groupQueries.query, fetchPolicy: 'network-only',
                    variables: {filter: `group==${folderId}`, limit: 500, sort: sort.field === 'created' ? `_id ${sort.dir}` : `name ${sort.dir}`}
                }),
                client.query({
                    query: mediaQueries.query, fetchPolicy: 'network-only',
                    variables: {filter: mediaFilter(isSearch ? pageParams.filter : `group==${folderId}`), limit: PAGE_SIZE, page, sort: serverSort()}
                })
            ])
            if (requestId !== requestRef.current) return
            const medias = mediaResponse?.data?.medias
            const mapItems = (data) => data?.results?.map(item => createNewEntry({parent: folderId, ...item})) ?? []
            const newItems = [...mapItems(groupResponse?.data?.mediaGroups), ...mapItems(medias)]
            setItems(prev => page > 1 ? [...prev, ...newItems] : newItems)
            setMediaTotal(medias?.total || 0)
            setMediaPage(page)
        } catch (e) {
            console.error(e)
            if (requestId === requestRef.current) setMessage(e.message)
        } finally {
            if (requestId === requestRef.current) setLoading(false)
        }
    }

    useEffect(() => {
        setSelectedIds([])
        load(1)
    }, [currentFolderId, sort.field, sort.dir, pageParams.filter, pageParams.baseFilter])

    const sortedItems = useMemo(() => [...items].sort(compareItems), [items, compareItems])
    const loadedMediaCount = items.filter(item => item.fileType === 'doc').length
    const folderCount = items.length - loadedMediaCount

    // ── selection ──
    const selectedItems = useMemo(() => selectedIds.map(id => items.find(item => item.id === id)).filter(Boolean), [selectedIds, items])
    const detailItem = selectedItems[selectedItems.length - 1]

    const toggle = (id) => setSelectedIds(ids => ids.indexOf(id) >= 0 ? ids.filter(entry => entry !== id) : [...ids, id])

    const selectItem = (item, event) => {
        if ((isPicker && isMulti) || (!isPicker && (event?.metaKey || event?.ctrlKey))) {
            toggle(item.id)
        } else {
            setSelectedIds([item.id])
        }
    }

    // ── picker result ──
    const closeWithResult = (value) => {
        window.resultValue = value
        window.close()
    }

    const fetchFolderMedia = async (folderId) => {
        const mediaQueries = TypeContainerRef.getTypeQueriesFiltered('Media', {loadAll: false})
        const response = await client.query({
            query: mediaQueries.query, fetchPolicy: 'network-only',
            variables: {filter: mediaFilter(`group==${folderId}`), limit: 1000}
        })
        return response?.data?.medias?.results || []
    }

    const takeSelection = async (list = selectedItems) => {
        if (!list.length || resolving) return
        setResolving(true)
        try {
            const result = [], seen = new Set()
            const add = (media) => {
                if (media?._id && !seen.has(media._id)) {
                    seen.add(media._id)
                    result.push(media)
                }
            }
            for (const item of list) {
                if (item.fileType === 'folder') {
                    (await fetchFolderMedia(item.id)).forEach(add)
                } else {
                    add(item.original)
                }
            }
            if (result.length) closeWithResult(isMulti ? result : result.slice(0, 1))
        } finally {
            setResolving(false)
        }
    }

    // ── actions ──
    const removeItems = (ids) => {
        setItems(prev => prev.filter(item => ids.indexOf(item.id) < 0))
        setSelectedIds(prev => prev.filter(id => ids.indexOf(id) < 0))
    }

    const addItems = (newItems) => setItems(prev => [...prev.filter(item => !newItems.some(entry => entry.id === item.id)), ...newItems])

    const openInNewTab = (item) => {
        const imageData = Util.getImageObject(item, {})
        window.open(imageData?.src || mediaUrl(item), '_blank')?.focus()
    }

    const copyLink = (item) => {
        const url = new URL(mediaUrl(item), window.location.origin).href
        navigator.clipboard?.writeText(url).then(() => setMessage(_t('MediaFileExplorer.linkCopied')))
    }

    const editItem = (item) => {
        TypeContainerRef.handleEditDataClick(item.original, {
            type: item.fileType === 'folder' ? 'MediaGroup' : 'Media',
            callback: ({data, editedData}) => {
                if (data?.updateMediaGroup || data?.updateMedia) {
                    item.original.name = editedData.name
                    setItems(prev => prev.map(entry => entry.id === item.id ? {...entry, name: editedData.name, label: editedData.name} : entry))
                }
            }
        })
    }

    const deleteItems = (list) => {
        if (!list.length) return
        // Media and MediaGroup need separate delete calls (each one opens a confirm dialog),
        // files go first, folders can only be deleted when they are empty anyway
        const files = list.filter(item => item.fileType === 'doc')
        const group = files.length ? files : list.filter(item => item.fileType === 'folder')
        if (!group.length) return
        TypeContainerRef.handleDeleteDataClick(group.map(item => item.original), {
            type: files.length ? 'Media' : 'MediaGroup',
            callback: ({ids, errors}) => {
                if (errors?.length) return
                const deletedIds = extractIds(ids)
                removeItems(deletedIds.length ? deletedIds : group.map(item => item.id))
            }
        })
    }

    // target: {_id, name} of the parent folder, null for the top level
    const createFolder = (target = currentFolder) => {
        const targetId = target ? target._id : ''
        TypeContainerRef.setState({
            createEditDialog: true,
            createEditDialogOption: {
                type: 'MediaGroup',
                title: 'MediaGroup',
                dataToEdit: {
                    group: target ? [{_id: target._id, name: target.name}] : [],
                    createdBy: _app_.user
                },
                callback: ({errors, data, editedData}) => {
                    if (errors?.length) return
                    const created = data?.createMediaGroup
                    if (created?._id && currentFolderRef.current === targetId) {
                        addItems([createNewEntry({parent: targetId, ...editedData, ...created})])
                    }
                }
            }
        })
    }

    // target: {_id, name} of the folder, null for the top level
    const moveItem = (item, target) => {
        const targetId = target ? target._id : ''
        if (!item || item.id === targetId || targetId === currentFolderId) return
        const queries = TypeContainerRef.getTypeQueriesFiltered(item.fileType === 'folder' ? 'MediaGroup' : 'Media', {loadAll: false})
        const onError = (msg) => {
            setMessage(msg)
            load(1)
        }
        client.mutate({
            mutation: queries.update,
            variables: {_id: item.id, group: targetId ? [targetId] : []}
        }).then((response) => {
            if (response?.errors?.length) onError(response.errors[0].message)
        }).catch(e => onError(e.message))
        removeItems([item.id])
        setMessage(_t('MediaFileExplorer.moved', {folder: target ? target.name : _t('MediaFileExplorer.root')}))
    }

    // ── upload ──
    const conversion = () => {
        const media = TypeContainerRef.settings?.Media
        try {
            if (media?.conversion?.length) return JSON.parse(media.conversion[0].conversion)
        } catch (e) {
            console.warn(e)
        }
        return DEFAULT_CONVERSION
    }

    const uploadOne = (file, folderId) => new Promise((resolve) => {
        const send = (dataUrl) => UploadUtil.uploadData({
            dataUrl,
            blob: dataUrl ? undefined : file,
            fileName: file.name,
            uploadTo: '/graphql/upload',
            data: {group: folderId ? [folderId] : null},
            onProgress: (e) => e.total && setUpload(u => u && {...u, progress: Math.round(e.loaded * 100 / e.total)}),
            onLoad: (e) => resolve(e.target.response),
            onError: () => resolve(null)
        })
        if (RESIZABLE_IMAGE.test(file.type)) {
            // same behaviour as the upload field above: big images are scaled down
            UploadUtil.resizeImageFromFile({file, conversion: conversion(), onSuccess: send})
        } else {
            send(null)
        }
    })

    const uploadFiles = async (fileList) => {
        const files = Array.from(fileList || [])
        if (!files.length) return
        const folderId = currentFolderRef.current
        setUpload({total: files.length, done: 0, failed: 0, current: files[0].name, progress: 0, finished: false})
        for (const file of files) {
            setUpload(u => ({...u, current: file.name, progress: 0}))
            const response = await uploadOne(file, folderId)
            const ok = response?.status === 'success'
            if (ok && response.files?.length && currentFolderRef.current === folderId && !isSearch) {
                addItems(response.files.map(entry => createNewEntry({
                    parent: folderId, ...entry, _id: String(entry._id), modifiedAt: Date.now()
                })))
            }
            setUpload(u => ({...u, done: u.done + 1, failed: u.failed + (ok ? 0 : 1)}))
        }
        setUpload(u => ({...u, finished: true}))
    }

    // ── drag & drop: files from the computer / moving tiles ──
    const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).indexOf('Files') >= 0

    const gridDragProps = {
        onDragEnter: (e) => {
            if (!isFileDrag(e) || isSearch) return
            e.preventDefault()
            fileDragCounter.current++
            setFileDragActive(true)
        },
        onDragOver: (e) => {
            if (isFileDrag(e) && !isSearch) e.preventDefault()
        },
        onDragLeave: (e) => {
            if (!isFileDrag(e)) return
            fileDragCounter.current = Math.max(0, fileDragCounter.current - 1)
            if (!fileDragCounter.current) setFileDragActive(false)
        },
        onDrop: (e) => {
            if (!isFileDrag(e) || isSearch) return
            e.preventDefault()
            fileDragCounter.current = 0
            setFileDragActive(false)
            uploadFiles(e.dataTransfer.files)
        }
    }

    // folder tiles and breadcrumbs accept dragged tiles
    const dropTargetProps = (target, key) => ({
        onDragOver: (e) => {
            if (!dragId || isFileDrag(e) || dragId === key) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (dragOverId !== key) setDragOverId(key)
        },
        onDragLeave: (e) => {
            if (dragOverId === key && !e.currentTarget.contains(e.relatedTarget)) setDragOverId(null)
        },
        onDrop: (e) => {
            if (!dragId || isFileDrag(e)) return
            e.preventDefault()
            e.stopPropagation()
            setDragOverId(null)
            moveItem(items.find(item => item.id === dragId), target)
            setDragId(null)
        },
        'data-dragover': dragOverId === key ? '' : undefined
    })

    // ── tile interaction ──
    // double click / enter: open folder, choose media (picker) or edit media
    const activateItem = (item) => {
        if (item.fileType === 'folder') {
            openFolder(item)
        } else if (isPicker) {
            closeWithResult(item.original)
        } else {
            editItem(item)
        }
    }

    // single click: folders open, files get selected
    const onTileClick = (event, item) => {
        if (event.target.closest('.tile-actions, .tile-check')) return
        if (item.fileType === 'folder') {
            openFolder(item)
        } else {
            selectItem(item, event)
        }
    }

    const openMenu = (event, item) => {
        event.preventDefault()
        event.stopPropagation()
        if (item.fileType === 'doc' && selectedIds.indexOf(item.id) < 0 && !(isPicker && isMulti)) setSelectedIds([item.id])
        const rect = event.type === 'contextmenu' ? null : event.currentTarget.getBoundingClientRect()
        setContextMenu({
            position: rect ? {top: rect.bottom + 4, left: rect.left} : {top: event.clientY, left: event.clientX},
            item
        })
    }

    const onMenuAction = (event, item, action) => {
        setContextMenu(null)
        if (!action || !item) return
        const isRoot = item.fileType === 'root'
        switch (action.key) {
            case 'select':
                selectItem(item)
                break
            case 'select-folder':
                takeSelection([item])
                break
            case 'new-folder':
                createFolder(isRoot ? currentFolder : {_id: item.id, name: item.label})
                break
            case 'new-file':
                if (!isRoot) openFolder(item)
                fileInputRef.current?.click()
                break
            case 'edit':
                editItem(item)
                break
            case 'delete':
                deleteItems(selectedIds.indexOf(item.id) >= 0 && selectedItems.length > 1 ? selectedItems : [item])
                break
        }
    }

    // ── render ──
    const rootLabel = _t('MediaFileExplorer.root')

    return <Root>
        <Main>
            <Bar>
                <Breadcrumbs separator={<NavigateNextRounded fontSize="small"/>} sx={{flex: 1, minWidth: 0}}>
                    {isSearch ?
                        <Crumb as="span" data-current="">{_t('MediaFileExplorer.searchResults')}</Crumb> :
                        [
                            <Crumb key="root" type="button" onClick={() => path.length && navigate([])}
                                   data-current={path.length ? undefined : ''}
                                   {...(path.length ? dropTargetProps(null, 'crumb-root') : {})}>{rootLabel}</Crumb>,
                            ...path.map((entry, index) => {
                                const isLast = index === path.length - 1
                                return <Crumb key={entry._id} type="button" data-current={isLast ? '' : undefined}
                                              onClick={() => !isLast && navigate(path.slice(0, index + 1))}
                                              {...(isLast ? {} : dropTargetProps(entry, 'crumb-' + entry._id))}>{entry.name}</Crumb>
                            })
                        ]}
                </Breadcrumbs>

                <Tooltip title={_t('MediaFileExplorer.sortBy')}>
                    <IconButton onClick={(e) => setSortAnchor(e.currentTarget)}><SortRounded/></IconButton>
                </Tooltip>
                <Menu anchorEl={sortAnchor} open={!!sortAnchor} onClose={() => setSortAnchor(null)}>
                    {SORT_FIELDS.map(field => <MenuItem key={field} selected={sort.field === field} onClick={() => {
                        changeSort(field)
                        setSortAnchor(null)
                    }}>
                        <ListItemIcon>{sort.field === field && <CheckRounded fontSize="small"/>}</ListItemIcon>
                        <ListItemText primary={_t('MediaFileExplorer.sort.' + field)}
                                      secondary={sort.field === field ? _t('MediaFileExplorer.sort.' + sort.dir) : null}/>
                    </MenuItem>)}
                </Menu>
                {!isSearch && <>
                    <Tooltip title={_t('MediaFileExplorer.newFolder')}>
                        <IconButton onClick={() => createFolder()}><CreateNewFolderOutlined/></IconButton>
                    </Tooltip>
                    <Button variant="contained" disableElevation startIcon={<AddRounded/>}
                            sx={{borderRadius: 5, textTransform: 'none', px: 2}}
                            onClick={() => fileInputRef.current?.click()}>
                        {_t('MediaFileExplorer.upload')}
                    </Button>
                </>}
                <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => {
                    uploadFiles(e.target.files)
                    e.target.value = ''
                }}/>
            </Bar>

            <Box sx={{height: 2}}>{loading && <LinearProgress sx={{height: 2}}/>}</Box>

            <GridArea {...gridDragProps}
                      onClick={(e) => e.target === e.currentTarget && !(isPicker && isMulti) && setSelectedIds([])}
                      onContextMenu={(e) => {
                          if (e.target !== e.currentTarget || isSearch) return
                          openMenu(e, {id: currentFolderId || 'root', fileType: 'root', original: {createdBy: _app_.user}})
                      }}>

                {sortedItems.map(item => {
                    const selected = selectedIds.indexOf(item.id) >= 0
                    const isFolder = item.fileType === 'folder'
                    const canCheck = isPicker && !isFolder
                    return <Tile key={item.id}
                                 tabIndex={0}
                                 role="button"
                                 title={item.label}
                                 data-file={isFolder ? undefined : ''}
                                 data-selected={selected ? '' : undefined}
                                 data-dragging={dragId === item.id ? '' : undefined}
                                 data-picker-multi={isPicker && isMulti && !isFolder ? '' : undefined}
                                 draggable={!isPicker && !isSearch}
                                 onDragStart={(e) => {
                                     e.dataTransfer.setData(DRAG_TYPE, item.id)
                                     e.dataTransfer.effectAllowed = 'move'
                                     setDragId(item.id)
                                 }}
                                 onDragEnd={() => {
                                     setDragId(null)
                                     setDragOverId(null)
                                 }}
                                 {...(isFolder ? dropTargetProps({_id: item.id, name: item.label}, item.id) : {})}
                                 onClick={(e) => onTileClick(e, item)}
                                 onDoubleClick={(e) => !isFolder && !e.target.closest('.tile-actions, .tile-check') && activateItem(item)}
                                 onContextMenu={(e) => openMenu(e, item)}
                                 onKeyDown={(e) => {
                                     if (e.target !== e.currentTarget) return
                                     if (e.key === 'Enter') {
                                         activateItem(item)
                                     } else if (e.key === ' ') {
                                         e.preventDefault()
                                         if (!isFolder) selectItem(item, e)
                                     } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isPicker) {
                                         deleteItems([item])
                                     }
                                 }}>
                        <div className="tile-thumb">
                            <Thumbnail item={item}/>
                            {canCheck && <Checkbox className="tile-check" size="small" checked={selected}
                                                   onClick={(e) => {
                                                       e.stopPropagation()
                                                       selectItem(item, {metaKey: true})
                                                   }}
                                                   sx={{p: 0.25, bgcolor: 'background.paper', borderRadius: 1, '&:hover': {bgcolor: 'background.paper'}}}/>}
                            <div className="tile-actions">
                                <RoundAction size="small" aria-label="menu" onClick={(e) => openMenu(e, item)}>
                                    <MoreHorizRounded fontSize="small"/>
                                </RoundAction>
                            </div>
                        </div>
                        <div className="tile-name">{item.label}</div>
                    </Tile>
                })}

                {!loading && !items.length && <Box sx={{
                    gridColumn: '1 / -1', py: 8, textAlign: 'center', color: 'text.secondary',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5
                }}>
                    <FolderGraphic size="120px"/>
                    <Box sx={{fontWeight: 600, color: 'text.primary'}}>
                        {isSearch ? _t('MediaFileExplorer.noResults') : _t('MediaFileExplorer.emptyFolder')}
                    </Box>
                    {!isSearch && <>
                        <Box sx={{fontSize: '0.875rem'}}>{_t('MediaFileExplorer.emptyHint')}</Box>
                        <Button variant="outlined" startIcon={<CloudUploadOutlined/>} sx={{textTransform: 'none', borderRadius: 5}}
                                onClick={() => fileInputRef.current?.click()}>{_t('MediaFileExplorer.upload')}</Button>
                    </>}
                </Box>}

                {loadedMediaCount < mediaTotal && <Box sx={{gridColumn: '1 / -1', textAlign: 'center'}}>
                    <Button disabled={loading} onClick={() => load(mediaPage + 1)} sx={{textTransform: 'none'}}>
                        {_t('MediaFileExplorer.loadMore', {count: mediaTotal - loadedMediaCount})}
                    </Button>
                </Box>}

                {fileDragActive && <DropOverlay>
                    <CloudUploadOutlined sx={{fontSize: 48}}/>
                    {_t('MediaFileExplorer.dropHere', {folder: currentFolder ? currentFolder.name : rootLabel})}
                </DropOverlay>}
            </GridArea>

            {isPicker && <PickerBar>
                <Box sx={{flex: 1, fontSize: '0.875rem', color: 'text.secondary'}}>
                    {selectedItems.length > 0 && _t('MediaFileExplorer.selectedCount', {count: selectedItems.length})}
                </Box>
                <Button variant="contained" disableElevation disabled={!selectedItems.length || resolving}
                        sx={{borderRadius: 5, textTransform: 'none', px: 3}} onClick={() => takeSelection()}>
                    {resolving ? _t('MediaFileExplorer.loading') : _t('MediaFileExplorer.add')}
                </Button>
            </PickerBar>}
        </Main>

        <Panel>
            {detailItem ? <>
                <div className="panel-preview">
                    {(detailItem.mimeType || '').startsWith('video/') ?
                        <video src={mediaUrl(detailItem)} controls preload="metadata"/> :
                        <Thumbnail key={detailItem.id} item={detailItem} size={600}/>}
                </div>
                <div className="panel-name">{detailItem.label}</div>
                {selectedItems.length > 1 &&
                <Box sx={{mb: 2, fontSize: '0.875rem', color: 'primary.main'}}>
                    {_t('MediaFileExplorer.selectedCount', {count: selectedItems.length})}
                </Box>}
                <dl>
                    <dt>{_t('MediaFileExplorer.sort.type')}</dt>
                    <dd>{formatKind(detailItem)}</dd>
                    <dt>{_t('MediaFileExplorer.sort.size')}</dt>
                    <dd>{formatSize(detailItem.size)}</dd>
                    <dt>{_t('MediaFileExplorer.sort.modified')}</dt>
                    <dd>{formatDate(modifiedTime(detailItem))}</dd>
                    <dt>{_t('MediaFileExplorer.sort.created')}</dt>
                    <dd>{formatDate(createdTime(detailItem))}</dd>
                </dl>
                <Divider sx={{my: 2}}/>
                <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5}}>
                    {isPicker && <Button variant="contained" disableElevation fullWidth disabled={resolving}
                                         sx={{borderRadius: 5, textTransform: 'none', mb: 1}}
                                         onClick={() => takeSelection()}>{_t('MediaFileExplorer.add')}</Button>}
                    <Button size="small" startIcon={<OpenInNewRounded/>} sx={{textTransform: 'none'}}
                            onClick={() => openInNewTab(detailItem)}>{_t('MediaFileExplorer.open')}</Button>
                    <Button size="small" startIcon={<LinkRounded/>} sx={{textTransform: 'none'}}
                            onClick={() => copyLink(detailItem)}>{_t('MediaFileExplorer.copyLink')}</Button>
                    {!isPicker && <>
                        <Button size="small" startIcon={<DriveFileRenameOutlineRounded/>} sx={{textTransform: 'none'}}
                                onClick={() => editItem(detailItem)}>{_t('MediaFileExplorer.edit')}</Button>
                        <Button size="small" color="error" startIcon={<DeleteOutlineRounded/>} sx={{textTransform: 'none'}}
                                onClick={() => deleteItems(selectedItems)}>{_t('MediaFileExplorer.delete')}</Button>
                    </>}
                </Box>
            </> : <>
                <div className="panel-preview"><FolderGraphic size="45%"/></div>
                <div className="panel-name">{isSearch ? _t('MediaFileExplorer.searchResults') : currentFolder ? currentFolder.name : rootLabel}</div>
                <Box className="panel-hint" sx={{mb: 2}}>
                    {_t('MediaFileExplorer.folderInfo', {folders: folderCount, files: mediaTotal || loadedMediaCount})}
                </Box>
                {!isSearch && <Button size="small" startIcon={<CreateNewFolderOutlined/>} sx={{textTransform: 'none', mb: 2}}
                                      onClick={() => createFolder()}>{_t('MediaFileExplorer.newFolder')}</Button>}
                <div className="panel-hint">{_t('MediaFileExplorer.panelHint')}</div>
            </>}
        </Panel>

        <ContextMenu anchorPosition={contextMenu?.position} item={contextMenu?.item}
                     onClose={() => setContextMenu(null)} onAction={onMenuAction}
                     isPicker={isPicker} isMulti={isMulti}/>

        {upload && <UploadToast>
            <div className="toast-head">
                <Box sx={{flex: 1}}>
                    {upload.finished ?
                        _t('MediaFileExplorer.uploadDone', {count: upload.done - upload.failed}) :
                        _t('MediaFileExplorer.uploading', {done: upload.done + 1, total: upload.total})}
                </Box>
                {upload.finished && <IconButton size="small" sx={{color: 'inherit'}} onClick={() => setUpload(null)}>
                    <CloseRounded fontSize="small"/>
                </IconButton>}
            </div>
            {!upload.finished && <LinearProgress variant="determinate" value={upload.progress || 0}/>}
            <div className="toast-body">
                <span>{upload.finished && upload.failed ? _t('MediaFileExplorer.uploadFailed', {count: upload.failed}) : upload.current}</span>
                {upload.finished ? (upload.failed ?
                    <ErrorOutlineRounded color="error" fontSize="small"/> :
                    <CheckCircleRounded color="primary" fontSize="small"/>) :
                    <CircularProgress size={16}/>}
            </div>
        </UploadToast>}

        <Snackbar open={!!message} autoHideDuration={3000} onClose={() => setMessage(null)} message={message}
                  anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}/>
    </Root>
}

export default MediaGridExplorer
