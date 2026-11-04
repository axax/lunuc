import React, {useMemo, useState} from 'react'
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded'
import DeleteRounded from '@mui/icons-material/DeleteRounded'
import CreateNewFolderRounded from '@mui/icons-material/CreateNewFolderRounded'
import FolderCopyRounded from '@mui/icons-material/FolderCopyRounded'
import DriveFileMoveRounded from '@mui/icons-material/DriveFileMoveRounded'
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded'
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import LibraryAddCheckRounded from '@mui/icons-material/LibraryAddCheckRounded'
import SimpleMenu from '../../../client/components/ui/impl/material/SimpleMenu'
import {client} from '../../../client/middleware/graphql'
import {getImageSrc} from '../../../client/util/media'
import {_t} from '../../../util/i18n.mjs'

/*
 * Shared by the media views (tree: MediaFileExplorer, large icons: MediaGridExplorer):
 * entries, sorting, formatting, the context menu and the data / picker logic.
 */

// copies a folder with all its subfolders (new groups), the files are not linked to the copy
// resolves with {_id, name, parent, count}
export const copyFolderStructure = (item) => {
    const name = `${item.label || item.name} (${_t('MediaFileExplorer.copySuffix')})`
    return client.mutate({
        mutation: 'mutation copyMediaGroupStructure($_id:ID!,$name:String){copyMediaGroupStructure(_id:$_id,name:$name){_id name parent count}}',
        variables: {_id: item.id, name}
    }).then(response => {
        if (response.errors?.length) throw new Error(response.errors[0].message)
        return response.data.copyMediaGroupStructure
    })
}

export const createNewEntry = (item) => {
    return {
        original: item,
        ...item,
        id: item._id,
        label: item.name,
        icon: item.mimeType ? 'doc' : 'folder',
        image: item.mimeType?.startsWith('image') ? getImageSrc(item, 'thumbnail') : null,
        fileType: item.mimeType ? 'doc' : 'folder'
    };
}

// creation time from the mongo ObjectId (first 4 bytes = seconds)
export const createdTime = (item) => item?._id && /^[0-9a-f]{24}$/i.test(item._id) ? parseInt(item._id.substring(0, 8), 16) * 1000 : 0

export const SORT_FIELDS = ['name', 'created', 'modified', 'size', 'type']
export const DEFAULT_SORT = {field: 'name', dir: 'asc'}

// server sort (Media), keeps the first 500 entries of a folder in the right order
export const SERVER_SORT = {name: 'name', created: '_id', modified: 'modifiedAt', size: 'size', type: 'mimeType'}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'}) : null
const compareStrings = (a, b) => collator ? collator.compare(a || '', b || '') : (a || '').localeCompare(b || '')

// folders first, then by the chosen field; folders have no size / type -> sorted by name
export const createCompare = ({field, dir}) => {
    const factor = dir === 'desc' ? -1 : 1
    return (a, b) => {
        const aFolder = a.fileType !== 'doc', bFolder = b.fileType !== 'doc'
        if (aFolder !== bFolder) return aFolder ? -1 : 1
        let result = 0
        if (field === 'created') {
            result = createdTime(a) - createdTime(b)
        } else if (field === 'modified') {
            result = modifiedTime(a) - modifiedTime(b)
        } else if (!aFolder && field === 'size') {
            result = (a.size || 0) - (b.size || 0)
        } else if (!aFolder && field === 'type') {
            result = compareStrings(a.mimeType, b.mimeType)
        }
        if (result === 0) result = compareStrings(a.label, b.label)
        return result * factor
    }
}

// ─── Column values (Finder like list view) ────────────────────────────────────
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

// "Heute, 11:31" / "Gestern, 09:12" / "21.10.2026, 11:31"
export const formatDate = (time) => {
    if (!time) return '--'
    const date = new Date(time)
    const lang = _app_.lang || undefined
    const clock = date.toLocaleTimeString(lang, {hour: '2-digit', minute: '2-digit'})
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000)
    if (days === 0) return `${_t('MediaFileExplorer.today')}, ${clock}`
    if (days === 1) return `${_t('MediaFileExplorer.yesterday')}, ${clock}`
    return `${date.toLocaleDateString(lang, {day: '2-digit', month: '2-digit', year: 'numeric'})}, ${clock}`
}

// like the Finder: decimal units
export const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '--'
    if (bytes < 1000) return `${bytes} Byte`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes, unit = -1
    do {
        value /= 1000
        unit++
    } while (value >= 1000 && unit < units.length - 1)
    return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

