import Util from '../util/index.mjs'
import config from '../../gensrc/config.mjs'
import {CAPABILITY_RUN_COMMAND} from '../../util/capabilities.mjs'
import {promises as fs, constants as fsConstants} from 'fs'
import path from 'path'
import {spawn} from 'child_process'

/*
 * File browser of the admin (/admin/files, client/containers/FilesContainer.js).
 * Works with fs instead of shell commands: no parsing of `ls`, no quoting of file names
 * or search texts (command injection), atomic writes with a backup.
 * Every path has to stay inside one of the roots of FILE_SPACES.
 */

const MAX_EDIT_SIZE = 1024 * 1024 // bigger files are offered as download
const MAX_LIST_ENTRIES = 5000
const MAX_SEARCH_HITS = 500
const SEARCH_TIMEOUT = 20000
const SEARCH_EXCLUDE_DIRS = ['node_modules', '.git', 'bower_components']

// system: files there are system configuration -> explicit save and backup (client)
const FILE_SPACES = [
    {value: '.', name: 'Application', root: process.cwd()},
    {value: config.HOSTRULES_ABSPATH, name: 'Hostrules'},
    {value: config.WEBROOT_ABSPATH, name: 'Webroot'},
    {value: config.CONFIG_ABSPATH || '/etc/lunuc', name: 'Config (etc)', system: true},
    {value: '/etc/systemd/system', name: 'Systemd services', system: true}
].filter(space => space.value).map(space => ({...space, root: path.resolve(space.root || space.value)}))

const isInside = (root, target) => target === root || target.startsWith(root + path.sep)

const exists = (p) => fs.access(p).then(() => true, () => false)

// spaces that exist on this host (e.g. no systemd on macOS)
let availableSpaces
const getSpaces = async () => {
    if (!availableSpaces) {
        const flags = await Promise.all(FILE_SPACES.map(space => exists(space.root)))
        availableSpaces = FILE_SPACES.filter((space, i) => flags[i])
    }
    return availableSpaces
}

/*
 * space: value of a space or a directory inside one (e.g. './build/' of the ResourceEditor)
 * rel: path relative to the space ('' = the space itself)
 * -> {base, abs, root} or an error if the path leaves the roots
 */
const resolvePath = (space, rel) => {
    const base = path.resolve(space || '.')
    const root = FILE_SPACES.find(s => isInside(s.root, base))
    if (!root) {
        throw new Error('Path is not inside an allowed space')
    }
    const abs = path.resolve(base, '.' + path.sep + (rel || ''))
    if (!isInside(root.root, abs)) {
        throw new Error('Path is not inside an allowed space')
    }
    return {base, abs, root: root.root, rel: path.relative(base, abs)}
}

const checkName = (name) => {
    if (!name || name === '.' || name === '..' || name.length > 255 || /[/\\\0]/.test(name)) {
        throw new Error('Invalid name')
    }
    return name
}

const modeString = (mode) => (mode & 0o7777).toString(8).padStart(3, '0')

const entryType = (stat) => stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'link' : 'other'

// user and group names (/etc/passwd, /etc/group), read once; numeric ids where unknown (e.g. macOS)
let idNames
const readIdNames = async (file) => {
    const names = {}
    try {
        const text = await fs.readFile(file, 'utf8')
        text.split('\n').forEach(line => {
            const parts = line.split(':')
            if (parts.length > 2 && line[0] !== '#') {
                names[parts[2]] = parts[0]
            }
        })
    } catch (e) {
        // not readable -> numeric ids
    }
    return names
}
const ownerString = async (stat) => {
    if (!idNames) {
        const [users, groups] = await Promise.all([readIdNames('/etc/passwd'), readIdNames('/etc/group')])
        idNames = {users, groups}
    }
    return `${idNames.users[stat.uid] || stat.uid}:${idNames.groups[stat.gid] || stat.gid}`
}

const isBinary = (buffer) => {
    const length = Math.min(buffer.length, 8000)
    for (let i = 0; i < length; i++) {
        if (buffer[i] === 0) {
            return true
        }
    }
    return false
}

