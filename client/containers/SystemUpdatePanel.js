import React from 'react'
import {Typography, Button, Chip, Box, Select, MenuItem, FormControl, InputLabel, LinearProgress, SimpleDialog, Checkbox, FormControlLabel, ExpansionPanel, Tooltip} from 'ui/admin'
import {_t} from 'util/i18n.mjs'
import {StyledSystemTable, StyledSystemDl} from './systemStyles'
import styled from '@emotion/styled'
import {isNetworkError, errorMessage, formatDate, silentQuery, silentMutation} from './systemUpdateApi'
import {
    RUNTIME_QUERY, FCV_MUTATION, suggestNodeVersion, nodeState, NodeDetails, nodeDialog, mongoState, MongoDetails, mongoDialog
} from './SystemRuntimeSection'

/**
 * Tab "Update" in /admin/system: overview of lunuc (git tracking branch, shell/start.sh, see api/util/systemUpdate.mjs),
 * Node.js and MongoDB (api/util/systemRuntime.mjs). One row per component with its action, the details are collapsed.
 * All updates run the same way and share progress and log.
 */

const POLL_INTERVAL = 2000
// the api restarts at the end of the update, after that many failed polls we give up
const MAX_RESTART_POLLS = 300

const INFO_QUERY = `query systemUpdateInfo($fetch:Boolean){systemUpdateInfo(fetch:$fetch){
    branch upstream currentVersion buildNumber latestVersion ahead behind dirtyFiles dependenciesChanged checkedAt fetchError error runAs launcher cannotUpdateReason
    current{hash shortHash date author subject} latest{hash shortHash date author subject}
    commits{hash shortHash date author subject}}}`
const STATUS_FIELDS = 'running task state restart force exitCode from to startedAt finishedAt log'
const STATUS_QUERY = `query systemUpdateStatus{systemUpdateStatus{${STATUS_FIELDS}}}`
const START_MUTATION = `mutation startSystemUpdate($restart:String,$force:Boolean){startSystemUpdate(restart:$restart,force:$force){${STATUS_FIELDS}}}`

const StyledLog = styled('pre')(({theme}) => ({
    background: theme.palette.mode === 'dark' ? '#111' : '#1e1e1e',
    color: '#ddd',
    fontSize: '0.75rem',
    padding: '0.75rem',
    margin: 0,
    width: '100%',
    maxHeight: '28rem',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    borderRadius: 4
}))

const StyledOverview = styled(StyledSystemTable)({
    'td, th': {verticalAlign: 'middle', padding: '0.5rem'},
    'td:first-of-type': {fontWeight: 600},
    'td:last-of-type': {textAlign: 'right'}
})

const CommitLine = ({commit}) => commit ? <span>
    <code>{commit.shortHash}</code> {commit.subject} <Typography component="span" variant="body2" sx={{color: 'text.secondary'}}>
    ({formatDate(commit.date)}, {commit.author})</Typography>
</span> : null

const versionWithCommit = (version, commit) => [version, commit?.shortHash].filter(Boolean).join(' · ') || '–'

class SystemUpdatePanel extends React.Component {

    state = {
        info: null, infoLoading: false, infoError: null,
        runtime: null, runtimeLoading: false, runtimeError: null,
        status: null, phase: 'idle', startError: null, showLog: false,
        // dialog: null | update | node | mongoPatch | mongoUpgrade | fcv
        dialog: null, restart: 'all', force: false, nodeVersion: '', mongoBackup: true, fcvMessage: null
    }

    componentDidMount() {
        this.check(false)
        silentQuery(STATUS_QUERY).then(data => {
            const status = data.systemUpdateStatus
            if (this._unmounted) return
            this.setState({status})
            if (status.running) {
                this.setState({phase: 'running'})
                this.poll()
            }
        }).catch(() => {
        })
    }

    componentWillUnmount() {
        this._unmounted = true
        clearTimeout(this._pollTimeout)
    }

    componentDidUpdate(prevProps, prevState) {
        if (this._logEl && prevState.status?.log !== this.state.status?.log) {
            this._logEl.scrollTop = this._logEl.scrollHeight
        }
    }

