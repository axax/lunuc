import React, {useMemo, useRef, useState} from 'react'
import {AppBar, Toolbar, Button} from '@mui/material'
import SimpleFileExplorer from '../../../client/components/ui/impl/material/SimpleFileExplorer'
import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import CreateNewFolderRounded from '@mui/icons-material/CreateNewFolderRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import LibraryAddCheckRounded from '@mui/icons-material/LibraryAddCheckRounded';
import SimpleMenu from "../../../client/components/ui/impl/material/SimpleMenu";
import {getImageSrc} from "../../../client/util/media";
import {_t} from '../../../util/i18n.mjs'

const createNewEntry = (item) => {
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

// Normalizes the ids returned by a delete mutation: depending on the type they
// arrive either as documents or as plain id strings.
const extractIds = (ids) => {
    if (!ids) return []
    return (Array.isArray(ids) ? ids : [ids])
        .map(entry => (entry && typeof entry === 'object' ? entry._id : entry))
        .filter(Boolean)
}

const MediaFileExplorer = ({_version, TypeContainerRef, defaultExpandedItems, pageParams}) => {

    // Gives access to the tree's state so changes actually trigger a re-render
    const explorerRef = useRef(null)

    // Picker mode: the media view was opened from a TypePicker / editor to choose media
    const isPicker = !!(typeof window !== 'undefined' && window.opener && pageParams.opener)
    const isMulti = pageParams.multi === 'true'
    const [selectedIds, setSelectedIds] = useState([])
    const [resolving, setResolving] = useState(false)

    // Stable component type, otherwise the menu would remount on every render
    const PickerContextMenu = useMemo(() => (props) => <ContextMenu {...props} isPicker={isPicker} isMulti={isMulti}/>, [isPicker, isMulti])

    const mediaQueries = () => TypeContainerRef.getTypeQueriesFiltered('Media', {loadAll: false})

    // baseFilter (e.g. mimeType=image) of the picker also applies to the tree
    const mediaFilter = (filter) => TypeContainerRef.extendFilter ? TypeContainerRef.extendFilter(filter) : filter

    // Loads all media that are directly inside a folder
    const fetchFolderMedia = async (folderId) => {
        const response = await client.query({
            query: mediaQueries().query, fetchPolicy: 'network-only',
            variables: {filter: mediaFilter(`group==${folderId}`), limit: 1000}
        })
        return response?.data?.medias?.results || []
    }

    // Turns tree ids into the raw media objects the opener expects (folders are resolved to their media)
    const resolveSelection = async (ids) => {
        const result = [], seen = new Set()
        const add = (media) => {
            if (media?._id && !seen.has(media._id)) {
                seen.add(media._id)
                result.push(media)
            }
        }
        for (const id of ids) {
            const item = explorerRef.current?.getItem(id)
            if (!item || item.fileType === 'root') continue
            if (item.fileType === 'folder') {
                (await fetchFolderMedia(item.id)).forEach(add)
            } else {
                add(item.original)
            }
        }
        return result
    }

    const closeWithResult = (value) => {
        window.resultValue = value
        window.close()
    }

    const takeSelection = async (ids = selectedIds) => {
        if (!ids.length || resolving) return
        setResolving(true)
        try {
            const items = await resolveSelection(ids)
            if (!items.length) return
            closeWithResult(isMulti ? items : items.slice(0, 1))
        } finally {
            setResolving(false)
        }
    }

    const editItem = (item) => {
        TypeContainerRef.handleEditDataClick(item.original, {
            type: item.fileType === 'folder' ? 'MediaGroup' : 'Media',
            callback: ({data, editedData}) => {
                if (data.updateMediaGroup || data.updateMedia) {
                    item.original.name = editedData.name
                    explorerRef.current?.updateItem(item.id, {
                        name: editedData.name,
                        label: editedData.name
                    })
                }
            }
        })
    }

    return <><SimpleFileExplorer
        ref={explorerRef}
        checkboxSelection={isPicker}
        multiSelect={isPicker && isMulti}
        selectionPropagation={isMulti ? {descendants: true, parents: true} : undefined}
        // Folders can only be picked when multiple media are allowed
        isItemSelectionDisabled={(item) => item?.fileType === 'root' || (item?.fileType === 'folder' && (!isPicker || !isMulti))}
        onSelectionChange={setSelectedIds}
        defaultExpandedItems={defaultExpandedItems}
        key={'mediaTree' + (pageParams.filter || '')}
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
            } else if (action.key === 'new-file') {
                TypeContainerRef.setState({
                    createEditDialog: true,
                    createEditDialogOption: {
                        variant: 'upload',
                        dataToEdit: {
                            group: item.id === 'root' ? [] : [item.original],
                            createdBy: item.original.createdBy,
                            ownerGroup: item.original.ownerGroup || []
                        },
                        callback: ({status, files}) => {
                            console.log(status, files)
                            if (status === 'success' && files?.length) {
                                explorerRef.current?.addItems(
                                    item.id,
                                    files.map(file => createNewEntry({parent: item.id, ...file}))
                                )
                            }
                        }
                    }
                })
            }
        }}
        onItemClick={(event, item, isExpanded) => {
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
        onFetch={async ({id}) => {
            const mediaQueries = TypeContainerRef.getTypeQueriesFiltered('Media', {loadAll: false})
            const mediaGroupQueries = TypeContainerRef.getTypeQueriesFiltered('MediaGroup', {loadAll: false})
            const [mediaGroupResponse, mediaResponse] = await Promise.all([
                pageParams.filter ? null : client.query({
                    query: mediaGroupQueries.query, fetchPolicy: 'cache-and-network',
                    variables: {filter: `group==${id}`, limit: 500}
                }),
                client.query({
                    query: mediaQueries.query, fetchPolicy: 'cache-and-network',
                    variables: {filter: mediaFilter(pageParams.filter ? pageParams.filter : `group==${id}`), limit: 500}
                })
            ])

            const mapItems = (data) =>
                data?.results?.map(item => createNewEntry({parent: id, ...item})) ?? []

            return [...mapItems(mediaGroupResponse?.data?.mediaGroups), ...mapItems(mediaResponse?.data?.medias)]
        }}/>
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

// ─── Context Menu ─────────────────────────────────────────────────────────────
function ContextMenu({anchorPosition, onClose, item, onAction, isPicker, isMulti}) {
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


export default MediaFileExplorer