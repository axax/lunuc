import React, {useState, useEffect, useRef, useMemo} from 'react'
import {
    SimpleButton,
    SimpleDialog,
    SimpleList,
    Typography,
    Box,
    Checkbox,
    FormControlLabel,
    CircularProgress,
    DeleteIconButton,
    DownloadIconButton,
    LinkIconButton,
    StorageIcon,
    ImageIcon,
    LanguageIcon,
    ShieldIcon,
    ContentCopyIcon,
    Row,
    Col
} from 'ui/admin'
import FileDrop from 'client/components/FileDrop'
import Util from 'client/util/index.mjs'
import {formatBytes} from 'client/util/format.mjs'
import config from 'gen/config-client'
import {client, useQuery} from '../middleware/graphql'
import {getTypes} from '../../util/types.mjs'
// full type definitions (incl. types with "browser": false, e.g. tracking aggregates) for the collection list
import '../../util/typesAdmin.mjs'
import {_t} from 'util/i18n.mjs'

/**
 * Tab "Backup" in /admin/system: create, download, restore and delete the dumps of the database,
 * the uploaded medias and the hostrules (api/resolver/backups.mjs, api/upload.mjs).
 */

const {BACKUP_URL} = config

// Everything that differs between the three kinds of backups (texts: BackupContainer.<type>.*).
// maxUploadMb: limits of api/upload.mjs
const KINDS = [
    // the restore drops the collections of the dump first -> it has to be confirmed
    {type: 'db', Icon: StorageIcon, uploadTo: '/graphql/upload/dbdump', maxUploadMb: 10240, selectCollections: true, confirmRestore: true},
    {type: 'media', Icon: ImageIcon, uploadTo: '/graphql/upload/mediadump', maxUploadMb: 1024},
    {type: 'hostrule', Icon: LanguageIcon, uploadTo: '/graphql/upload/hostrule', maxUploadMb: 1024}
]

const BACKUPS_QUERY = `query backups($type:String!){backups(type:$type){results{name createdAt bytes pending}}}`
const CREATE_MUTATION = `mutation createBackup($type:String!,$options:String){createBackup(type:$type,options:$options){name pending}}`
const REMOVE_MUTATION = `mutation removeBackup($type:String!,$name:String!){removeBackup(type:$type,name:$name){status}}`
const TOKEN_QUERY = `query getTokenLink($filePath:String){getTokenLink(filePath:$filePath){token}}`

// a db dump is written in the background: the list is polled as long as a dump is pending
const POLL_INTERVAL = 3000
// polls without any growth of the pending dumps until they are considered as interrupted (~2 minutes)
const MAX_STALLED_POLLS = 40
// time a new dump has to show up in the list
const START_TIMEOUT = 20000

// room for the three actions of a list entry
const ITEM_STYLE = {paddingRight: 120}
const NAME_STYLE = {display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}

const tr = (key, replacements) => _t('BackupContainer.' + key, replacements)

const notify = (key, replacements) => _app_.dispatcher.addNotification({key: 'backup', message: tr(key, replacements)})

const showError = msg => _app_.dispatcher.addError({key: 'backup', msg})

// the watchers of useQuery are notified, so the list of the section updates itself
const loadBackups = (type, silent) =>
    client.query({query: BACKUPS_QUERY, variables: {type}, fetchPolicy: 'network-only', silent})

// Link that works without login for 5 hours. The browser streams the download (no size limit),
// the last part of the url is only the name of the downloaded file.
const loadTokenLink = (type, name) =>
    client.query({query: TOKEN_QUERY, variables: {filePath: `%BACKUP_DIR%/${type}dumps/${name}`}, fetchPolicy: 'no-cache'})
        .then(response => `/tokenlink/${response.data.getTokenLink.token}/-/${name}`)

const startDownload = (url, name) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
}

// fallback without token link: the whole file is loaded into the memory of the browser first
const downloadWithAuth = (type, name) => {
    const token = Util.getAuthToken()
    return fetch(`${BACKUP_URL}/${type}dumps/${name}`, token ? {headers: {Authorization: token}} : undefined).then(response => {
        if (!response.ok) throw new Error(`Invalid status ${response.status}`)
        return response.blob()
    }).then(blob => {
        const url = URL.createObjectURL(blob)
        startDownload(url, name)
        setTimeout(() => URL.revokeObjectURL(url), 60000)
    }).catch(e => showError(e.message))
}

