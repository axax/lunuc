/**
 * System update (/admin/system -> tab "Update").
 *
 * - getSystemUpdateInfo: compares the local checkout with its git tracking branch (git fetch + rev-list)
 * - startSystemUpdate:   runs shell/start.sh -r <restart> (git pull, npm install, build, restart services)
 * - getSystemUpdateStatus: state + log of the running / last update
 *
 * The update must survive the restart of lunuc-api (start.sh restarts the api at the end, and systemd kills
 * every process of the unit on restart). That is why it runs as its own transient systemd unit
 * (systemd-run --unit=lunuc-update). The fixed unit name also guarantees that only one update runs at a time.
 * Without systemd (docker, dev machine) start.sh is spawned as detached process.
 *
 * Root / sudo is detected automatically:
 * - api runs as root          -> systemd-run directly
 * - api runs as other user    -> sudo -n systemd-run (needs passwordless sudo for systemd-run)
 * start.sh itself detects whether it needs sudo for systemctl (see shell/start.sh).
 */
import path from 'path'
import fs from 'fs'
import {execFile, spawn} from 'child_process'
import config from '../../gensrc/config.mjs'

// same as everywhere else (api/util/index.mjs, server/server.mjs): the services run in the project root
const ROOT_DIR = path.resolve()
const START_SCRIPT = path.join(ROOT_DIR, 'shell', 'start.sh')
// local_tmp is gitignored; start.sh writes status.json into the same folder
const UPDATE_DIR = path.join(ROOT_DIR, 'local_tmp', 'update')
const LOG_FILE = path.join(UPDATE_DIR, 'update.log')
const STATUS_FILE = path.join(UPDATE_DIR, 'status.json')
const UNIT_NAME = 'lunuc-update'
const RESTART_OPTIONS = ['all', 'api', 'client', 'none']
const FETCH_CACHE_MS = 5 * 60 * 1000
const MAX_COMMITS = 50
const MAX_LOG_BYTES = 64 * 1024

let lastFetch = {time: 0, error: null}

const exec = (cmd, args, {timeout = 30000, cwd = ROOT_DIR} = {}) => new Promise((resolve, reject) => {
    execFile(cmd, args, {cwd, timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024}, (error, stdout, stderr) => {
        if (error) {
            error.message = (stderr && stderr.trim()) || error.message
            reject(error)
        } else {
            resolve(stdout.trim())
        }
    })
})

const succeeds = (cmd, args, options) => exec(cmd, args, options).then(() => true, () => false)

// safe.directory: git refuses to work in a repo owned by another user ("dubious ownership"), e.g. api runs as root
const git = (...args) => exec('git', ['-c', `safe.directory=${ROOT_DIR}`, ...args], {timeout: 60000})

const isRoot = () => typeof process.getuid === 'function' && process.getuid() === 0

const hasSystemd = async () => fs.existsSync('/run/systemd/system') && await succeeds('systemd-run', ['--version'])

const canSudo = () => succeeds('sudo', ['-n', 'true'], {timeout: 5000})

/** how this process is able to launch the update */
const getLauncher = async () => {
    const root = isRoot()
    const systemd = await hasSystemd()
    const sudo = !root && await canSudo()

    let method = null, reason = null
    if (systemd) {
        if (root) {
            method = 'systemd-run'
        } else if (sudo) {
            method = 'sudo systemd-run'
        } else {
            reason = `The api runs as user "${process.env.USER || process.getuid?.()}" without passwordless sudo. Allow "sudo -n systemd-run" for this user or run the api as root.`
        }
    } else {
        // no systemd: no cgroup that kills us on restart, a detached process is good enough
        method = 'detached'
    }
    if (!fs.existsSync(START_SCRIPT)) {
        method = null
        reason = `${START_SCRIPT} not found`
    }
    return {method, reason, root, sudo, systemd}
}

const COMMIT_FORMAT = '%H%x1f%h%x1f%cI%x1f%an%x1f%s'
const parseCommits = out => out ? out.split('\n').map(line => {
    const [hash, shortHash, date, author, subject] = line.split('\x1f')
    return {hash, shortHash, date, author, subject}
}) : []

const readRemoteVersion = async () => {
    try {
        return JSON.parse(await git('show', '@{u}:package.json')).version || null
    } catch (e) {
        return null
    }
}

