import React from 'react'
import {Typography, Select, MenuItem, FormControl, InputLabel, Checkbox, FormControlLabel} from 'ui/admin'
import {_t} from 'util/i18n.mjs'
import {StyledSystemDl} from './systemStyles'
import {isNewerVersion as isNewer, seriesOf} from '../../util/version.mjs'

/**
 * Node.js and MongoDB parts of /admin/system -> Update (api/util/systemRuntime.mjs):
 * derived state, overview row values, details and dialog contents. SystemUpdatePanel puts them together.
 */

const STATUS_FIELDS = 'running task state restart force exitCode from to startedAt finishedAt log'
export const RUNTIME_QUERY = `query systemRuntimeInfo($fetch:Boolean){systemRuntimeInfo(fetch:$fetch){checkedAt
    node{version execPath nvmDir installed services{name version} releases{major version date lts security} latest latestLts latestPatch fetchError cannotUpdateReason}
    mongodb{version packageVersion featureCompatibilityVersion series local serviceActive latest latestPatch nextSeries nextVersion error fetchError cannotUpdateReason}}}`
export const NODE_MUTATION = `mutation startNodeUpdate($version:String!){startNodeUpdate(version:$version){${STATUS_FIELDS}}}`
export const MONGO_MUTATION = `mutation startMongoUpdate($series:String!,$backup:Boolean){startMongoUpdate(series:$series,backup:$backup){${STATUS_FIELDS}}}`
export const FCV_MUTATION = `mutation setMongoFeatureCompatibility($version:String!){setMongoFeatureCompatibility(version:$version){status}}`

const releaseLabel = release => {
    const tags = [release.lts ? `LTS ${release.lts}` : 'Current']
    if (release.security) tags.push(_t('SystemRuntime.security'))
    return `${release.version} (${tags.join(', ')})`
}

const Muted = ({children}) => <Typography component="span" variant="body2" sx={{color: 'text.secondary'}}>{children}</Typography>

const Errors = ({list}) => list.filter(Boolean).map(e => <Typography key={e} color="error" variant="body2" gutterBottom>{e}</Typography>)

/* ---------------------------------------------------------------- node ---- */

/** suggestion for the version select: next patch release, otherwise the latest lts */
export const suggestNodeVersion = (node, current) => {
    const offered = node.releases.map(r => r.version)
    if (offered.includes(current)) return current
    return isNewer(node.latestPatch, node.version) ? node.latestPatch : (node.latestLts || offered[0] || '')
}

export const nodeState = node => {
    const restartNeeded = node.services.some(s => s.version !== node.version)
    const available = isNewer(node.latestPatch, node.version) ? node.latestPatch
        : (isNewer(node.latestLts, node.version) ? node.latestLts : null)
    let chip
    if (restartNeeded) chip = {color: 'warning', label: _t('SystemRuntime.restartNeeded')}
    else if (available) chip = {color: 'warning', label: _t('SystemRuntime.updateAvailable', {version: available})}
    else if (node.fetchError) chip = {color: 'default', label: '?'}
    else chip = {color: 'success', label: _t('SystemUpdate.upToDate')}
    return {
        installed: node.version,
        available: available || '–',
        chip,
        action: {label: _t('SystemRuntime.switchDots'), dialog: 'node', primary: !!available, reason: node.cannotUpdateReason}
    }
}

export const NodeDetails = ({node}) => <>
    <Errors list={[node.cannotUpdateReason, node.fetchError]}/>
    <StyledSystemDl>
        <dt>{_t('SystemRuntime.running')}</dt>
        <dd>{node.version} <Muted>{node.execPath}</Muted></dd>
        {node.services.length > 0 && <>
            <dt>{_t('SystemRuntime.services')}</dt>
            <dd>{node.services.map(s => <div key={s.name}>{s.name}: <code>{s.version}</code>
                {s.version !== node.version && <Muted> ({_t('SystemRuntime.notRestarted')})</Muted>}</div>)}</dd>
        </>}
        {node.installed.length > 0 && <>
            <dt>{_t('SystemRuntime.installedNvm')}</dt>
            <dd>{node.installed.join(', ')}</dd>
        </>}
        {node.latestLts && <>
            <dt>{_t('SystemRuntime.latest')}</dt>
            <dd>LTS {node.latestLts}{node.latest !== node.latestLts && <>, Current {node.latest}</>}</dd>
        </>}
    </StyledSystemDl>
    <Muted>{_t('SystemRuntime.nodeInfo')}</Muted>
</>

export const nodeDialog = (node, {nodeVersion, onVersion}) => ({
    title: _t('SystemRuntime.nodeConfirmTitle'),
    label: _t('SystemRuntime.nodeSwitch'),
    disabled: !nodeVersion || (nodeVersion === node.version && node.services.every(s => s.version === nodeVersion)),
    mutation: NODE_MUTATION,
    variables: {version: nodeVersion},
    content: <>
        <FormControl size="small" sx={{minWidth: 280, mt: 1, mb: 2}}>
            <InputLabel id="system-runtime-node">{_t('SystemRuntime.nodeVersion')}</InputLabel>
            <Select labelId="system-runtime-node" label={_t('SystemRuntime.nodeVersion')} value={nodeVersion}
                    onChange={e => onVersion(e.target.value)}>
                {node.releases.map(r => <MenuItem key={r.version} value={r.version}>{releaseLabel(r)}</MenuItem>)}
            </Select>
        </FormControl>
        <Typography>{_t('SystemRuntime.nodeConfirmText', {from: node.version, to: nodeVersion || '?', services: node.services.map(s => s.name).join(', ')})}</Typography>
    </>
})