/**
 * Backups of one type. Dumps that are still being written (pending) are watched: the list is polled,
 * a finished dump is announced and one that vanished is reported as failed (the server removes the partial file).
 * stalled: the pending dumps do not grow anymore (e.g. the api was restarted while they were written).
 */
const useBackups = type => {
    const {data, loading} = useQuery(BACKUPS_QUERY, {variables: {type}, fetchPolicy: 'cache-and-network'})
    const results = data && data.backups && data.backups.results
    const [stalled, setStalled] = useState(false)
    // only changed when a poll failed (no new results), so the next poll gets scheduled anyway
    const [retry, setRetry] = useState(0)
    // watch: [{name, seen, until}] dumps this view is waiting for
    const poll = useRef({watch: [], key: '', count: 0}).current

    useEffect(() => {
        if (!results) return
        const done = [], failed = []
        results.forEach(backup => {
            if (backup.pending && !poll.watch.some(w => w.name === backup.name)) {
                // started somewhere else (cronjob, other tab, before a reload)
                poll.watch.push({name: backup.name})
            }
        })
        poll.watch = poll.watch.filter(w => {
            const backup = results.find(b => b.name === w.name)
            if (backup && backup.pending) return (w.seen = true)
            if (backup) {
                done.push(w.name)
            } else if (w.seen || !w.until || Date.now() > w.until) {
                failed.push(w.name)
            } else {
                // just started, the partial file is not written yet
                return true
            }
            return false
        })
        if (done.length) notify('created', {name: done.join(', ')})
        if (failed.length) showError(tr('createFailed', {name: failed.join(', ')}))
        if (!poll.watch.length) {
            setStalled(false)
            return
        }

        const key = results.reduce((key, backup) => backup.pending ? key + backup.name + backup.bytes : key, '')
        if (key !== poll.key) {
            poll.key = key
            poll.count = 0
            setStalled(false)
        } else if (key && ++poll.count > MAX_STALLED_POLLS) {
            setStalled(true)
            return
        }
        const timer = setTimeout(() => {
            loadBackups(type, true).catch(() => setRetry(r => r + 1))
        }, POLL_INTERVAL)
        return () => clearTimeout(timer)
    }, [results, retry])

    return {
        results, loading, stalled,
        watch: name => poll.watch.push({name, until: Date.now() + START_TIMEOUT}),
        unwatch: name => {
            poll.watch = poll.watch.filter(w => w.name !== name)
        }
    }
}

// selection of the last db dump of this session (indexes of the type list)
let lastCheckedTypes

/** Collections of a new db dump. onClose(options) - options is undefined when cancelled. */
const CreateDbDumpDialog = ({onClose}) => {
    const types = useMemo(() => {
        const all = getTypes()
        return Object.keys(all).sort().map(name => {
            const essential = all[name].backupEssential !== false
            return {primary: name, secondary: essential ? undefined : tr('notEssential'), checkbox: true, essential}
        })
    }, [])
    const select = filter => types.reduce((checked, type, index) => {
        if (!filter || filter(type)) checked.push(index)
        return checked
    }, [])
    const [checked, setChecked] = useState(() => lastCheckedTypes || select())

    return <SimpleDialog fullWidth={true} maxWidth="sm" open={true}
                         onClose={action => {
                             if (action.key === 'create') {
                                 lastCheckedTypes = checked
                                 onClose({excludeCollection: types.filter((type, index) => checked.indexOf(index) < 0).map(type => type.primary)})
                             } else {
                                 onClose()
                             }
                         }}
                         actions={[{key: 'cancel', label: _t('core.cancel')},
                             {key: 'create', label: tr('create'), variant: 'contained', type: 'primary', disabled: !checked.length}]}
                         title={tr('db.createTitle')}>
        <Typography variant="body2" gutterBottom>{tr('db.createInfo')}</Typography>
        <Box sx={{display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1}}>
            <SimpleButton size="small" variant="outlined" onClick={() => setChecked(select())}>
                {_t('core.selectAll')}
            </SimpleButton>
            <SimpleButton size="small" variant="outlined" onClick={() => setChecked(select(type => type.essential))}>
                {tr('essentialOnly')}
            </SimpleButton>
            <Typography variant="body2" sx={{color: 'text.secondary'}}>
                {tr('selectedCount', {count: checked.length, total: types.length})}
            </Typography>
        </Box>
        <SimpleList checked={checked} onCheck={setChecked} paperProps={{variant: 'outlined'}}
                    sx={{overflow: 'auto', maxHeight: 320}} items={types}/>
    </SimpleDialog>
}