const KIND_SUBTYPES = {'svg+xml': 'SVG', 'jpeg': 'JPEG', 'x-icon': 'ICO', 'vnd.microsoft.icon': 'ICO', 'plain': 'Text', 'quicktime': 'QuickTime', 'mpeg': 'MPEG'}

// "JPEG-Bild", "PDF-Dokument", "Ordner"
export const formatKind = (item) => {
    if (item.fileType !== 'doc') return _t('MediaFileExplorer.kind.folder')
    const mimeType = item.mimeType || ''
    const [category, subtype = ''] = mimeType.split('/')
    const name = KIND_SUBTYPES[subtype] || subtype.replace(/^(x-|vnd\.)/, '').split(/[.+-]/)[0].toUpperCase()
    if (['image', 'video', 'audio', 'text', 'font'].indexOf(category) >= 0) {
        return _t('MediaFileExplorer.kind.' + category, {type: name})
    }
    return name ? _t('MediaFileExplorer.kind.document', {type: name}) : _t('MediaFileExplorer.kind.unknown')
}

export const modifiedTime = (item) => item.modifiedAt || createdTime(item)

// date and size columns start with the newest / biggest entries, like the Finder
export const DESC_FIRST = ['modified', 'created', 'size']

// Normalizes the ids returned by a delete mutation: depending on the type they
// arrive either as documents or as plain id strings.
export const extractIds = (ids) => {
    if (!ids) return []
    return (Array.isArray(ids) ? ids : [ids])
        .map(entry => (entry && typeof entry === 'object' ? entry._id : entry))
        .filter(Boolean)
}

// sort expressions for the server queries
export const mediaServerSort = (sort) => `${SERVER_SORT[sort.field] || 'name'} ${sort.dir}`
export const groupServerSort = (sort) => sort.field === 'created' ? `_id ${sort.dir}` : `name ${sort.dir}`

// sorting, remembered in the settings of the type (the same for all media views)
export const useMediaSort = (TypeContainerRef, pageParams) => {
    const [sort, setSort] = useState(() => {
        const saved = TypeContainerRef.getSettingsForType?.('Media', pageParams.meta)?.treeSort
        return saved && SORT_FIELDS.indexOf(saved.field) >= 0 ? {...DEFAULT_SORT, ...saved} : DEFAULT_SORT
    })
    const compareItems = useMemo(() => createCompare(sort), [sort.field, sort.dir])
    // same field -> toggle the direction, date and size columns start with the newest / biggest
    const toggleSort = (field) => {
        const newSort = field === sort.field ?
            {field, dir: sort.dir === 'asc' ? 'desc' : 'asc'} :
            {field, dir: DESC_FIRST.indexOf(field) >= 0 ? 'desc' : 'asc'}
        setSort(newSort)
        TypeContainerRef.setSettingsForType?.('Media', {treeSort: newSort}, {lazy: true})
    }
    return {sort, compareItems, toggleSort}
}

// picker mode: the media view was opened from a TypePicker / editor to choose media
export const getPickerMode = (pageParams) => ({
    isPicker: !!(typeof window !== 'undefined' && window.opener && pageParams.opener),
    isMulti: pageParams.multi === 'true'
})

// hands the chosen media to the opener window
export const closeWithResult = (value) => {
    window.resultValue = value
    window.close()
}

