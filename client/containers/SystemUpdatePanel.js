import React from 'react'
import {Typography, Button, Chip, Box, Select, MenuItem, FormControl, InputLabel, LinearProgress, SimpleDialog, Checkbox, FormControlLabel} from 'ui/admin'
import {_t} from 'util/i18n.mjs'
import {client} from '../middleware/graphql'
import Util from 'client/util/index.mjs'
import {StyledSystemTable} from './systemStyles'
import styled from '@emotion/styled'

/**
 * Tab "Update" in /admin/system: shows whether the git tracking branch has new commits and
 * starts shell/start.sh (see api/util/systemUpdate.mjs).
 */

const POLL_INTERVAL = 2000
// the api restarts at the end of the update, after that many failed polls we give up
const MAX_RESTART_POLLS = 300

const INFO_QUERY = `query systemUpdateInfo($fetch:Boolean){systemUpdateInfo(fetch:$fetch){
    branch upstream currentVersion buildNumber latestVersion ahead behind dirtyFiles dependenciesChanged checkedAt fetchError error runAs launcher cannotUpdateReason
    current{hash shortHash date author subject} latest{hash shortHash date author subject}
    commits{hash shortHash date author subject}}}`
const STATUS_FIELDS = 'running state restart force exitCode from to startedAt finishedAt log'
const STATUS_QUERY = `query systemUpdateStatus{systemUpdateStatus{${STATUS_FIELDS}}}`
const START_MUTATION = `mutation startSystemUpdate($restart:String,$force:Boolean){startSystemUpdate(restart:$restart,force:$force){${STATUS_FIELDS}}}`

const StyledLog = styled('pre')(({theme}) => ({
    background: theme.palette.mode === 'dark' ? '#111' : '#1e1e1e',
    color: '#ddd',
    fontSize: '0.75rem',
    padding: '0.75rem',
    maxHeight: '28rem',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    borderRadius: 4
}))

const StyledDl = styled('dl')({
    display: 'grid',
    gridTemplateColumns: 'max-content 1fr',
    gap: '0.25rem 1rem',
    margin: '0 0 1rem',
    dt: {fontWeight: 600},
    dd: {margin: 0}
})

const formatDate = date => date ? Util.formattedDatetime(date) : ''

/**
 * silent: while the api restarts every poll fails, no error message for each of them.
 * Graphql errors are rejected with "errors", network errors without.
 */
const isNetworkError = e => !e || !e.errors
const errorMessage = e => (e && e.error && e.error.message) || (e && e.message) || String(e)

const silentQuery = (query, variables = {}) =>
    client.query({query, variables, fetchPolicy: 'no-cache', silent: true}).then(response => response.data)

const silentMutation = (mutation, variables = {}) =>
    client.mutate({mutation, variables, silent: true}).then(response => response.data)

const CommitLine = ({commit}) => commit ? <span>
    <code>{commit.shortHash}</code> {commit.subject} <Typography component="span" variant="body2" sx={{color: 'text.secondary'}}>
    ({formatDate(commit.date)}, {commit.author})</Typography>
</span> : null

class SystemUpdatePanel extends React.Component {

    state = {
        info: null, infoLoading: false, infoError: null,
        status: null, phase: 'idle', restart: 'all', force: false, confirm: false, startError: null
    }