const listEntry = async (dir, dirent) => {
    const full = path.join(dir, dirent.name)
    const entry = {name: dirent.name, type: 'other'}
    try {
        const stat = await fs.lstat(full)
        entry.type = entryType(stat)
        entry.size = stat.size
        entry.mtime = stat.mtimeMs
        entry.mode = modeString(stat.mode)
        if (entry.type === 'link') {
            entry.target = await fs.readlink(full)
            try {
                const targetStat = await fs.stat(full)
                entry.targetType = entryType(targetStat)
                entry.size = targetStat.size
            } catch (e) {
                entry.targetType = 'broken'
            }
        }
    } catch (e) {
        // removed while listing or no permission -> listed without details
    }
    return entry
}

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'})
const isDirEntry = (entry) => entry.type === 'dir' || entry.targetType === 'dir'

const searchFiles = (base, text) => new Promise((resolve, reject) => {
    // no shell: the search text is passed as argument; -m 1 -> first hit per file
    const args = ['-rIinF', '--null', '-m', '1']
    SEARCH_EXCLUDE_DIRS.forEach(dir => args.push('--exclude-dir=' + dir))
    args.push('-e', text, '--', base)

    const grep = spawn('grep', args)
    const hits = []
    let rest = '', truncated = false, finished = false

    const finish = () => {
        if (!finished) {
            finished = true
            clearTimeout(timer)
            resolve({hits, truncated})
        }
    }
    const timer = setTimeout(() => {
        truncated = true
        grep.kill()
        finish()
    }, SEARCH_TIMEOUT)

    grep.stdout.on('data', (chunk) => {
        const lines = (rest + chunk.toString()).split('\n')
        rest = lines.pop()
        for (const line of lines) {
            // path\0line:text
            const nul = line.indexOf('\0')
            if (nul < 0) {
                continue
            }
            const lineText = line.substring(nul + 1)
            const colon = lineText.indexOf(':')
            hits.push({
                path: path.relative(base, line.substring(0, nul)),
                line: parseInt(lineText.substring(0, colon)) || null,
                text: lineText.substring(colon + 1).trim().substring(0, 200)
            })
            if (hits.length >= MAX_SEARCH_HITS) {
                truncated = true
                grep.kill()
                finish()
                return
            }
        }
    })
    grep.on('error', (e) => {
        if (!finished) {
            finished = true
            clearTimeout(timer)
            reject(e)
        }
    })
    // exit code 1 = nothing found, 2 = some files not readable -> the hits are still valid
    grep.on('close', finish)
})

/*
 * writes to a temp file in the same directory and renames it over the file, so a file is never
 * half written. Mode and owner are kept; symlinks are written through (the link stays a link).
 */