/* ------------------------------------------------------------- mongodb ---- */

export const mongoState = mongo => {
    const serverSeries = seriesOf(mongo.version)
    const fcvBehind = !!mongo.featureCompatibilityVersion && !!serverSeries && mongo.featureCompatibilityVersion !== serverSeries
    const patchAvailable = isNewer(mongo.latestPatch, mongo.packageVersion)
    const fcvReady = mongo.featureCompatibilityVersion === mongo.series
    const restartNeeded = !!mongo.packageVersion && !!mongo.version && mongo.packageVersion !== mongo.version

    let chip, action = null
    // one step at a time: finish the last upgrade (fcv), then patch, then the next release series
    if (fcvBehind) {
        chip = {color: 'warning', label: `FCV ${mongo.featureCompatibilityVersion}`}
        action = {label: _t('SystemRuntime.fcvDots'), dialog: 'fcv', primary: true}
    } else if (patchAvailable) {
        chip = {color: 'warning', label: _t('SystemRuntime.updateAvailable', {version: mongo.latestPatch})}
        action = {label: _t('SystemUpdate.updateDots'), dialog: 'mongoPatch', primary: true, reason: mongo.cannotUpdateReason}
    } else if (mongo.nextSeries) {
        chip = {color: 'info', label: _t('SystemRuntime.upgradeAvailable', {version: mongo.nextVersion})}
        action = {label: _t('SystemRuntime.upgradeDots'), dialog: 'mongoUpgrade', primary: false,
            reason: mongo.cannotUpdateReason || (!fcvReady ? _t('SystemRuntime.mongoFcvRequired', {series: mongo.series}) : null)}
    } else if (mongo.error || mongo.fetchError) {
        chip = {color: 'default', label: '?'}
    } else {
        chip = {color: 'success', label: _t('SystemUpdate.upToDate')}
    }
    if (restartNeeded) chip = {color: 'warning', label: _t('SystemRuntime.restartNeeded')}

    const installed = mongo.packageVersion || mongo.version || '?'
    return {
        installed: mongo.local === false ? `${installed} (${_t('SystemRuntime.remote')})` : installed,
        available: patchAvailable ? mongo.latestPatch : (mongo.nextSeries ? `${mongo.nextVersion} (Upgrade)` : '–'),
        chip, action, serverSeries
    }
}

export const MongoDetails = ({mongo, fcvMessage}) => <>
    <Errors list={[mongo.error, mongo.cannotUpdateReason, mongo.fetchError]}/>
    {fcvMessage && <Typography color={fcvMessage.ok ? 'success.main' : 'error'} variant="body2" gutterBottom>{fcvMessage.text}</Typography>}
    <StyledSystemDl>
        <dt>{_t('SystemRuntime.server')}</dt>
        <dd>{mongo.version || '?'}</dd>
        {mongo.packageVersion && <>
            <dt>{_t('SystemRuntime.package')}</dt>
            <dd>mongodb-org-server {mongo.packageVersion}</dd>
        </>}
        <dt>featureCompatibilityVersion</dt>
        <dd>{mongo.featureCompatibilityVersion || '?'}</dd>
        {mongo.latestPatch && <>
            <dt>{_t('SystemRuntime.latestInSeries', {series: mongo.series})}</dt>
            <dd>{mongo.latestPatch}</dd>
        </>}
        {mongo.nextSeries && <>
            <dt>{_t('SystemRuntime.nextSeries')}</dt>
            <dd>{mongo.nextSeries} ({mongo.nextVersion}){mongo.latest !== mongo.nextVersion && <>, {_t('SystemRuntime.newest')} {mongo.latest}</>}</dd>
        </>}
    </StyledSystemDl>
    <Muted>{_t('SystemRuntime.mongoInfo')}</Muted>
</>

const BackupOption = ({checked, onChange}) => <FormControlLabel sx={{mt: 1}}
    control={<Checkbox checked={checked} onChange={e => onChange(e.target.checked)}/>} label={_t('SystemRuntime.mongoBackup')}/>

export const mongoDialog = (type, mongo, {serverSeries, mongoBackup, onBackup}) => {
    if (type === 'fcv') {
        return {
            title: _t('SystemRuntime.fcvConfirmTitle'),
            label: _t('SystemRuntime.fcvSet', {series: serverSeries}),
            fcv: serverSeries,
            content: <Typography>{_t('SystemRuntime.fcvBehind', {fcv: mongo.featureCompatibilityVersion, series: serverSeries})}</Typography>
        }
    }
    const upgrade = type === 'mongoUpgrade'
    return {
        title: _t(upgrade ? 'SystemRuntime.mongoUpgradeTitle' : 'SystemRuntime.mongoPatchTitle'),
        label: _t(upgrade ? 'SystemRuntime.mongoUpgrade' : 'SystemRuntime.mongoPatch', {series: mongo.nextSeries, version: mongo.latestPatch}),
        mutation: MONGO_MUTATION,
        variables: {series: upgrade ? mongo.nextSeries : mongo.series, backup: mongoBackup},
        content: <>
            <Typography>{upgrade
                ? _t('SystemRuntime.mongoUpgradeText', {from: mongo.series, to: mongo.nextSeries})
                : _t('SystemRuntime.mongoPatchText', {from: mongo.packageVersion, to: mongo.latestPatch})}</Typography>
            <BackupOption checked={mongoBackup} onChange={onBackup}/>
        </>
    }
}