export const getSystemUpdateInfo = async ({fetch}) => {
    const result = {checkedAt: null, commits: [], dirtyFiles: []}

    try {
        result.branch = await git('rev-parse', '--abbrev-ref', 'HEAD')
        try {
            result.upstream = await git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')
        } catch (e) {
            result.error = `Branch "${result.branch}" has no tracking branch (git branch -u origin/${result.branch}).`
        }

        if (result.upstream) {
            const remote = result.upstream.split('/')[0]
            if (fetch || Date.now() - lastFetch.time > FETCH_CACHE_MS) {
                try {
                    await git('fetch', '--quiet', remote)
                    lastFetch = {time: Date.now(), error: null}
                } catch (e) {
                    lastFetch = {time: Date.now(), error: e.message}
                }
            }
            result.checkedAt = lastFetch.time
            result.fetchError = lastFetch.error
        }

        result.current = parseCommits(await git('log', '-1', `--pretty=format:${COMMIT_FORMAT}`, 'HEAD'))[0]
        // version of the running build (gensrc/config.mjs is generated by the build), not of package.json on disk
        result.currentVersion = config.APP_VERSION
        result.buildNumber = config.BUILD_NUMBER

        if (result.upstream) {
            result.latest = parseCommits(await git('log', '-1', `--pretty=format:${COMMIT_FORMAT}`, '@{u}'))[0]
            result.latestVersion = await readRemoteVersion()
            const [ahead, behind] = (await git('rev-list', '--left-right', '--count', 'HEAD...@{u}')).split(/\s+/).map(Number)
            result.ahead = ahead
            result.behind = behind
            if (behind > 0) {
                result.commits = parseCommits(await git('log', `-n${MAX_COMMITS}`, `--pretty=format:${COMMIT_FORMAT}`, 'HEAD..@{u}'))
                const changedFiles = (await git('diff', '--name-only', 'HEAD', '@{u}')).split('\n')
                result.dependenciesChanged = changedFiles.some(f => f === 'package.json' || f === 'package-lock.json')
            }
        }

        // local changes of tracked files let "git pull" fail
        const dirty = await git('diff', '--name-only', 'HEAD')
        result.dirtyFiles = dirty ? dirty.split('\n') : []
    } catch (e) {
        result.error = e.message
    }

    const launcher = await getLauncher()
    result.runAs = launcher.root ? 'root' : (process.env.USER || String(process.getuid?.()))
    result.launcher = launcher.method
    result.cannotUpdateReason = launcher.reason
    return result
}

const readStatusFile = () => {
    try {
        return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'))
    } catch (e) {
        return null
    }
}

const readLogTail = () => {
    try {
        const stat = fs.statSync(LOG_FILE)
        const start = Math.max(0, stat.size - MAX_LOG_BYTES)
        const fd = fs.openSync(LOG_FILE, 'r')
        const buffer = Buffer.alloc(stat.size - start)
        fs.readSync(fd, buffer, 0, buffer.length, start)
        fs.closeSync(fd)
        return (start > 0 ? '…\n' : '') + buffer.toString('utf8')
    } catch (e) {
        return ''
    }
}

const isProcessAlive = pid => {
    try {
        process.kill(pid, 0)
        return true
    } catch (e) {
        return e.code === 'EPERM'
    }
}

const isUpdateRunning = async (status) => {
    if (await hasSystemd()) {
        try {
            const state = await exec('systemctl', ['is-active', UNIT_NAME], {timeout: 5000})
            if (state === 'active' || state === 'activating') return true
        } catch (e) {
            // is-active exits with != 0 when the unit is not active
        }
    }
    return !!(status && status.state === 'running' && status.pid && isProcessAlive(status.pid))
}

export const getSystemUpdateStatus = async () => {
    const status = readStatusFile() || {}
    return {
        running: await isUpdateRunning(status),
        state: status.state || null,
        restart: status.restart || null,
        exitCode: status.exitCode !== undefined ? status.exitCode : null,
        from: status.from || null,
        to: status.to || null,
        startedAt: status.startedAt || null,
        finishedAt: status.finishedAt || null,
        log: readLogTail()
    }
}

const shellQuote = str => `'${String(str).replace(/'/g, `'\\''`)}'`

export const startSystemUpdate = async ({restart = 'all'}) => {
    if (RESTART_OPTIONS.indexOf(restart) < 0) {
        throw new Error(`Invalid restart option "${restart}"`)
    }
    if (await isUpdateRunning(readStatusFile())) {
        throw new Error('An update is already running')
    }
    const launcher = await getLauncher()
    if (!launcher.method) {
        throw new Error(launcher.reason || 'Update not possible on this system')
    }

    fs.mkdirSync(UPDATE_DIR, {recursive: true})
    try {
        // a root owned log of a previous run would not be overwritable by a non root launcher
        fs.rmSync(LOG_FILE, {force: true})
    } catch (e) {
    }

    // sh instead of executing the file directly -> the executable bit of start.sh does not matter
    const command = `exec /bin/sh ${shellQuote(START_SCRIPT)} -r ${restart} > ${shellQuote(LOG_FILE)} 2>&1`

    if (launcher.method === 'detached') {
        const child = spawn('/bin/sh', ['-c', command], {cwd: ROOT_DIR, detached: true, stdio: 'ignore', env: process.env})
        child.unref()
    } else {
        const args = [
            `--unit=${UNIT_NAME}`,
            '--collect',
            '--quiet',
            `--working-directory=${ROOT_DIR}`,
            // node / npm may live in a non default location (nvm, /usr/local/bin, ...)
            `--setenv=PATH=${process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'}`,
            `--setenv=HOME=${process.env.HOME || '/root'}`,
            '/bin/sh', '-c', command
        ]
        if (launcher.method === 'sudo systemd-run') {
            await exec('sudo', ['-n', 'systemd-run', ...args], {timeout: 15000})
        } else {
            await exec('systemd-run', args, {timeout: 15000})
        }
    }

    console.log(`System update started (${launcher.method}, restart=${restart})`)

    // give start.sh a moment to write its status
    await new Promise(resolve => setTimeout(resolve, 500))
    const status = await getSystemUpdateStatus()
    return {...status, running: true}
}
