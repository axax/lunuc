import React, {useEffect, useRef, useState} from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import LinearProgress from '@mui/material/LinearProgress'
import FolderRounded from '@mui/icons-material/FolderRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import NavigateNextRounded from '@mui/icons-material/NavigateNextRounded'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'

// only the fields needed for navigation, one folder level per request
const FOLDER_QUERY = 'query mediaGroups($filter:String,$limit:Int,$sort:String){mediaGroups(filter:$filter,limit:$limit,sort:$sort){results{_id name}}}'

/*
 * "Move to..." dialog: navigate through the folders (MediaGroup) and pick the target.
 * The folders that are being moved can not be opened or chosen (no folder inside itself).
 * props: open, items (entries to move), initialPath ([{_id, name}]), sourceFolderId, onClose, onMove(target|null)
 */
export default function MediaMoveDialog({open, items, initialPath, sourceFolderId, onClose, onMove}) {
    const [path, setPath] = useState(initialPath || [])
    const [folders, setFolders] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const requestRef = useRef(0)

    useEffect(() => {
        if (open) setPath(initialPath || [])
    }, [open])

    const current = path.length ? path[path.length - 1] : null
    const currentId = current ? current._id : ''

    useEffect(() => {
        if (!open) return
        const requestId = ++requestRef.current
        setLoading(true)
        setError(null)
        client.query({
            query: FOLDER_QUERY, fetchPolicy: 'network-only',
            variables: {filter: `group==${currentId}`, limit: 500, sort: 'name asc'}
        }).then(response => {
            if (requestId !== requestRef.current) return
            setFolders(response?.data?.mediaGroups?.results || [])
            setLoading(false)
        }).catch(e => {
            if (requestId !== requestRef.current) return
            setError(e.message)
            setFolders([])
            setLoading(false)
        })
    }, [open, currentId])

    const movingIds = (items || []).map(item => item.id)
    const isSameFolder = sourceFolderId !== undefined && sourceFolderId === currentId
    const rootLabel = _t('MediaFileExplorer.root')
    const count = movingIds.length

    return <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle sx={{pb: 1}}>
            {count === 1 ? _t('MediaFileExplorer.moveToTitleOne', {name: items[0].label}) : _t('MediaFileExplorer.moveToTitle', {count})}
        </DialogTitle>
        <DialogContent sx={{px: 2, pb: 0}}>
            <Breadcrumbs separator={<NavigateNextRounded fontSize="small"/>} sx={{px: 1, mb: 1, fontSize: '0.875rem'}}>
                <Box component="button" type="button" onClick={() => setPath([])} sx={crumbSx(!path.length)}>{rootLabel}</Box>
                {path.map((entry, index) =>
                    <Box key={entry._id} component="button" type="button"
                         onClick={() => setPath(path.slice(0, index + 1))}
                         sx={crumbSx(index === path.length - 1)}>{entry.name}</Box>)}
            </Breadcrumbs>
            <Box sx={{height: 2}}>{loading && <LinearProgress sx={{height: 2}}/>}</Box>
            <Box sx={{border: 1, borderColor: 'divider', borderRadius: 1, height: 300, overflowY: 'auto', p: 0.5}}>
                {error ? <Box sx={emptySx}>{error}</Box> :
                    !loading && folders.length === 0 ? <Box sx={emptySx}>{_t('MediaFileExplorer.noSubfolders')}</Box> :
                        folders.map(folder => {
                            const disabled = movingIds.indexOf(folder._id) >= 0
                            return <Box key={folder._id} component="button" type="button" disabled={disabled}
                                        onClick={() => setPath([...path, {_id: folder._id, name: folder.name}])}
                                        sx={{
                                            display: 'flex', alignItems: 'center', gap: 1, width: '100%', px: 1, py: 0.75,
                                            border: 0, borderRadius: 0.5, bgcolor: 'transparent', color: 'text.primary',
                                            font: 'inherit', fontSize: '0.875rem', textAlign: 'left', cursor: 'pointer',
                                            '&:hover': {bgcolor: 'action.hover'},
                                            '&:disabled': {opacity: 0.4, cursor: 'default', bgcolor: 'transparent'}
                                        }}>
                                <FolderRounded fontSize="small" sx={{color: 'primary.main'}}/>
                                <Box component="span" sx={{flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{folder.name}</Box>
                                {!disabled && <ChevronRightRounded fontSize="small" sx={{color: 'text.secondary'}}/>}
                            </Box>
                        })}
            </Box>
        </DialogContent>
        <DialogActions sx={{px: 3, py: 2}}>
            <Button onClick={onClose} sx={{textTransform: 'none'}}>{_t('MediaFileExplorer.cancel')}</Button>
            <Button variant="contained" disableElevation disabled={isSameFolder} sx={{textTransform: 'none'}}
                    onClick={() => onMove(current)}>
                {_t('MediaFileExplorer.moveHere', {folder: current ? current.name : rootLabel})}
            </Button>
        </DialogActions>
    </Dialog>
}

const crumbSx = (isCurrent) => ({
    border: 0, bgcolor: 'transparent', p: 0, font: 'inherit', cursor: isCurrent ? 'default' : 'pointer',
    color: isCurrent ? 'text.primary' : 'text.secondary', fontWeight: isCurrent ? 600 : 400,
    '&:hover': isCurrent ? {} : {color: 'primary.main'}
})

const emptySx = {p: 2, fontSize: '0.875rem', color: 'text.secondary', textAlign: 'center'}
