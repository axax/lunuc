import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {styled, alpha} from '@mui/material/styles'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Popover from '@mui/material/Popover'
import LinearProgress from '@mui/material/LinearProgress'
import AddRounded from '@mui/icons-material/AddRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import CloudUploadOutlined from '@mui/icons-material/CloudUploadOutlined'
import UploadUtil from '../../../client/util/upload'
import Async from '../../../client/components/Async'
import {_t} from '../../../util/i18n.mjs'

const TypePicker = (props) => <Async {...props} load={() => import(/* webpackChunkName: "admin" */ '../../../client/components/TypePicker')}/>

const RESIZABLE_IMAGE = /^image\/(jpe?g|png|webp)$/i
const DEFAULT_CONVERSION = [{quality: 0.9, maxWidth: 2400}]
// files uploaded at the same time (more throughput for many small files, the browser allows ~6 per host)
const MAX_PARALLEL = 3

/**
 * One upload for all media views (table, grid, tree).
 *
 * The views only tell the store which folder is "current" (setUploadTarget) and
 * listen for finished uploads (onMediaUploaded) to show the new files. Button,
 * drag & drop and options live here exactly once. The progress is shown in the NotificationHandler.
 *
 * Components subscribe to single slices of the store (useStoreValue), so the progress events only
 * re-render the progress and not the whole toolbar.
 */
const state = {target: null, targetSet: false, conversion: null, upload: null}
const listeners = new Set()
const uploadedListeners = new Set()
const notify = () => listeners.forEach(fn => fn())
const subscribe = (fn) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
}
// re-renders only when the selected slice changes (slices are replaced, never mutated)
const useStoreValue = (selector) => useSyncExternalStore(subscribe, () => selector(state), () => selector(state))

let fileInput = null
let overrideTarget
const pending = [] // [{file, folderId}]
let running = 0
let nextUploadId = 0

const toTarget = (target) => target && target._id ? {_id: String(target._id), name: target.name} : null

// the chosen target stays when the view changes: views read it again when they are opened
export const getUploadTarget = () => state.target
export const hasUploadTarget = () => state.targetSet

// restores the target saved in the type settings (after a page reload), does not overwrite a choice
export const initUploadTarget = (saved) => {
    if (!state.targetSet && saved?._id) {
        state.target = toTarget(saved)
        state.targetSet = true
    }
}

export const setUploadTarget = (target) => {
    const next = toTarget(target)
    state.targetSet = true
    if (state.target?._id === next?._id && state.target?.name === next?.name) return
    state.target = next
    notify()
}

const setConversion = (conversion) => {
    if (state.conversion === conversion) return
    state.conversion = conversion
    notify()
}

// listener({folderId, files}) for every uploaded file, listener({finished: true}) once per batch
export const onMediaUploaded = (fn) => {
    uploadedListeners.add(fn)
    return () => uploadedListeners.delete(fn)
}

const emitUploaded = (event) => uploadedListeners.forEach(fn => {
    try {
        fn(event)
    } catch (e) {
        // a broken listener must not stop the upload
        console.error(e)
    }
})

// optional folder: upload only this time into that folder (e.g. from a context menu)
export const openUploadDialog = (folder) => {
    overrideTarget = folder ? toTarget(folder) : undefined
    fileInput?.click()
}

const getConversion = () => {
    try {
        if (state.conversion?.length) return JSON.parse(state.conversion[0].conversion)
    } catch (e) {
        console.warn(e)
    }
    return DEFAULT_CONVERSION
}

// overall progress: finished files plus the part of the running ones
const overallProgress = ({total, done, active}) => {
    const running = Object.values(active).reduce((sum, entry) => sum + entry.progress, 0) / 100
    return total ? Math.min(100, Math.round((done + running) * 100 / total)) : 0
}

// replaces state.upload (new object = new slice) and only notifies when something visible changed
const patchUpload = (changes) => {
    if (!state.upload) return
    const next = {...state.upload, ...changes}
    next.progress = overallProgress(next)
    next.current = Object.values(next.active).map(entry => entry.name).join(', ')
    const prev = state.upload
    if (prev.progress === next.progress && prev.current === next.current && prev.done === next.done &&
        prev.total === next.total && prev.failed === next.failed && prev.finished === next.finished) {
        // e.g. a progress event that does not move the rounded percentage
        state.upload = next
        return
    }
    state.upload = next
    notify()
}

const setActive = (id, entry) => {
    const active = {...state.upload.active}
    if (entry) active[id] = entry
    else delete active[id]
    return active
}

