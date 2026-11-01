import React from 'react'
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    LinearProgress,
    Stack,
    Switch,
    FormControlLabel,
    Tooltip,
    Typography
} from 'ui/admin'
import RefreshIcon from '@mui/icons-material/Refresh'
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {client} from 'client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'

const AUTO_REFRESH_INTERVAL = 5000

export const formatRuntime = (ms) => {
    if (!ms && ms !== 0) {
        return '-'
    }
    const seconds = Math.max(0, Math.floor(ms / 1000))
    if (seconds < 60) {
        return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
        return `${minutes}m ${seconds % 60}s`
    }
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const formatStartTime = (startTime) => {
    if (!startTime) {
        return '-'
    }
    const date = new Date(startTime)
    const sameDay = date.toDateString() === new Date().toDateString()
    return sameDay ? date.toLocaleTimeString() : date.toLocaleString()
}

const gridColumns = {xs: '1fr', sm: 'minmax(0,2fr) 1fr 1fr auto'}

const HeaderCell = ({children, align}) => <Typography
    variant="caption"
    sx={{color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, textAlign: align}}>
    {children}
</Typography>

const JobRow = ({job, now, busy, onAbort}) => {
    const [confirm, setConfirm] = React.useState(false)
    const runtime = job.startTime ? now - job.startTime : job.runtime
    const actionLabel = job.killable ? _t('CronJob.running.abort') : _t('CronJob.running.releaseLock')
    const ActionIcon = job.killable ? StopCircleOutlinedIcon : LockOpenOutlinedIcon
    const actionColor = job.killable ? 'error' : 'warning'

    return <Box sx={{
        display: 'grid',
        gridTemplateColumns: gridColumns,
        gap: {xs: 1, sm: 2},
        alignItems: 'center',
        px: 2,
        py: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
        position: 'relative',
        overflow: 'hidden',
        opacity: busy ? 0.6 : 1,
        transition: 'opacity .2s'
    }}>
        <Box sx={{minWidth: 0}}>
            <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0,
                    animation: 'cronPulse 1.6s ease-in-out infinite',
                    '@keyframes cronPulse': {'0%,100%': {opacity: 1}, '50%': {opacity: 0.3}}
                }}/>
                <Typography variant="body1" sx={{fontWeight: 600}} noWrap title={job.name || job.cronjobId}>
                    {job.name || _t('CronJob.running.unnamed')}
                </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{mt: 0.25, pl: 2}}>
                <Typography variant="caption" sx={{color: 'text.secondary', fontFamily: 'monospace'}} noWrap>
                    {job.cronjobId}
                </Typography>
                <Tooltip title={_t('CronJob.running.copyId')}>
                    <IconButton size="small" sx={{p: 0.25}}
                                onClick={() => navigator.clipboard && navigator.clipboard.writeText(job.cronjobId)}>
                        <ContentCopyIcon sx={{fontSize: 14}}/>
                    </IconButton>
                </Tooltip>
            </Stack>
        </Box>

        <Tooltip title={job.startTime ? new Date(job.startTime).toLocaleString() : ''}>
            <Typography variant="body2" sx={{color: 'text.secondary'}}>
                <Box component="span" sx={{display: {sm: 'none'}}}>{_t('CronJob.running.started')}: </Box>
                {formatStartTime(job.startTime)}
            </Typography>
        </Tooltip>

        <Typography variant="body2" sx={{fontFamily: 'monospace', fontWeight: 600}}>
            <Box component="span" sx={{display: {sm: 'none'}, fontFamily: 'inherit', fontWeight: 400}}>
                {_t('CronJob.running.runtime')}: </Box>
            {formatRuntime(runtime)}
        </Typography>

        <Box sx={{display: 'flex', justifyContent: {xs: 'flex-start', sm: 'flex-end'}, gap: 1}}>
            {confirm ? <>
                <Button size="small" variant="text" color="inherit" disabled={busy}
                        onClick={() => setConfirm(false)}>
                    {_t('CronJob.running.cancel')}
                </Button>
                <Button size="small" variant="contained" color={actionColor} disableElevation disabled={busy}
                        startIcon={busy ? <CircularProgress size={14} color="inherit"/> : <ActionIcon/>}
                        onClick={() => onAbort(job)}>
                    {_t('CronJob.running.confirm')}
                </Button>
            </> : <Tooltip title={job.killable ? _t('CronJob.running.abortHint') : _t('CronJob.running.releaseLockHint')}>
                <Button size="small" variant="outlined" color={actionColor}
                        startIcon={<ActionIcon/>}
                        onClick={() => setConfirm(true)}>
                    {actionLabel}
                </Button>
            </Tooltip>}
        </Box>

        <LinearProgress color="success" sx={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, opacity: 0.6}}/>
    </Box>
}