    /** git and node / mongodb in parallel, fetchRemote: git fetch and release lists without cache */
    check(fetchRemote) {
        this.loadInfo(fetchRemote)
        this.loadRuntime(fetchRemote)
    }

    loadInfo(fetchRemote) {
        this.setState({infoLoading: true, infoError: null})
        silentQuery(INFO_QUERY, {fetch: fetchRemote}).then(data => {
            if (!this._unmounted) this.setState({info: data.systemUpdateInfo, infoLoading: false})
        }).catch(e => {
            if (!this._unmounted) this.setState({infoError: errorMessage(e), infoLoading: false})
        })
    }

    loadRuntime(fetchRemote) {
        this.setState({runtimeLoading: true, runtimeError: null})
        silentQuery(RUNTIME_QUERY, {fetch: fetchRemote}).then(data => {
            if (this._unmounted) return
            const runtime = data.systemRuntimeInfo
            this.setState({runtime, runtimeLoading: false, nodeVersion: suggestNodeVersion(runtime.node, this.state.nodeVersion)})
        }).catch(e => {
            if (!this._unmounted) this.setState({runtimeError: errorMessage(e), runtimeLoading: false})
        })
    }

    /** starts a task (system / node / mongodb update) and polls its status, all of them return SystemUpdateStatus */
    startTask(mutation, variables) {
        this.setState({startError: null, phase: 'running', status: null})
        this._failedPolls = 0
        silentMutation(mutation, variables).then(data => {
            if (this._unmounted) return
            this.setState({status: Object.values(data)[0]})
            this.poll()
        }).catch(e => {
            if (!this._unmounted) this.setState({startError: errorMessage(e), phase: 'idle'})
        })
    }

    setFcv(version) {
        this.setState({fcvMessage: null})
        silentMutation(FCV_MUTATION, {version}).then(data => {
            if (this._unmounted) return
            this.setState({fcvMessage: {ok: true, text: data.setMongoFeatureCompatibility.status}})
            this.loadRuntime(false)
        }).catch(e => {
            if (!this._unmounted) this.setState({fcvMessage: {ok: false, text: errorMessage(e)}})
        })
    }

    poll() {
        clearTimeout(this._pollTimeout)
        this._pollTimeout = setTimeout(() => {
            silentQuery(STATUS_QUERY).then(data => {
                if (this._unmounted) return
                const status = data.systemUpdateStatus
                this._failedPolls = 0

                if (status.running) {
                    this.setState({status, phase: status.state === 'restarting' ? 'restarting' : 'running'})
                    this.poll()
                } else if (status.state === 'failed') {
                    this.setState({status, phase: 'failed'})
                } else if (status.state === 'restarting' && this.state.phase !== 'restarting' && status.restart !== 'none') {
                    // script got killed by the api restart before it could write "success", the api is
                    // back already -> wait one more round to be sure
                    this.setState({status, phase: 'restarting'})
                    this.poll()
                } else {
                    this.setState({status, phase: 'done'})
                    this.check(false)
                }
            }).catch(e => {
                if (this._unmounted) return
                if (isNetworkError(e) && ++this._failedPolls < MAX_RESTART_POLLS) {
                    // api is restarting
                    this.setState({phase: 'restarting'})
                    this.poll()
                } else {
                    this.setState({phase: 'failed', startError: errorMessage(e)})
                }
            })
        }, POLL_INTERVAL)
    }

    isBusy() {
        return this.state.phase === 'running' || this.state.phase === 'restarting'
    }

    /* ---------------------------------------------------------- lunuc ---- */

    hasLocalChanges() {
        const {info} = this.state
        // local changes / local commits let "git pull --ff-only" fail -> only possible with force (git reset --hard)
        return !!info && ((info.dirtyFiles && info.dirtyFiles.length > 0) || info.ahead > 0)
    }