// resolves with the server response or null, never rejects
const uploadOne = async (file, folderId, id) => {
    try {
        const blob = RESIZABLE_IMAGE.test(file.type) ?
            // big images are scaled down (falls back to the original file)
            await UploadUtil.resizeImageToBlob({file, conversion: getConversion()}) : file
        return await new Promise((resolve) => UploadUtil.uploadData({
            blob,
            fileName: file.name,
            uploadTo: '/graphql/upload',
            data: {group: folderId ? [folderId] : null},
            onProgress: (e) => e.total && state.upload?.active[id] &&
                patchUpload({active: setActive(id, {name: file.name, progress: Math.round(e.loaded * 100 / e.total)})}),
            onLoad: (e) => resolve(e.target.response),
            onError: () => resolve(null)
        }))
    } catch (e) {
        console.error(e)
        return null
    }
}

const pump = () => {
    while (running < MAX_PARALLEL && pending.length) {
        const {file, folderId} = pending.shift()
        const id = ++nextUploadId
        running++
        patchUpload({active: setActive(id, {name: file.name, progress: 0})})
        uploadOne(file, folderId, id).then(response => {
            const ok = response?.status === 'success'
            if (ok && response.files?.length) {
                emitUploaded({folderId, files: response.files})
            }
            running--
            patchUpload({
                active: setActive(id),
                done: state.upload.done + 1,
                failed: state.upload.failed + (ok ? 0 : 1)
            })
            if (!running && !pending.length) {
                patchUpload({finished: true})
                emitUploaded({finished: true})
            } else {
                pump()
            }
        })
    }
}

// folder undefined: current target, otherwise upload into that folder
export const uploadFiles = (fileList, folder) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const folderId = (folder ? toTarget(folder) : state.target)?._id || ''

    if (state.upload && !state.upload.finished) {
        // an upload is already running: its notification just gets longer
        patchUpload({total: state.upload.total + files.length})
    } else {
        state.upload = {total: files.length, done: 0, failed: 0, active: {}, current: '', progress: 0, finished: false}
        notify()
        // the progress is a component inside the notification, it updates itself from the store
        _app_.dispatcher.addNotification({key: 'mediaUpload' + Date.now(), message: <UploadProgress/>, autoHideDuration: 3600000})
    }
    files.forEach(file => pending.push({file, folderId}))
    pump()
}

