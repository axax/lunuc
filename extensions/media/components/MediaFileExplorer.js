import React, {useEffect, useMemo, useRef, useState} from 'react'
import {AppBar, Toolbar, Button} from '@mui/material'
import SimpleFileExplorer from '../../../client/components/ui/impl/material/SimpleFileExplorer'
import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import {_t} from '../../../util/i18n.mjs'
import {setUploadTarget, onMediaUploaded, openUploadDialog} from './MediaUploadBar'
import {
    ContextMenu,
    copyFolderStructure,
    createNewEntry,
    createdTime,
    modifiedTime,
    formatDate,
    formatSize,
    formatKind,
    extractIds,
    useMediaSort,
    getPickerMode,
    closeWithResult,
    createMediaData,
    useTakeSelection,
    getSearchScope
} from './mediaExplorerCommon'

// tree view of the media library (Finder like list with columns)

const COLUMNS = [
    {key: 'modified', label: 'MediaFileExplorer.sort.modified', width: 160, render: item => formatDate(modifiedTime(item))},
    {key: 'created', label: 'MediaFileExplorer.sort.created', width: 160, hideBelow: 'lg', render: item => formatDate(createdTime(item))},
    {key: 'size', label: 'MediaFileExplorer.sort.size', width: 90, align: 'right', hideBelow: 'sm', render: item => item.fileType === 'doc' ? formatSize(item.size) : '--'},
    {key: 'type', label: 'MediaFileExplorer.sort.type', width: 150, hideBelow: 'md', render: formatKind}
]