// queries of the media views, bound to the TypesContainer
export const createMediaData = (TypeContainerRef) => {
    const queries = (type) => TypeContainerRef.getTypeQueriesFiltered(type, {loadAll: false})

    // baseFilter (e.g. mimeType=image) of the picker also applies to the media views
    const mediaFilter = (filter) => TypeContainerRef.extendFilter ? TypeContainerRef.extendFilter(filter) : filter

    /*
     * entries of a folder (folders first, then media) as explorer entries
     * isSearch: flat result over all folders (filter expression searchFilter) instead of the folder content,
     *           without folders
     * withFolders: false -> only media (e.g. further pages)
     */
    const loadEntries = async ({folderId, isSearch, searchFilter, sort, limit, page, withFolders = !isSearch, fetchPolicy = 'network-only'}) => {
        const [groupResponse, mediaResponse] = await Promise.all([
            withFolders ? client.query({
                query: queries('MediaGroup').query, fetchPolicy,
                variables: {filter: `group==${folderId}`, limit: 500, sort: groupServerSort(sort)}
            }) : null,
            client.query({
                query: queries('Media').query, fetchPolicy,
                variables: {filter: mediaFilter(isSearch ? searchFilter : `group==${folderId}`), limit, ...(page ? {page} : {}), sort: mediaServerSort(sort)}
            })
        ])
        const medias = mediaResponse?.data?.medias
        const mapItems = (data) => data?.results?.map(item => createNewEntry({parent: folderId, ...item})) ?? []
        return {
            items: [...mapItems(groupResponse?.data?.mediaGroups), ...mapItems(medias)],
            mediaTotal: medias?.total || 0
        }
    }

    // all media that are directly inside a folder
    const fetchFolderMedia = async (folderId) => {
        const response = await client.query({
            query: queries('Media').query, fetchPolicy: 'network-only',
            variables: {filter: mediaFilter(`group==${folderId}`), limit: 1000}
        })
        return response?.data?.medias?.results || []
    }

    // explorer entries -> the raw media objects the opener expects (folders are resolved to their media)
    const resolveMedia = async (entries) => {
        const result = [], seen = new Set()
        const add = (media) => {
            if (media?._id && !seen.has(media._id)) {
                seen.add(media._id)
                result.push(media)
            }
        }
        for (const entry of entries) {
            if (entry.fileType === 'folder') {
                (await fetchFolderMedia(entry.id)).forEach(add)
            } else {
                add(entry.original)
            }
        }
        return result
    }

    // opens the edit dialog, onRenamed(name) after a successful save
    const editItem = (item, onRenamed) => {
        TypeContainerRef.handleEditDataClick(item.original, {
            type: item.fileType === 'folder' ? 'MediaGroup' : 'Media',
            callback: ({data, editedData}) => {
                if (data?.updateMediaGroup || data?.updateMedia) {
                    item.original.name = editedData.name
                    onRenamed(editedData.name)
                }
            }
        })
    }

    return {queries, loadEntries, resolveMedia, editItem}
}

// picker: resolves the chosen entries and returns them to the opener
export const useTakeSelection = (mediaData, isMulti) => {
    const [resolving, setResolving] = useState(false)
    const takeSelection = async (entries) => {
        if (!entries.length || resolving) return
        setResolving(true)
        try {
            const media = await mediaData.resolveMedia(entries)
            if (media.length) closeWithResult(isMulti ? media : media.slice(0, 1))
        } finally {
            setResolving(false)
        }
    }
    return {resolving, takeSelection}
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
// allowMoveTo: offer "move to..." (the tree view moves by drag & drop only)
export function ContextMenu({anchorPosition, onClose, item, onAction, isPicker, isMulti, allowMoveTo}) {
    const open = Boolean(anchorPosition);

    let actions = []
    if (isPicker && item?.fileType === 'doc') {
        actions.push({key: 'select', name: _t('MediaFileExplorer.select'), icon: <CheckCircleOutlineRounded fontSize="small"/>})
    }
    if (isPicker && isMulti && item?.fileType === 'folder') {
        actions.push({key: 'select-folder', name: _t('MediaFileExplorer.selectFolder'), icon: <LibraryAddCheckRounded fontSize="small"/>})
    }
    if (item?.fileType === 'folder' || item?.fileType === 'root') {
        actions = [...actions,
            {key: 'new-folder', name: _t('MediaFileExplorer.newFolder'), icon: <CreateNewFolderRounded fontSize="small"/>},
            {key: 'new-file', name: _t('MediaFileExplorer.newFile'), icon: <AddPhotoAlternateRoundedIcon fontSize="small"/>}
        ]
    }
    if (item?.fileType !== 'root') {
        actions.push({key: 'edit', name: _t('MediaFileExplorer.edit'), icon: <DriveFileRenameOutlineRounded fontSize="small"/>})
        if (item?.fileType === 'folder') {
            actions.push({key: 'copy-structure', name: _t('MediaFileExplorer.copyStructure'), icon: <FolderCopyRounded fontSize="small"/>})
        }
        if (allowMoveTo && !isPicker) {
            actions.push({key: 'move-to', name: _t('MediaFileExplorer.moveTo'), icon: <DriveFileMoveRounded fontSize="small"/>})
        }
        actions.push({divider: true, key: 'delete', name: _t('MediaFileExplorer.delete'), icon: <DeleteRounded fontSize="small"/>, danger: true})
    }

    return <SimpleMenu open={open}
                       anchorReference={"anchorPosition"}
                       anchorPosition={anchorPosition}
                       payload={item}
                       onClose={() => {
                           onClose(null)
                       }}
                       onClick={onAction}
                       key="menu" noButton items={actions}/>
}