    componentDidMount() {
        this.loadInfo(false)
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

    loadInfo(fetchRemote) {
        this.setState({infoLoading: true, infoError: null})
        silentQuery(INFO_QUERY, {fetch: fetchRemote}).then(data => {
            if (!this._unmounted) this.setState({info: data.systemUpdateInfo, infoLoading: false})
        }).catch(e => {
            if (!this._unmounted) this.setState({infoError: errorMessage(e), infoLoading: false})
        })
    }

    startUpdate() {
        const {restart, force} = this.state
        this.setState({confirm: false, startError: null, phase: 'running', status: null})
        this._failedPolls = 0
        silentMutation(START_MUTATION, {restart, force}).then(data => {
            if (this._unmounted) return
            this.setState({status: data.startSystemUpdate})
            this.poll()
        }).catch(e => {
            if (!this._unmounted) this.setState({startError: errorMessage(e), phase: 'idle'})
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
                    this.loadInfo(false)
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

    renderStatusChip(info) {
        if (info.error) return <Chip color="error" label={_t('SystemUpdate.error')}/>
        if (info.behind > 0) return <Chip color="warning" label={_t(info.behind === 1 ? 'SystemUpdate.behindOne' : 'SystemUpdate.behind', {count: info.behind, upstream: info.upstream})}/>
        return <Chip color="success" label={_t('SystemUpdate.upToDate')}/>
    }

    renderInfo() {
        const {info, infoLoading, infoError} = this.state

        if (infoError) return <Typography color="error">{infoError}</Typography>
        if (!info) return <LinearProgress/>

        return <>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap'}}>
                {this.renderStatusChip(info)}
                <Button variant="outlined" size="small" disabled={infoLoading}
                        onClick={() => this.loadInfo(true)}>{_t('SystemUpdate.checkNow')}</Button>
                {info.checkedAt > 0 && <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {_t('SystemUpdate.checkedAt', {date: formatDate(info.checkedAt)})}</Typography>}
            </Box>
            {infoLoading && <LinearProgress sx={{mb: 2}}/>}

            {info.error && <Typography color="error" gutterBottom>{info.error}</Typography>}
            {info.fetchError && <Typography color="error" gutterBottom>git fetch: {info.fetchError}</Typography>}

            <StyledDl>
                <dt>{_t('SystemUpdate.installed')}</dt>
                <dd>{info.currentVersion && <strong>{info.currentVersion} </strong>}
                    {info.buildNumber && <>(Build {info.buildNumber}) </>}<CommitLine commit={info.current}/></dd>
                {info.latest && <>
                    <dt>{_t('SystemUpdate.available')}</dt>
                    <dd>{info.latestVersion && <strong>{info.latestVersion} </strong>}<CommitLine commit={info.latest}/></dd>
                </>}
                <dt>Branch</dt>
                <dd><code>{info.branch}</code>{info.upstream && <> → <code>{info.upstream}</code></>}</dd>
                <dt>{_t('SystemUpdate.runAs')}</dt>
                <dd>{info.runAs}{info.launcher && <> ({info.launcher})</>}</dd>
            </StyledDl>

            {info.buildNumber && _app_.config && _app_.config.BUILD_NUMBER && info.buildNumber !== _app_.config.BUILD_NUMBER &&
                <Box sx={{mb: 2}}>
                    <Typography color="warning.main" gutterBottom>{_t('SystemUpdate.staleClient', {build: _app_.config.BUILD_NUMBER})}</Typography>
                    <Button variant="outlined" size="small" onClick={() => location.reload()}>{_t('SystemUpdate.reload')}</Button>
                </Box>}

            {info.ahead > 0 && <Typography color="warning.main" gutterBottom>
                {_t('SystemUpdate.ahead', {count: info.ahead})}</Typography>}

            {info.dirtyFiles && info.dirtyFiles.length > 0 && <Box sx={{mb: 2}}>
                <Typography color="error">{_t('SystemUpdate.dirty')}</Typography>
                <ul>{info.dirtyFiles.map(f => <li key={f}><code>{f}</code></li>)}</ul>
            </Box>}

            {info.dependenciesChanged && <Typography color="warning.main" gutterBottom>
                {_t('SystemUpdate.dependenciesChanged')}</Typography>}

            {info.commits && info.commits.length > 0 && <>
                <Typography variant="h6" component="h3" sx={{mt: 2}}>{_t('SystemUpdate.newCommits')}</Typography>
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
                {info.behind > info.commits.length && <Typography variant="body2" sx={{color: 'text.secondary', mb: 2}}>
                    {_t('SystemUpdate.moreCommits', {count: info.behind - info.commits.length})}</Typography>}
            </>}
        </>
    }

    renderUpdate() {
        const {info, status, phase, restart, force, startError} = this.state
        const busy = phase === 'running' || phase === 'restarting'
        // local changes / local commits let "git pull --ff-only" fail -> only possible with force (git reset --hard)
        const hasLocalChanges = !!info && ((info.dirtyFiles && info.dirtyFiles.length > 0) || info.ahead > 0)
        const blocked = !info || !!info.cannotUpdateReason || !!info.error || (hasLocalChanges && !force)

        return <>
            <Typography variant="h5" component="h3" sx={{mt: 3}} gutterBottom>{_t('SystemUpdate.runUpdate')}</Typography>
            <Typography variant="body2" sx={{color: 'text.secondary', mb: 2}}>{_t('SystemUpdate.runUpdateInfo')}</Typography>

            {info && info.cannotUpdateReason && <Typography color="error" gutterBottom>{info.cannotUpdateReason}</Typography>}

            <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap'}}>
                <FormControl size="small" sx={{minWidth: 220}}>
                    <InputLabel id="system-update-restart">{_t('SystemUpdate.restart')}</InputLabel>
                    <Select labelId="system-update-restart" label={_t('SystemUpdate.restart')} value={restart} disabled={busy}
                            onChange={e => this.setState({restart: e.target.value})}>
                        <MenuItem value="all">{_t('SystemUpdate.restartAll')}</MenuItem>
                        <MenuItem value="api">{_t('SystemUpdate.restartApi')}</MenuItem>
                        <MenuItem value="client">{_t('SystemUpdate.restartClient')}</MenuItem>
                        <MenuItem value="none">{_t('SystemUpdate.restartNone')}</MenuItem>
                    </Select>
                </FormControl>
                <Button variant="contained" color={force ? 'error' : 'primary'} disabled={busy || blocked}
                        onClick={() => this.setState({confirm: true})}>{_t(force ? 'SystemUpdate.forceUpdateNow' : 'SystemUpdate.updateNow')}</Button>
            </Box>

            {hasLocalChanges && <Box sx={{mb: 2}}>
                <FormControlLabel
                    control={<Checkbox checked={force} disabled={busy} onChange={e => this.setState({force: e.target.checked})}/>}
                    label={_t('SystemUpdate.force')}/>
                <Typography variant="caption" component="div" sx={{color: 'text.secondary', ml: 4}}>
                    {_t('SystemUpdate.forceHint')}</Typography>
            </Box>}

            {startError && <Typography color="error" gutterBottom>{startError}</Typography>}

            {busy && <Box sx={{mb: 2}}>
                <LinearProgress sx={{mb: 1}}/>
                <Typography>{phase === 'restarting' ? _t('SystemUpdate.restarting') : _t('SystemUpdate.running')}</Typography>
            </Box>}

            {phase === 'done' && <Box sx={{mb: 2}}>
                <Typography color="success.main" gutterBottom>
                    {_t('SystemUpdate.done', {from: status?.from || '?', to: status?.to || '?'})}</Typography>
                <Button variant="contained" onClick={() => location.reload()}>{_t('SystemUpdate.reload')}</Button>
            </Box>}

            {phase === 'failed' && <Typography color="error" gutterBottom>{_t('SystemUpdate.failed')}</Typography>}

            {status && (status.log || status.startedAt) && <>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {_t('SystemUpdate.lastRun')}: {formatDate(status.startedAt)}{status.state && <> – {status.state}</>}
                    {status.exitCode !== null && status.exitCode !== 0 && <> (exit code {status.exitCode})</>}
                </Typography>
                <StyledLog ref={el => this._logEl = el}>{status.log || '…'}</StyledLog>
            </>}

            <SimpleDialog open={this.state.confirm} title={_t('SystemUpdate.confirmTitle')}
                          onClose={e => {
                              if (e && e.key === 'yes') {
                                  this.startUpdate()
                              } else {
                                  this.setState({confirm: false})
                              }
                          }}
                          actions={[{key: 'no', label: _t('SystemContainer.cancel')}, {key: 'yes', label: _t('SystemUpdate.updateNow'), type: 'primary'}]}>
                {_t('SystemUpdate.confirmText', {restart})}
                {force && <Typography color="error" sx={{mt: 2}}>{_t('SystemUpdate.confirmForce', {count: (info?.dirtyFiles?.length || 0) + (info?.ahead || 0)})}</Typography>}
            </SimpleDialog>
        </>
    }

    render() {
        return <>
            <Typography variant="h4" component="h2" gutterBottom>{_t('SystemUpdate.title')}</Typography>
            {this.renderInfo()}
            {this.renderUpdate()}
        </>
    }
}

export default SystemUpdatePanel