const MediaFileExplorer = ({_version, TypeContainerRef, defaultExpandedItems, pageParams, searchScope: searchScopeProp}) => {

    // Gives access to the tree's state so changes actually trigger a re-render
    const explorerRef = useRef(null)

    // sorting, remembered in the settings of the type; click on a column header toggles the direction
    const {sort, compareItems, toggleSort} = useMediaSort(TypeContainerRef, pageParams)
    // the tree keeps its onFetch, so it reads the current sort from the ref
    const sortRef = useRef(sort)
    sortRef.current = sort
    const columns = useMemo(() => COLUMNS.map(column => ({...column, label: _t(column.label)})), [])

    // search expression or filter chips: flat result instead of the folder structure
    const isSearch = !!(pageParams.filter || pageParams.prettyFilter)
    // search: files and folders, only folders or only files (chosen in the media toolbar)
    const searchScope = getSearchScope(searchScopeProp)

    const {isPicker, isMulti} = getPickerMode(pageParams)
    const [selectedIds, setSelectedIds] = useState([])
    const mediaData = useMemo(() => createMediaData(TypeContainerRef), [TypeContainerRef])
    const {resolving, takeSelection: takeEntries} = useTakeSelection(mediaData, isMulti)

    // Stable component type, otherwise the menu would remount on every render
    const PickerContextMenu = useMemo(() => (props) => <ContextMenu {...props} isPicker={isPicker} isMulti={isMulti}/>, [isPicker, isMulti])

    // tree ids -> entries (the root can't be chosen)
    const takeSelection = (ids = selectedIds) => takeEntries(ids
        .map(id => explorerRef.current?.getItem(id))
        .filter(item => item && item.fileType !== 'root'))

    const editItem = (item) => mediaData.editItem(item, name => explorerRef.current?.updateItem(item.id, {name, label: name}))

    // ── upload: button, drag & drop and progress live in the shared MediaUploadBar ──
    // it uploads into the folder that was clicked last (a file counts as its folder)
    const targetFromItem = (item) => {
        const folder = item?.fileType === 'doc' ? explorerRef.current?.getItem(item.parent) : item
        return folder?.fileType === 'folder' ? {_id: folder.id, name: folder.label} : null
    }

    useEffect(() => {
        return onMediaUploaded(({folderId, files}) => {
            if (!files) return
            const parentId = folderId || 'root'
            explorerRef.current?.addItems(parentId, files.map(file => createNewEntry({
                parent: parentId, ...file, _id: String(file._id), modifiedAt: Date.now()
            })))
        })
    }, [])

    return <><SimpleFileExplorer
        ref={explorerRef}
        compareItems={compareItems}
        columns={columns}
        nameLabel={_t('MediaFileExplorer.sort.name')}
        sort={sort}
        onSortChange={toggleSort}
        checkboxSelection={isPicker}
        multiSelect={isPicker && isMulti}
        selectionPropagation={isMulti ? {descendants: true, parents: true} : undefined}
        // Folders can only be picked when multiple media are allowed
        isItemSelectionDisabled={(item) => item?.fileType === 'root' || (item?.fileType === 'folder' && (!isPicker || !isMulti))}
        onSelectionChange={setSelectedIds}
        defaultExpandedItems={defaultExpandedItems}
        key={'mediaTree' + (pageParams.filter || '') + (pageParams.prettyFilter || '') + (isSearch ? searchScope : '')}
        ContextMenu={PickerContextMenu}
        enableDragAndDrop={true}
        onItemAction={(item, action, parentItem) => {
            if (action.key === 'delete') {
                TypeContainerRef.handleDeleteDataClick([item.original], {
                    type: item.fileType === 'folder' ? 'MediaGroup' : 'Media',
                    // Do not check for a specific mutation result field here: it
                    // differs between Media and MediaGroup. Rely on the ids instead.
                    callback: ({ids, errors}) => {
                        if (errors?.length) return
                        const deletedIds = extractIds(ids)
                        const idsToRemove = deletedIds.length ? deletedIds : [item.original._id]
                        idsToRemove.forEach(id => explorerRef.current?.removeItem(id))
                    }
                })
            } else if (action.key === 'move') {

                const queries = TypeContainerRef.getTypeQueriesFiltered(
                    item.source.fileType === 'folder' ? 'MediaGroup' : 'Media',
                    {loadAll: false}
                )
                const group = []
                if (item.targetFolderId !== 'root') {
                    group.push(item.targetFolderId)
                }
                client.mutate({
                    mutation: queries.update,
                    variables: {
                        _id: item.source._id,
                        group
                    }
                })
            } else if (action.key === 'edit') {
                editItem(item)
            } else if (action.key === 'select') {
                explorerRef.current?.toggleItemSelection(item.id)
            } else if (action.key === 'select-folder') {
                takeSelection([item.id])
            } else if (action.key === 'new-folder') {
                TypeContainerRef.setState({
                    createEditDialog: true,
                    createEditDialogOption: {
                        type: 'MediaGroup',
                        title: 'MediaGroup',
                        dataToEdit: {
                            group: item.id === 'root' ? [] : [item.original],
                            createdBy: item.original.createdBy,
                            ownerGroup: item.original.ownerGroup || []
                        },
                        callback: ({errors, data, editedData}) => {
                            console.log(errors, data)
                            if (errors?.length) return
                            const created = data.createMediaGroup || data.createMedia
                            const newEntry = Object.assign({parent: item.id}, editedData, created)
                            if (newEntry._id) {
                                explorerRef.current?.addItems(item.id, [createNewEntry(newEntry)])
                            }
                        }
                    }
                })
            } else if (action.key === 'copy-structure') {
                copyFolderStructure(item).then(({_id, name, parent}) => {
                    const parentId = parent || 'root'
                    explorerRef.current?.addItems(parentId, [createNewEntry({parent: parentId, _id: String(_id), name, createdBy: item.original.createdBy, ownerGroup: item.original.ownerGroup})])
                }).catch(e => console.error(e))
            } else if (action.key === 'new-file') {
                setUploadTarget(targetFromItem(item))
                openUploadDialog()
            }
        }}
        onRootClick={() => setUploadTarget(null)}
        onItemClick={(event, item, isExpanded) => {
            setUploadTarget(targetFromItem(item))
            if (event.detail === 2) {
                item.singleClicked = false
                event.preventDefault()
                event.stopPropagation()
                if (isPicker) {
                    if (item.fileType === 'folder') {
                        if (isMulti) takeSelection([item.id])
                    } else {
                        closeWithResult(item.original)
                    }
                } else {
                    editItem(item)
                }
                return
            } else if (isPicker) {
                // In the picker a single click selects the media instead of opening it
                if (item.fileType === 'doc') {
                    explorerRef.current?.toggleItemSelection(item.id, event)
                }
            } else if (item.fileType === 'doc') {
                item.singleClicked = true
                setTimeout(() => {
                    if (item.singleClicked) {
                        item.singleClicked = false
                        const imageData = Util.getImageObject(item, {})
                        window.open(imageData.src, '_blank').focus()
                    }
                }, 500)
            }
        }}
        // the search result is the top level, a found folder shows its whole content when it is expanded
        onFetch={async ({id}) => (await mediaData.loadEntries({
            folderId: id, isSearch: isSearch && !id, searchFilter: pageParams.filter, prettyFilter: pageParams.prettyFilter,
            searchScope, sort: sortRef.current, limit: 500, fetchPolicy: 'cache-and-network'
        })).items}/>
        {isPicker && selectedIds.length > 0 &&
        <AppBar position="fixed" color="primary" style={{top: 'auto', bottom: 0}}>
            <Toolbar>
                <Button color="secondary" variant="contained" disabled={resolving}
                        onClick={() => takeSelection()}>
                    {resolving ? _t('MediaFileExplorer.loading') : `${_t('MediaFileExplorer.takeSelection')} (${selectedIds.length})`}
                </Button>
            </Toolbar>
        </AppBar>}
    </>
}


// props (pageParams, TypeContainerRef) only change with the page params: no re-render on every
// state change of the TypesContainer (dialogs, selection, settings)
export default React.memo(MediaFileExplorer)