const RunningCronJobs = () => {
    const [jobs, setJobs] = React.useState(null)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState(null)
    const [busyIds, setBusyIds] = React.useState({})
    const [autoRefresh, setAutoRefresh] = React.useState(true)
    const [lastUpdate, setLastUpdate] = React.useState(null)
    const [now, setNow] = React.useState(Date.now())

    const load = React.useCallback(() => {
        setLoading(true)
        return client.query({
            fetchPolicy: 'network-only',
            query: '{getRunningCronJobs{cronjobId executionId name startTime runtime killable}}'
        }).then(response => {
            setJobs((response.data && response.data.getRunningCronJobs) || [])
            setError(null)
            setLastUpdate(new Date())
        }).catch(e => {
            setError(e.message)
        }).finally(() => setLoading(false))
    }, [])

    React.useEffect(() => {
        load()
    }, [load])

    React.useEffect(() => {
        if (!autoRefresh) {
            return
        }
        const interval = setInterval(load, AUTO_REFRESH_INTERVAL)
        return () => clearInterval(interval)
    }, [autoRefresh, load])

    // tick every second so the runtime is live
    React.useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [])

    const abort = (job) => {
        setBusyIds(ids => ({...ids, [job.cronjobId]: true}))
        client.query({
            fetchPolicy: 'network-only',
            query: 'query abortCronJob($cronjobId:String!){abortCronJob(cronjobId:$cronjobId){success status}}',
            variables: {cronjobId: job.cronjobId}
        }).then(response => {
            const result = response.data && response.data.abortCronJob
            if (result && !result.success) {
                setError(result.status)
            }
        }).catch(e => {
            setError(e.message)
        }).finally(() => {
            setBusyIds(ids => {
                const copy = {...ids}
                delete copy[job.cronjobId]
                return copy
            })
            load()
        })
    }

    const initialLoading = jobs === null && !error

    return <Box sx={{minHeight: 160}}>
        {/* toolbar */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{mb: 2, flexWrap: 'wrap', rowGap: 1}}>
            <Chip size="small"
                  color={jobs && jobs.length ? 'success' : 'default'}
                  variant={jobs && jobs.length ? 'filled' : 'outlined'}
                  label={_t('CronJob.running.count', {count: jobs ? jobs.length : 0})}/>
            {lastUpdate && <Typography variant="caption" sx={{color: 'text.secondary'}}>
                {_t('CronJob.running.updated', {time: lastUpdate.toLocaleTimeString()})}
            </Typography>}
            <Box sx={{flex: 1}}/>
            <FormControlLabel
                sx={{mr: 0}}
                control={<Switch size="small" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}/>}
                label={<Typography variant="body2">{_t('CronJob.running.autoRefresh')}</Typography>}/>
            <Tooltip title={_t('CronJob.running.refresh')}>
                <span>
                    <IconButton size="small" onClick={load} disabled={loading}>
                        {loading ? <CircularProgress size={18}/> : <RefreshIcon fontSize="small"/>}
                    </IconButton>
                </span>
            </Tooltip>
        </Stack>

        {error && <Box sx={{
            mb: 2, px: 2, py: 1, borderRadius: 2, border: 1, borderColor: 'error.main', color: 'error.main'
        }}>
            <Typography variant="body2">{error}</Typography>
        </Box>}

        {initialLoading ? <Box sx={{display: 'flex', justifyContent: 'center', py: 6}}>
            <CircularProgress size={28}/>
        </Box> : jobs && jobs.length === 0 ? <Box sx={{textAlign: 'center', py: 5, color: 'text.secondary'}}>
            <CheckCircleOutlineIcon sx={{fontSize: 48, color: 'success.main', opacity: 0.8}}/>
            <Typography variant="subtitle1" sx={{mt: 1, color: 'text.primary', fontWeight: 600}}>
                {_t('CronJob.running.emptyTitle')}
            </Typography>
            <Typography variant="body2">
                {autoRefresh ? _t('CronJob.running.emptyTextAuto') : _t('CronJob.running.emptyText')}
            </Typography>
        </Box> : jobs && <Stack spacing={1}>
            <Box sx={{display: {xs: 'none', sm: 'grid'}, gridTemplateColumns: gridColumns, gap: 2, px: 2}}>
                <HeaderCell>{_t('CronJob.running.name')}</HeaderCell>
                <HeaderCell>{_t('CronJob.running.started')}</HeaderCell>
                <HeaderCell>{_t('CronJob.running.runtime')}</HeaderCell>
                <HeaderCell align="right"></HeaderCell>
            </Box>
            {jobs.map(job => <JobRow key={job.cronjobId} job={job} now={now}
                                     busy={!!busyIds[job.cronjobId]} onAbort={abort}/>)}
        </Stack>}
    </Box>
}

export default RunningCronJobs