    lunucState(info) {
        let chip
        if (info.error) chip = {color: 'error', label: _t('SystemUpdate.error')}
        else if (info.behind > 0) chip = {color: 'warning', label: _t(info.behind === 1 ? 'SystemUpdate.behindOne' : 'SystemUpdate.behind', {count: info.behind, upstream: info.upstream})}
        else chip = {color: 'success', label: _t('SystemUpdate.upToDate')}
        return {
            installed: versionWithCommit(info.currentVersion, info.current),
            available: info.behind > 0 ? versionWithCommit(info.latestVersion, info.latest) : '–',
            chip,
            action: {label: _t('SystemUpdate.updateDots'), dialog: 'update', primary: info.behind > 0, reason: info.cannotUpdateReason || info.error}
        }
    }

    renderLunucDetails(info) {
        return <>
            {info.fetchError && <Typography color="error" variant="body2" gutterBottom>git fetch: {info.fetchError}</Typography>}
            {info.cannotUpdateReason && <Typography color="error" variant="body2" gutterBottom>{info.cannotUpdateReason}</Typography>}
            {info.ahead > 0 && <Typography color="warning.main" variant="body2" gutterBottom>{_t('SystemUpdate.ahead', {count: info.ahead})}</Typography>}
            {info.dirtyFiles?.length > 0 && <Box sx={{mb: 1}}>
                <Typography color="error" variant="body2">{_t('SystemUpdate.dirty')}</Typography>
                <ul style={{margin: '0.25rem 0'}}>{info.dirtyFiles.map(f => <li key={f}><code>{f}</code></li>)}</ul>
            </Box>}
            {info.dependenciesChanged && <Typography color="warning.main" variant="body2" gutterBottom>{_t('SystemUpdate.dependenciesChanged')}</Typography>}

            <StyledSystemDl>
                <dt>{_t('SystemUpdate.installed')}</dt>
                <dd>{info.buildNumber && <>Build {info.buildNumber} </>}<CommitLine commit={info.current}/></dd>
                <dt>Branch</dt>
                <dd><code>{info.branch}</code>{info.upstream && <> → <code>{info.upstream}</code></>}</dd>
                <dt>{_t('SystemUpdate.runAs')}</dt>
                <dd>{info.runAs}{info.launcher && <> ({info.launcher})</>}</dd>
            </StyledSystemDl>

            {info.commits?.length > 0 && <>
                <StyledSystemTable>
                    <thead>
                        <tr><th>Commit</th><th>{_t('SystemUpdate.date')}</th><th>{_t('SystemUpdate.author')}</th><th>{_t('SystemUpdate.message')}</th></tr>
                    </thead>
                    <tbody>{info.commits.map(c => <tr key={c.hash}>
                        <td className="mono nowrap">{c.shortHash}</td>
                        <td className="nowrap">{formatDate(c.date)}</td>
                        <td>{c.author}</td>
                        <td>{c.subject}</td>
                    </tr>)}</tbody>
                </StyledSystemTable>
                {info.behind > info.commits.length && <Typography variant="body2" sx={{color: 'text.secondary', mb: 1}}>
                    {_t('SystemUpdate.moreCommits', {count: info.behind - info.commits.length})}</Typography>}
            </>}
            <Typography variant="body2" sx={{color: 'text.secondary'}}>{_t('SystemUpdate.runUpdateInfo')}</Typography>
        </>
    }