/** Upload of a dump. The upload starts as soon as a file is selected, so a destructive restore is confirmed first. */
const RestoreDialog = ({kind, onClose}) => {
    const {type, confirmRestore} = kind
    const [confirmed, setConfirmed] = useState(!confirmRestore)

    return <SimpleDialog open={true} maximizable={false} onClose={onClose}
                         actions={[{key: 'close', label: tr('close')}]}
                         title={tr(type + '.restoreTitle')}>
        <Typography variant="body2" gutterBottom sx={confirmRestore ? {color: 'error.main'} : undefined}>
            {tr(type + '.restoreInfo')}
        </Typography>
        {confirmRestore && <FormControlLabel sx={{mb: 1}}
                                             control={<Checkbox checked={confirmed}
                                                                onChange={e => setConfirmed(e.target.checked)}/>}
                                             label={tr('restoreConfirm')}/>}
        {confirmed && <FileDrop maxSize={kind.maxUploadMb} style={{minHeight: '10rem'}}
                                accept="application/x-gzip,application/gzip"
                                imagePreview={false}
                                uploadTo={kind.uploadTo}
                                label={tr('dropFile')}
                                onSuccess={() => {
                                    notify('restored')
                                    if (confirmRestore) {
                                        // the data of the whole admin is outdated now
                                        client.resetStore()
                                    }
                                }}/>}
    </SimpleDialog>
}

/** Link to download a backup without login, e.g. to fetch it with wget / curl on another server. */
const LinkDialog = ({type, backup, onClose}) => {
    const [url, setUrl] = useState('')
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let active = true
        loadTokenLink(type, backup.name).then(link => active && setUrl(location.origin + link)).catch(() => {})
        return () => {
            active = false
        }
    }, [])

    const items = [{
        icon: <ShieldIcon/>,
        primary: tr('downloadAuth'),
        secondary: tr('downloadAuthInfo'),
        onClick: () => downloadWithAuth(type, backup.name)
    }]
    if (url && navigator.clipboard) {
        items.unshift({
            icon: <ContentCopyIcon/>,
            primary: tr(copied ? 'linkCopied' : 'copyLink'),
            onClick: () => navigator.clipboard.writeText(url).then(() => setCopied(true))
        })
    }

    return <SimpleDialog open={true} maximizable={false} onClose={onClose}
                         actions={[{key: 'close', label: tr('close')}]}
                         title={tr('linkTitle', {name: backup.name})}>
        <Typography variant="body2" gutterBottom>{tr('linkInfo')}</Typography>
        <Box sx={{mb: 2, p: 1.5, minHeight: '5rem', border: '1px dashed', borderColor: 'divider', borderRadius: 1,
            fontFamily: 'monospace', fontSize: '0.8125rem', wordBreak: 'break-all'}}>
            {url || '…'}
        </Box>
        <SimpleList paperProps={{variant: 'outlined'}} items={items}/>
    </SimpleDialog>
}