// content of the notification: progress while uploading, result when finished (then it closes itself)
const UploadProgress = () => {
    const upload = useStoreValue(s => s.upload)
    const finished = !!upload?.finished
    useEffect(() => {
        if (!finished) return
        // still mounted = still the visible notification
        const timer = setTimeout(() => _app_.dispatcher.addNotification(), 4000)
        return () => clearTimeout(timer)
    }, [finished])
    if (!upload) return null
    const ok = upload.done - upload.failed
    return <Box sx={{width: 260, maxWidth: '100%'}}>
        <Box>
            {finished ?
                [ok > 0 && _t('MediaFileExplorer.uploadDone', {count: ok}),
                    upload.failed > 0 && _t('MediaFileExplorer.uploadFailed', {count: upload.failed})].filter(Boolean).join(' – ') :
                _t('MediaFileExplorer.uploading', {done: Math.min(upload.done + 1, upload.total), total: upload.total})}
        </Box>
        {!finished && <>
            <Box sx={{fontSize: '0.75rem', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', my: 0.5}}>
                {upload.current}
            </Box>
            <LinearProgress variant="determinate" value={upload.progress || 0}/>
        </>}
    </Box>
}

const DropOverlay = styled('div')(({theme}) => ({
    position: 'fixed',
    inset: 8,
    zIndex: theme.zIndex.modal - 1,
    borderRadius: theme.spacing(1.5),
    border: `3px dashed ${theme.palette.primary.main}`,
    background: alpha(theme.palette.primary.main, 0.1),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(1),
    color: theme.palette.primary.main,
    fontWeight: 600,
    pointerEvents: 'none'
}))

export const MediaUploadBar = ({settings, view, container}) => {
    // only these two slices: the upload progress does not re-render the toolbar
    const target = useStoreValue(s => s.target)
    const conversion = useStoreValue(s => s.conversion)
    const isTable = view !== 'grid' && view !== 'tree'
    const [dragActive, setDragActive] = useState(false)
    const [optionsAnchor, setOptionsAnchor] = useState(null)
    const dragCounter = useRef(0)
    const inputRef = useRef(null)
    const targetName = target ? target.name : _t('MediaFileExplorer.root')

    // remember the target, so it is still there after a page reload
    const savedTargetId = useRef(settings?.Media?.uploadTarget?._id || '')
    useEffect(() => {
        if ((target?._id || '') === savedTargetId.current) return
        savedTargetId.current = target?._id || ''
        // lazy: no immediate save (server request + re-render of the whole container) per folder click
        container?.setSettingsForType?.('Media', {uploadTarget: target || null}, {lazy: true})
    }, [target?._id])

    // image quality: start with the saved setting of the type
    useEffect(() => {
        if (!state.conversion && settings?.Media?.conversion?.length) {
            setConversion(settings.Media.conversion)
        }
    }, [])

    useEffect(() => {
        fileInput = inputRef.current
        return () => {
            if (fileInput === inputRef.current) fileInput = null
        }
    }, [])

    // the table has no folder view of its own -> reload it after the upload
    // (container read at call time: the current page params, no re-subscribe on every render)
    const containerRef = useRef(container)
    containerRef.current = container
    useEffect(() => {
        if (!isTable) return
        let timer
        const off = onMediaUploaded(({finished}) => {
            if (!finished) return
            clearTimeout(timer)
            timer = setTimeout(() => {
                const c = containerRef.current
                c?.getData?.(c.pageParams, false)
            }, 1500)
        })
        return () => {
            off()
            clearTimeout(timer)
        }
    }, [isTable])

    // drag & drop of files works on the whole page, the same in every view
    useEffect(() => {
        const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).indexOf('Files') >= 0
        // dialogs (e.g. the editor of a single file) bring their own upload field
        const inDialog = (e) => !!e.target?.closest?.('[role="dialog"]')
        const onEnter = (e) => {
            if (!isFileDrag(e) || inDialog(e)) return
            e.preventDefault()
            dragCounter.current++
            setDragActive(true)
        }
        const onOver = (e) => {
            if (isFileDrag(e) && !inDialog(e)) e.preventDefault()
        }
        const onLeave = (e) => {
            if (!isFileDrag(e)) return
            dragCounter.current = Math.max(0, dragCounter.current - 1)
            if (!dragCounter.current) setDragActive(false)
        }
        const onDrop = (e) => {
            if (!isFileDrag(e)) return
            dragCounter.current = 0
            setDragActive(false)
            if (inDialog(e)) return
            e.preventDefault()
            uploadFiles(e.dataTransfer.files)
        }
        document.addEventListener('dragenter', onEnter)
        document.addEventListener('dragover', onOver)
        document.addEventListener('dragleave', onLeave)
        document.addEventListener('drop', onDrop)
        return () => {
            document.removeEventListener('dragenter', onEnter)
            document.removeEventListener('dragover', onOver)
            document.removeEventListener('dragleave', onLeave)
            document.removeEventListener('drop', onDrop)
        }
    }, [])

    return <>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            {/* grid / tree: the target is the open folder. The flat table always uploads into the root. */}
            {(!isTable || target) && <Typography variant="body2" color="text.secondary" noWrap sx={{maxWidth: 220}}>
                {_t('MediaFileExplorer.uploadTo', {folder: targetName})}
            </Typography>}
            <Button variant="contained" disableElevation size="small" startIcon={<AddRounded/>}
                    sx={{height: 32, borderRadius: 5, textTransform: 'none', px: 2, whiteSpace: 'nowrap'}}
                    onClick={() => openUploadDialog()}>
                {_t('MediaFileExplorer.upload')}
            </Button>
            <Tooltip title={_t('MediaFileExplorer.uploadOptions')}>
                <IconButton size="small" sx={{height: 32, width: 32}} onClick={(e) => setOptionsAnchor(e.currentTarget)}><TuneRounded/></IconButton>
            </Tooltip>
            <Popover open={!!optionsAnchor} anchorEl={optionsAnchor} onClose={() => setOptionsAnchor(null)}
                     anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}>
                <Box sx={{p: 2, width: 320, display: 'flex', flexDirection: 'column', gap: 2}}>
                    {/* flat table: no open folder, so the target group is chosen here */}
                    {isTable && <TypePicker value={target ? [target] : []} multi={false} name="group" type="MediaGroup"
                                            placeholder={_t('Media.selectGroup')}
                                            onChange={(e) => setUploadTarget(e.target.value?.[0])}/>}
                    <TypePicker value={conversion || []} name="conversion" type="MediaConversion"
                                placeholder={_t('Media.selectConversion')}
                                onChange={(e) => setConversion(e.target.value)}/>
                </Box>
            </Popover>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => {
                uploadFiles(e.target.files, overrideTarget)
                overrideTarget = undefined
                e.target.value = ''
            }}/>
        </Box>

        {dragActive && <DropOverlay>
            <CloudUploadOutlined sx={{fontSize: 48}}/>
            {_t('MediaFileExplorer.dropHere', {folder: targetName})}
        </DropOverlay>}

    </>
}