    lunucDialog() {
        const {info, restart, force} = this.state
        const hasLocalChanges = this.hasLocalChanges()
        return {
            title: _t('SystemUpdate.confirmTitle'),
            label: _t(force ? 'SystemUpdate.forceUpdateNow' : 'SystemUpdate.updateNow'),
            danger: force,
            disabled: hasLocalChanges && !force,
            mutation: START_MUTATION,
            variables: {restart, force},
            content: <>
                <FormControl size="small" sx={{minWidth: 220, mt: 1, mb: 2}}>
                    <InputLabel id="system-update-restart">{_t('SystemUpdate.restart')}</InputLabel>
                    <Select labelId="system-update-restart" label={_t('SystemUpdate.restart')} value={restart}
                            onChange={e => this.setState({restart: e.target.value})}>
                        <MenuItem value="all">{_t('SystemUpdate.restartAll')}</MenuItem>
                        <MenuItem value="api">{_t('SystemUpdate.restartApi')}</MenuItem>
                        <MenuItem value="client">{_t('SystemUpdate.restartClient')}</MenuItem>
                        <MenuItem value="none">{_t('SystemUpdate.restartNone')}</MenuItem>
                    </Select>
                </FormControl>
                <Typography>{_t('SystemUpdate.confirmText', {restart})}</Typography>
                {hasLocalChanges && <Box sx={{mt: 2}}>
                    <FormControlLabel control={<Checkbox checked={force} onChange={e => this.setState({force: e.target.checked})}/>}
                                      label={_t('SystemUpdate.force')}/>
                    <Typography variant="caption" component="div" sx={{color: 'text.secondary', ml: 4}}>{_t('SystemUpdate.forceHint')}</Typography>
                    {force && <Typography color="error" sx={{mt: 1}}>
                        {_t('SystemUpdate.confirmForce', {count: (info?.dirtyFiles?.length || 0) + (info?.ahead || 0)})}</Typography>}
                </Box>}
            </>
        }
    }

    /* --------------------------------------------------------- layout ---- */

    getDialog(mongo) {
        const {dialog, runtime, nodeVersion, mongoBackup} = this.state
        if (dialog === 'update') return this.lunucDialog()
        if (!runtime) return null
        if (dialog === 'node') return nodeDialog(runtime.node, {nodeVersion, onVersion: v => this.setState({nodeVersion: v})})
        if (dialog) return mongoDialog(dialog, runtime.mongodb, {serverSeries: mongo?.serverSeries, mongoBackup, onBackup: b => this.setState({mongoBackup: b})})
        return null
    }

    renderAction(action) {
        if (!action) return null
        const button = <Button size="small" variant={action.primary ? 'contained' : 'outlined'} disabled={this.isBusy() || !!action.reason}
                               onClick={() => this.setState({dialog: action.dialog, startError: null})}>{action.label}</Button>
        // a disabled button gets no mouse events -> span for the tooltip
        return action.reason ? <Tooltip title={action.reason}><span>{button}</span></Tooltip> : button
    }

    renderRow(name, row, loading) {
        return <tr key={name}>
            <td>{name}</td>
            {row ? <>
                <td className="mono">{row.installed}</td>
                <td className="mono">{row.available}</td>
                <td><Chip size="small" color={row.chip.color} label={row.chip.label}/></td>
                <td>{this.renderAction(row.action)}</td>
            </> : <td colSpan={4}>{loading ? <LinearProgress/> : '–'}</td>}
        </tr>
    }