const BackupSection = ({kind}) => {
    const {type, Icon} = kind
    const {results, loading, stalled, watch, unwatch} = useBackups(type)
    // {key: 'create' | 'restore' | 'link' | 'delete', backup}
    const [dialog, setDialog] = useState(null)
    const [creating, setCreating] = useState(false)
    const closeDialog = () => setDialog(null)

    const create = options => {
        setCreating(true)
        client.mutate({
            mutation: CREATE_MUTATION,
            variables: {type, options: options ? JSON.stringify(options) : undefined}
        }).then(response => {
            const backup = response.data.createBackup
            if (backup.pending) {
                // written in the background: announced by useBackups as soon as it is finished
                watch(backup.name)
            } else {
                notify('created', {name: backup.name})
            }
            return loadBackups(type)
        }).catch(() => {
            // the error is shown by the graphql client
        }).then(() => setCreating(false))
    }

    const remove = backup => {
        unwatch(backup.name)
        client.mutate({mutation: REMOVE_MUTATION, variables: {type, name: backup.name}})
            .then(() => notify('deleted', {name: backup.name}))
            .catch(() => {})
            .then(() => loadBackups(type))
    }

    const deleteButton = backup => <DeleteIconButton size="small" title={_t('core.delete')} aria-label={_t('core.delete')}
                                                     onClick={() => setDialog({key: 'delete', backup})}/>

    const toItem = backup => {
        const secondary = <span style={NAME_STYLE} title={backup.name}>{formatBytes(backup.bytes, 1)} · {backup.name}</span>
        if (backup.pending) {
            return {
                icon: stalled ? undefined : <CircularProgress size={20}/>,
                primary: tr(stalled ? 'stalled' : 'pending'),
                secondary,
                // an interrupted dump never finishes, it can only be removed
                actions: stalled ? deleteButton(backup) : undefined
            }
        }
        return {
            style: ITEM_STYLE,
            primary: Util.formattedDatetime(backup.createdAt),
            secondary,
            actions: <>
                <DownloadIconButton size="small" title={tr('download')} aria-label={tr('download')}
                                    onClick={() => loadTokenLink(type, backup.name).then(url => startDownload(url, backup.name)).catch(() => {})}/>
                <LinkIconButton size="small" title={tr('link')} aria-label={tr('link')}
                                onClick={() => setDialog({key: 'link', backup})}/>
                {deleteButton(backup)}
            </>
        }
    }

    let summary
    if (results && results.length) {
        const totalBytes = results.reduce((sum, backup) => sum + (backup.bytes || 0), 0)
        summary = tr(results.length === 1 ? 'summaryOne' : 'summary', {count: results.length, size: formatBytes(totalBytes, 1)})
    }

    return <>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            <Icon color="action"/>
            <Typography variant="h6" component="h3" sx={{flexGrow: 1}}>{tr(type + '.title')}</Typography>
            {summary && <Typography variant="body2" sx={{color: 'text.secondary'}}>{summary}</Typography>}
        </Box>
        {/* minHeight: the buttons of the sections stay on one line when the texts wrap differently */}
        <Typography variant="body2" sx={{color: 'text.secondary', mb: 1.5, minHeight: {lg: '2.6rem'}}}>
            {tr(type + '.info')}
        </Typography>
        <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5}}>
            <SimpleButton variant="contained" color="primary" showProgress={creating}
                          onClick={() => kind.selectCollections ? setDialog({key: 'create'}) : create()}>
                {tr(creating ? 'creating' : 'create')}
            </SimpleButton>
            <SimpleButton variant="outlined" color="secondary" onClick={() => setDialog({key: 'restore'})}>
                {tr(type + '.restore')}
            </SimpleButton>
        </Box>

        {results ? (results.length ?
                <SimpleList items={results.map(toItem)}/> :
                <Typography variant="body2" sx={{color: 'text.secondary'}}>{tr('empty')}</Typography>) :
            loading && <CircularProgress size={24}/>}

        {dialog && dialog.key === 'create' && <CreateDbDumpDialog onClose={options => {
            closeDialog()
            if (options) create(options)
        }}/>}
        {dialog && dialog.key === 'restore' && <RestoreDialog kind={kind} onClose={closeDialog}/>}
        {dialog && dialog.key === 'link' && <LinkDialog type={type} backup={dialog.backup} onClose={closeDialog}/>}
        {dialog && dialog.key === 'delete' && <SimpleDialog open={true} maximizable={false}
                                                            onClose={action => {
                                                                closeDialog()
                                                                if (action.key === 'delete') remove(dialog.backup)
                                                            }}
                                                            actions={[{key: 'cancel', label: _t('core.cancel')},
                                                                {key: 'delete', label: _t('core.delete'), variant: 'contained', type: 'error'}]}
                                                            title={tr('deleteTitle')}>
            {tr('deleteConfirm', {
                name: dialog.backup.name,
                date: Util.formattedDatetime(dialog.backup.createdAt),
                size: formatBytes(dialog.backup.bytes, 1)
            })}
        </SimpleDialog>}
    </>
}

const BackupContainer = () => <>
    <Typography variant="h4" component="h2" gutterBottom>{tr('title')}</Typography>
    <Typography variant="subtitle1" gutterBottom>{tr('info')}</Typography>

    <Row spacing={4} sx={{mt: 1}}>
        {KINDS.map(kind => <Col key={kind.type} xs={12} md={6} lg={4}>
            <BackupSection kind={kind}/>
        </Col>)}
    </Row>
</>

export default BackupContainer
