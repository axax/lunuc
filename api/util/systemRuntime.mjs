/**
 * Node.js and MongoDB versions in /admin/system -> tab "Update".
 *
 * - getSystemRuntimeInfo: installed / running versions and the available releases
 *   (https://nodejs.org/dist/index.json, https://downloads.mongodb.org/current.json, cached)
 * - startNodeUpdate:  shell/update-node.sh (nvm install, npm rebuild, PATH in the lunuc-*.service files, restart)
 * - startMongoUpdate: shell/update-mongodb.sh (apt, one release series at a time, optional mongodump before)
 * - setMongoFeatureCompatibility: after a major upgrade of MongoDB
 *
 * The scripts run like the system update (api/util/systemUpdate.mjs -> launchTask): own systemd unit,
 * same log and status, only one task at a time.
 */
import fs from 'fs'
import path from 'path'
import {exec, getLauncher, launchTask, UPDATE_DIR} from './systemUpdate.mjs'
import {MONGO_URL, isLocalMongoUrl} from '../database.mjs'
import {getBackupDir} from '../resolver/backups.mjs'
import {compareVersions, majorOf, seriesOf} from '../../util/version.mjs'

const NODE_INDEX_URL = 'https://nodejs.org/dist/index.json'
const MONGODB_INDEX_URL = 'https://downloads.mongodb.org/current.json'
const REMOTE_CACHE_MS = 60 * 60 * 1000
const REMOTE_TIMEOUT_MS = 15000
const SYSTEMD_DIR = '/etc/systemd/system'
// PATH entry of an nvm node in the service files: <nvm dir>/versions/node/v26.13.0/bin
// (the dir has to start with "/", otherwise "PATH=" of Environment="PATH=..." would be part of it)
const NVM_PATH_RE = /(\/[^\s:"=]*)\/versions\/node\/(v\d+\.\d+\.\d+)\/bin/
const NODE_RELEASE_RE = /^v\d+\.\d+\.\d+$/
const NVM_EXEC_RE = /^(.*)\/versions\/node\/(v\d+\.\d+\.\d+)\/bin\/node$/
const MAX_NODE_RELEASES = 6
// lowest node major that is offered
const MIN_NODE_MAJOR = 20

/**
 * The parsed json is reduced by "transform" before it is cached, only the small result stays in memory.
 * Failed requests are not cached.
 */
const remoteCache = {}
const fetchCached = (url, transform, force) => {
    const cached = remoteCache[url]
    if (cached && !force && Date.now() - cached.time < REMOTE_CACHE_MS) {
        return cached.promise
    }
    const promise = fetch(url, {signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS)}).then(response => {
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
        return response.json()
    }).then(transform)
    remoteCache[url] = {time: Date.now(), promise}
    promise.catch(() => {
        if (remoteCache[url]?.promise === promise) delete remoteCache[url]
    })
    return promise
}

/** latest release of every node major, newest first: [{major, version, date, lts, security}] */
const fetchNodeReleases = force => fetchCached(NODE_INDEX_URL, list => {
    const byMajor = new Map()
    for (const entry of list) {
        // only final releases (index.json may also list pre-releases like v27.0.0-alpha...)
        if (!NODE_RELEASE_RE.test(entry.version)) continue
        const major = majorOf(entry.version)
        const latest = byMajor.get(major)
        if (major >= MIN_NODE_MAJOR && (!latest || compareVersions(entry.version, latest.version) > 0)) {
            byMajor.set(major, {major, version: entry.version, date: entry.date, lts: entry.lts || null, security: !!entry.security})
        }
    }
    return [...byMajor.values()].sort((a, b) => b.major - a.major)
}, force)

/** latest production release of every mongodb series, ascending: [{series, version}] */
const fetchMongoReleases = force => fetchCached(MONGODB_INDEX_URL, data => {
    const bySeries = new Map()
    for (const entry of (data.versions || [])) {
        const version = entry.version
        if (!version || version.includes('-') || entry.production_release === false || entry.release_candidate || entry.development_release) {
            continue
        }
        const series = seriesOf(version)
        // self-managed (apt) only gets some minor releases, the others are atlas only:
        // before 8.0 none, 8.x all, since 9.0 only the annual "feature update" release x.5
        const major = majorOf(series), minor = parseInt(series.split('.')[1])
        if (minor !== 0 && (major < 8 || (major >= 9 && minor !== 5))) {
            continue
        }
        const latest = bySeries.get(series)
        if (!latest || compareVersions(version, latest.version) > 0) {
            bySeries.set(series, {series, version})
        }
    }
    return [...bySeries.values()].sort((a, b) => compareVersions(a.series, b.series))
}, force)

/** node version of the lunuc-*.service files that get node from nvm */
const readNodeServices = () => {
    let files
    try {
        files = fs.readdirSync(SYSTEMD_DIR).filter(f => f.startsWith('lunuc-') && f.endsWith('.service'))
    } catch (e) {
        return []
    }
    return files.map(file => {
        try {
            const match = NVM_PATH_RE.exec(fs.readFileSync(path.join(SYSTEMD_DIR, file), 'utf8'))
            return match ? {name: file.slice(0, -'.service'.length), version: match[2], nvmDir: match[1]} : null
        } catch (e) {
            return null
        }
    }).filter(Boolean)
}

const getNodeInfo = async (force, launcher) => {
    const execMatch = NVM_EXEC_RE.exec(process.execPath)
    const result = {
        version: process.version,
        execPath: process.execPath,
        nvmDir: execMatch ? execMatch[1] : null,
        installed: [],
        services: readNodeServices(),
        releases: []
    }
    if (result.nvmDir) {
        try {
            result.installed = fs.readdirSync(path.join(result.nvmDir, 'versions', 'node'))
                .filter(v => NODE_RELEASE_RE.test(v)).sort(compareVersions).reverse()
        } catch (e) {
        }
    }

    try {
        const releases = await fetchNodeReleases(force)
        const currentMajor = majorOf(result.version)
        const latestLts = releases.find(r => r.lts)
        result.latest = releases[0]?.version || null
        result.latestLts = latestLts?.version || null
        result.latestPatch = releases.find(r => r.major === currentMajor)?.version || null
        // current major and newer, plus the latest lts (e.g. to go back from a current to an lts line).
        // Odd majors are never lts and end after a few months: only the newest one and the running one
        const minMajor = Math.min(currentMajor, latestLts ? latestLts.major : currentMajor)
        result.releases = releases.filter(r => r.major >= minMajor &&
            (r.lts || r.major === releases[0].major || r.major === currentMajor)).slice(0, MAX_NODE_RELEASES)
    } catch (e) {
        result.fetchError = e.message
    }

    if (!result.nvmDir) {
        result.cannotUpdateReason = `Node is not managed by nvm (${process.execPath})`
    } else if (!result.services.some(s => s.nvmDir === result.nvmDir)) {
        result.cannotUpdateReason = `No ${SYSTEMD_DIR}/lunuc-*.service with ${result.nvmDir}/versions/node/... in its PATH`
    } else if (!launcher.method) {
        result.cannotUpdateReason = launcher.reason
    }
    return result
}

const mongoCommand = (db, command) => db.admin().command(command)

const getMongoInfo = async (db, force, launcher) => {
    const result = {local: isLocalMongoUrl(MONGO_URL), releases: []}

    const [buildInfo, fcv, packageVersion, serviceState, releases] = await Promise.all([
        mongoCommand(db, {buildInfo: 1}).catch(e => ({error: e.message})),
        mongoCommand(db, {getParameter: 1, featureCompatibilityVersion: 1}).catch(() => null),
        exec('dpkg-query', ['-W', '-f=${Version}', 'mongodb-org-server'], {timeout: 5000}).catch(() => null),
        exec('systemctl', ['is-active', 'mongod'], {timeout: 5000}).catch(e => null),
        fetchMongoReleases(force).catch(e => ({error: e.message}))
    ])

    result.version = buildInfo.version || null
    result.error = buildInfo.error || null
    result.featureCompatibilityVersion = fcv?.featureCompatibilityVersion?.version || null
    result.packageVersion = packageVersion || null
    result.serviceActive = serviceState === 'active'
    // the installed package counts, the running server may not be restarted yet
    result.series = seriesOf(result.packageVersion || result.version)

    if (releases.error) {
        result.fetchError = releases.error
    } else {
        result.releases = releases
        result.latest = releases.length ? releases[releases.length - 1].version : null
        result.latestPatch = releases.find(r => r.series === result.series)?.version || null
        const next = result.series && releases.find(r => compareVersions(r.series, result.series) > 0)
        result.nextSeries = next ? next.series : null
        result.nextVersion = next ? next.version : null
    }

    if (!result.local) {
        result.cannotUpdateReason = 'MongoDB does not run on this server (LUNUC_MONGO_URL)'
    } else if (!result.packageVersion) {
        result.cannotUpdateReason = 'Package mongodb-org-server is not installed (only MongoDB from the apt repository can be updated)'
    } else if (!result.serviceActive) {
        result.cannotUpdateReason = 'Service mongod is not running'
    } else if (!launcher.method) {
        result.cannotUpdateReason = launcher.reason
    }
    return result
}

export const getSystemRuntimeInfo = async ({db, fetch}) => {
    const launcher = await getLauncher()
    const [node, mongodb] = await Promise.all([getNodeInfo(!!fetch, launcher), getMongoInfo(db, !!fetch, launcher)])
    const cached = remoteCache[NODE_INDEX_URL] || remoteCache[MONGODB_INDEX_URL]
    return {node, mongodb, checkedAt: cached ? cached.time : null}
}

export const startNodeUpdate = async ({version}) => {
    const info = await getNodeInfo(false, await getLauncher())
    if (info.cannotUpdateReason) {
        throw new Error(info.cannotUpdateReason)
    }
    // only the offered releases, nothing the client made up
    if (!info.releases.some(r => r.version === version)) {
        throw new Error(`Node ${version} is not an offered release`)
    }
    if (version === info.version && info.services.every(s => s.version === version)) {
        throw new Error(`Node ${version} is already active`)
    }
    return launchTask('node', ['-v', version])
}

export const startMongoUpdate = async ({db, series, backup}) => {
    const info = await getMongoInfo(db, false, await getLauncher())
    if (info.cannotUpdateReason) {
        throw new Error(info.cannotUpdateReason)
    }
    if (series === info.nextSeries) {
        if (info.featureCompatibilityVersion !== info.series) {
            throw new Error(`featureCompatibilityVersion must be ${info.series} before the upgrade to ${series} (is ${info.featureCompatibilityVersion || 'unknown'})`)
        }
    } else if (series !== info.series) {
        throw new Error(`Only ${info.series} (patch) or ${info.nextSeries || '-'} (next release series) are possible`)
    }

    const args = ['-s', series]
    if (!backup) {
        return launchTask('mongodb', args)
    }
    const urlFile = path.join(UPDATE_DIR, 'mongodb.url')
    args.push('-b', getBackupDir('db'))
    try {
        // not as argument: arguments are visible in "ps" and "systemctl status". The script deletes the file.
        return await launchTask('mongodb', args, {
            beforeLaunch: () => {
                // mode only applies when the file is created -> never write into an existing file
                fs.rmSync(urlFile, {force: true})
                fs.writeFileSync(urlFile, MONGO_URL, {mode: 0o600, flag: 'wx'})
            }
        })
    } catch (e) {
        fs.rmSync(urlFile, {force: true})
        throw e
    }
}

/** only to the release series of the running server (the step after a major upgrade) */
export const setMongoFeatureCompatibility = async ({db, version}) => {
    const {version: serverVersion} = await mongoCommand(db, {buildInfo: 1})
    const series = seriesOf(serverVersion)
    if (version !== series) {
        throw new Error(`featureCompatibilityVersion can only be set to ${series}`)
    }
    // since 7.0 the command needs confirm: true (the change can not be undone without support)
    await mongoCommand(db, majorOf(series) >= 7 ? {setFeatureCompatibilityVersion: series, confirm: true} : {setFeatureCompatibilityVersion: series})
    return {status: `featureCompatibilityVersion set to ${series}`}
}