    renderProgress() {
        const {status, phase, startError, showLog} = this.state
        const busy = this.isBusy()
        const task = status?.task || 'update'

        return <>
            {startError && <Typography color="error" gutterBottom>{startError}</Typography>}

            {busy && <Box sx={{mb: 2}}>
                <LinearProgress sx={{mb: 1}}/>
                <Typography>{phase === 'restarting' ? _t('SystemUpdate.restarting') : _t('SystemUpdate.running')}</Typography>
            </Box>}

            {phase === 'done' && <Box sx={{mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap'}}>
                <Typography color="success.main">
                    {_t(task === 'update' ? 'SystemUpdate.done' : 'SystemRuntime.done', {from: status?.from || '?', to: status?.to || '?'})}</Typography>
                <Button variant="contained" size="small" onClick={() => location.reload()}>{_t('SystemUpdate.reload')}</Button>
            </Box>}

            {phase === 'failed' && <Typography color="error" gutterBottom>{_t(task === 'update' ? 'SystemUpdate.failed' : 'SystemRuntime.failed')}</Typography>}

            {status && (status.log || status.startedAt) &&
                <ExpansionPanel disableGutters expanded={showLog || busy || phase === 'failed'} onChange={(e, expanded) => this.setState({showLog: expanded})}
                                heading={<Typography variant="body2">
                                    Log – {_t('SystemUpdate.lastRun')}: {formatDate(status.startedAt)} ({status.task || 'update'}){status.state && <> – {status.state}</>}
                                    {status.exitCode !== null && status.exitCode !== 0 && <> (exit code {status.exitCode})</>}
                                </Typography>}>
                    <StyledLog ref={el => this._logEl = el}>{status.log || '…'}</StyledLog>
                </ExpansionPanel>}
        </>
    }

    render() {
        const {info, infoLoading, infoError, runtime, runtimeLoading, runtimeError, fcvMessage} = this.state
        const loading = infoLoading || runtimeLoading
        const node = runtime && nodeState(runtime.node)
        const mongo = runtime && mongoState(runtime.mongodb)
        const dialog = this.getDialog(mongo)
        const checkedAt = Math.max(info?.checkedAt || 0, runtime?.checkedAt || 0)
        const staleClient = info?.buildNumber && _app_.config?.BUILD_NUMBER && info.buildNumber !== _app_.config.BUILD_NUMBER

        return <>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap'}}>
                <Typography variant="h4" component="h2" sx={{mr: 'auto'}}>{_t('SystemUpdate.title')}</Typography>
                {checkedAt > 0 && <Typography variant="body2" sx={{color: 'text.secondary'}}>{_t('SystemUpdate.checkedAt', {date: formatDate(checkedAt)})}</Typography>}
                <Button variant="outlined" size="small" disabled={loading} onClick={() => this.check(true)}>{_t('SystemUpdate.checkNow')}</Button>
            </Box>
            <Box sx={{height: 4, mb: 1}}>{loading && <LinearProgress/>}</Box>

            {[infoError, runtimeError].filter(Boolean).map(e => <Typography key={e} color="error" gutterBottom>{e}</Typography>)}

            {staleClient && <Box sx={{mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap'}}>
                <Typography color="warning.main">{_t('SystemUpdate.staleClient', {build: _app_.config.BUILD_NUMBER})}</Typography>
                <Button variant="outlined" size="small" onClick={() => location.reload()}>{_t('SystemUpdate.reload')}</Button>
            </Box>}

            <StyledOverview>
                <thead>
                    <tr><th>{_t('SystemUpdate.component')}</th><th>{_t('SystemUpdate.installed')}</th><th>{_t('SystemUpdate.available')}</th><th>Status</th><th/></tr>
                </thead>
                <tbody>
                    {this.renderRow('Lunuc', info && this.lunucState(info), infoLoading)}
                    {this.renderRow('Node.js', node, runtimeLoading)}
                    {this.renderRow('MongoDB', mongo, runtimeLoading)}
                </tbody>
            </StyledOverview>

            {this.renderProgress()}

            <Box sx={{mt: 2}}>
                {info && <ExpansionPanel disableGutters heading={<Typography>{_t('SystemUpdate.details', {name: 'Lunuc'})}</Typography>}>
                    <div>{this.renderLunucDetails(info)}</div>
                </ExpansionPanel>}
                {runtime && <ExpansionPanel disableGutters heading={<Typography>{_t('SystemUpdate.details', {name: 'Node.js'})}</Typography>}>
                    <div><NodeDetails node={runtime.node}/></div>
                </ExpansionPanel>}
                {runtime && <ExpansionPanel disableGutters heading={<Typography>{_t('SystemUpdate.details', {name: 'MongoDB'})}</Typography>}>
                    <div><MongoDetails mongo={runtime.mongodb} fcvMessage={fcvMessage}/></div>
                </ExpansionPanel>}
            </Box>

            <SimpleDialog open={!!dialog} title={dialog?.title || ''} maximizable={false}
                          onClose={e => {
                              this.setState({dialog: null})
                              if (!e || e.key !== 'yes') return
                              if (dialog.fcv) this.setFcv(dialog.fcv)
                              else this.startTask(dialog.mutation, dialog.variables)
                          }}
                          actions={[{key: 'no', label: _t('SystemContainer.cancel')},
                              {key: 'yes', label: dialog?.label || 'OK', type: dialog?.danger ? 'error' : 'primary', variant: 'contained', disabled: !!dialog?.disabled}]}>
                {dialog?.content}
            </SimpleDialog>
        </>
    }
}

export default SystemUpdatePanel