const writeAtomic = async (abs, content, backup) => {
    let target = abs, stat = null
    try {
        target = await fs.realpath(abs)
        stat = await fs.stat(target)
    } catch (e) {
        // new file
    }
    if (stat && !stat.isFile()) {
        throw new Error('Not a file')
    }

    let backupWritten = false
    if (backup && stat) {
        await fs.copyFile(target, target + '.bak')
        backupWritten = true
    }

    if (!stat) {
        await fs.writeFile(target, content, {flag: 'wx'})
        return backupWritten
    }

    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.lunuc-${process.pid}-${Date.now()}.tmp`)
    try {
        await fs.writeFile(tmp, content, {mode: stat.mode & 0o7777, flag: 'wx'})
    } catch (e) {
        // directory not writable (only the file is) -> write in place
        await fs.writeFile(target, content)
        return backupWritten
    }
    try {
        // mode is masked by umask at creation
        await fs.chmod(tmp, stat.mode & 0o7777)
        if (process.getuid && (process.getuid() === 0 || process.getuid() === stat.uid)) {
            await fs.chown(tmp, stat.uid, stat.gid).catch(() => {})
        }
        await fs.rename(tmp, target)
    } catch (e) {
        await fs.unlink(tmp).catch(() => {})
        throw e
    }
    return backupWritten
}

const checkCapability = (db, context) => Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_COMMAND)

export const filesResolver = (db) => ({
    Query: {
        fileSpaces: async ({}, {context}) => {
            await checkCapability(db, context)
            return getSpaces()
        },
        listFiles: async ({space, dir}, {context}) => {
            await checkCapability(db, context)
            const {abs, base} = resolvePath(space, dir)
            const dirents = await fs.readdir(abs, {withFileTypes: true})
            const truncated = dirents.length > MAX_LIST_ENTRIES
            const entries = await Promise.all(dirents.slice(0, MAX_LIST_ENTRIES).map(dirent => listEntry(abs, dirent)))

            entries.sort((a, b) => (isDirEntry(b) - isDirEntry(a)) || collator.compare(a.name, b.name))
            return {dir: path.relative(base, abs), entries, truncated}
        },
        readFile: async ({space, path: rel, backup}, {context}) => {
            await checkCapability(db, context)
            const {abs} = resolvePath(space, rel)
            const file = backup ? abs + '.bak' : abs
            const stat = await fs.stat(file)
            if (!stat.isFile()) {
                throw new Error('Not a file')
            }
            const [owner, writable, hasBackup] = await Promise.all([
                ownerString(stat),
                fs.access(file, fsConstants.W_OK).then(() => true, () => false),
                backup ? false : exists(abs + '.bak')
            ])
            const result = {
                path: rel, size: stat.size, mtime: stat.mtimeMs, mode: modeString(stat.mode), owner, writable, hasBackup
            }
            if (stat.size > MAX_EDIT_SIZE) {
                result.tooLarge = true
                return result
            }
            const buffer = await fs.readFile(file)
            if (isBinary(buffer)) {
                result.binary = true
            } else {
                result.content = buffer.toString('utf8')
            }
            return result
        },
        searchFiles: async ({space, dir, text}, {context}) => {
            await checkCapability(db, context)
            if (!text) {
                return {hits: [], truncated: false}
            }
            const {abs, base} = resolvePath(space, dir)
            const result = await searchFiles(abs, text)
            // paths relative to the space
            const prefix = path.relative(base, abs)
            if (prefix) {
                result.hits.forEach(hit => {
                    hit.path = path.join(prefix, hit.path)
                })
            }
            return result
        }
    },
    Mutation: {
        writeFile: async ({space, path: rel, content, expectedMtime, backup, force}, {context}) => {
            await checkCapability(db, context)
            const {abs} = resolvePath(space, rel)
            if (expectedMtime && !force) {
                const stat = await fs.stat(abs).catch(() => null)
                // changed by someone else since it was loaded
                if (stat && Math.abs(stat.mtimeMs - expectedMtime) > 1) {
                    throw new Error('FILE_CHANGED')
                }
            }
            const backupWritten = await writeAtomic(abs, content, backup)
            const stat = await fs.stat(abs)
            return {path: rel, mtime: stat.mtimeMs, size: stat.size, backup: backupWritten}
        },
        fileOperation: async ({space, path: rel, operation, newName}, {context}) => {
            await checkCapability(db, context)
            const {abs, base} = resolvePath(space, rel)
            const sibling = () => {
                const target = resolvePath(space, path.join(path.dirname(path.relative(base, abs)), checkName(newName)))
                return target.abs
            }

            if (operation === 'mkdir' || operation === 'touch') {
                checkName(path.basename(abs))
                if (operation === 'mkdir') {
                    await fs.mkdir(abs)
                } else {
                    await fs.writeFile(abs, '', {flag: 'wx'})
                }
                return {status: 'ok', path: rel}
            }

            if (abs === base) {
                throw new Error('Not allowed on the space itself')
            }

            if (operation === 'rename') {
                const target = sibling()
                if (await exists(target)) {
                    throw new Error('Target already exists')
                }
                await fs.rename(abs, target)
                return {status: 'ok', path: path.relative(base, target)}
            } else if (operation === 'copy') {
                const target = sibling()
                await fs.cp(abs, target, {recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true, preserveTimestamps: true})
                return {status: 'ok', path: path.relative(base, target)}
            } else if (operation === 'delete') {
                // a symlink is removed itself, not its target
                await fs.rm(abs, {recursive: true})
                return {status: 'ok', path: rel}
            }
            throw new Error('Unknown operation')
        }
    }
})
