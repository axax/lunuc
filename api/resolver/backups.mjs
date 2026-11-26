import path from 'path'
import Util from '../util/index.mjs'
import fs from 'fs'
import config from '../../gensrc/config.mjs'
import {execFile} from 'child_process'

// suffix for backups that are still being written
const PARTIAL_SUFFIX = '.part'
import zipper from 'zip-local'
import {ZipArchive} from 'archiver'
import {MONGO_URL} from '../database.mjs'
const {BACKUP_DIR, BACKUP_URL, UPLOAD_DIR, HOSTRULES_ABSPATH} = config

const ABS_UPLOAD_DIR = path.join(path.resolve(), UPLOAD_DIR)

// Whitelist of all allowed backup/export types.
// type is used in paths, so it MUST be strictly validated.
// ('export': old mongoexport dumps, still listed / pruned by the backup cronjob)
const ALLOWED_TYPES = ['db', 'media', 'hostrule', 'export']

const assertAllowedType = (type) => {
    if (!ALLOWED_TYPES.includes(type)) {
        throw new Error(`Invalid backup type: ${type}`)
    }
}

// MongoDB collection names must not contain special characters like $ or \0.
// We defensively only allow alphanumeric characters, underscore and hyphen.
const COLLECTION_NAME_RE = /^[a-zA-Z0-9_-]+$/

const assertValidCollectionName = (name) => {
    if (typeof name !== 'string' || !COLLECTION_NAME_RE.test(name)) {
        throw new Error(`Invalid collection name: ${name}`)
    }
}


export const getBackupDir = type => {
    assertAllowedType(type)
    return path.join(path.resolve(), `${BACKUP_DIR}/${type}dumps/`)
}

/*
 includePending: also list dumps that are still being written (".part" files) with pending=true
 and their final name - used by the admin ui to show the progress.
 */
export const listBackups = (type, {includePending} = {}) => {
    assertAllowedType(type)

    // make sure upload dir exists
    const backup_dir = getBackupDir(type)
    if (!Util.ensureDirectoryExistence(backup_dir, true)) {
        throw new Error(`Backup folder could not be created -> ${backup_dir}`)
    }

    const files = []
    fs.readdirSync(backup_dir).forEach(file => {
        const pending = file.endsWith(PARTIAL_SUFFIX)
        if (file !== '.DS_Store' && (!pending || includePending)) {
            const stats = fs.statSync(backup_dir + '/' + file)
            files.push({
                name: pending ? file.slice(0, -PARTIAL_SUFFIX.length) : file,
                createdAt: (new Date(stats.mtime)).getTime(),
                size: (stats.size / 1000) + 'kb',
                bytes: stats.size,
                pending
            })
        }
    })
    files.reverse()

    return files
}

export const createBackup = (type, options) => {
    assertAllowedType(type)

    let result
    if (type === 'db') {
        result = createDbBackup(options)
    } else if (type === 'media') {
        // options.ids: only these media (e.g. the current results in the media list)
        result = createMediaBackup(options && Array.isArray(options.ids) ? options.ids : undefined)
    } else if (type === 'hostrule') {
        result = createHostruleBackup()
    } else {
        throw new Error(`Unsupported backup type for createBackup: ${type}`)
    }
    let stats = {size: 0}
    try {
        stats = fs.statSync(result.fullName)
    } catch (e) {
    }

    // pending: the dump is written in the background (db) and not yet in the list of finished backups
    return {name: result.name, createdAt: result.date, size: (stats.size / 1000) + 'kb', bytes: stats.size, pending: !!result.pending}
}

export const removeBackup = (type, name) => {
    assertAllowedType(type)

    const backup_dir = getBackupDir(type)

    // Prevents path traversal: only the plain file name is considered,
    // regardless of what was actually passed in "name" (e.g. "../../etc/passwd").
    const safeName = path.basename(name)

    const targetPath = path.resolve(backup_dir, safeName)
    const resolvedBackupDir = path.resolve(backup_dir)

    // Extra safeguard: the resolved target path must actually lie within
    // the backup directory.
    if (!targetPath.startsWith(resolvedBackupDir + path.sep)) {
        throw new Error(`Invalid backup file name: ${name}`)
    }

    if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath)
    } else if (fs.existsSync(targetPath + PARTIAL_SUFFIX)) {
        // unfinished dump (e.g. the api was restarted while it was written)
        fs.unlinkSync(targetPath + PARTIAL_SUFFIX)
    } else {
        throw new Error(`Backup file not found: ${safeName}`)
    }

    return {status: 'ok'}
}

export const createDbBackup = (options = {}) => {
    // make sure upload dir exists
    const backup_dir = getBackupDir('db')
    if (!Util.ensureDirectoryExistence(backup_dir, true)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    /*
     Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip
     */
    const date = Date.now(),
        name = 'backup.db.' + date + '.gz',
        fullName = path.join(backup_dir, name)

    const args = ['--uri', MONGO_URL, '-v', '--archive=' + fullName, '--gzip']

    if (options.excludeCollection) {
        options.excludeCollection.forEach(f => {
            assertValidCollectionName(f)
            args.push('--excludeCollection=' + f)
        })
    }

    // mongodump writes into a temporary ".part" file which is only renamed
    // to its final name once the dump has finished successfully. Otherwise
    // the half-written .gz shows up in the backup list immediately and can
    // be downloaded truncated (-> "unexpected EOF" on restore).
    // Still async/fire-and-forget so the GraphQL call returns immediately.
    const partName = fullName + PARTIAL_SUFFIX
    args[args.indexOf('--archive=' + fullName)] = '--archive=' + partName

    execFile('mongodump', args, (error, stdout, stderr) => {
        if (error) {
            console.error('createDbDump failed', error.message, stderr)
            try {
                fs.unlinkSync(partName)
            } catch (e) {
            }
            return
        }
        try {
            fs.renameSync(partName, fullName)
            console.log('createDbDump finished', fullName)
        } catch (e) {
            console.error('createDbDump rename failed', e.message)
        }
    })
    console.log('createDbDump', 'mongodump', args)
    return {fullName, name, date, pending: true}
}

// mediaIds: only the originals of these media (public "<id>" and private "private<id>"),
// otherwise all originals (< 200MB). Generated variants ("@") and hidden folders (trash) are not included.
// Written in the background as a stream directly from the upload dir into the zip (before: everything was
// copied into a temp dir and zipped synchronously, which blocked the api for the whole time).
// Like the db backup it is written to a ".part" file first and listed as pending until it is done.
export const createMediaBackup = (mediaIds) => {
    const backup_dir = getBackupDir('media')
    if (!Util.ensureDirectoryExistence(backup_dir, true)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    const date = Date.now(),
        name = 'backup.media.' + date + '.gz',
        fullName = path.join(backup_dir, name),
        partName = fullName + PARTIAL_SUFFIX

    // a set: one lookup per file instead of a search in the list
    const filesToBackup = mediaIds ? new Set(mediaIds.flatMap(id => [String(id), 'private' + id])) : null

    const writeZip = async () => {
        const output = fs.createWriteStream(partName)
        // media are mostly compressed already (jpg, png, mp4): a low level saves a lot of cpu
        const archive = new ZipArchive({zlib: {level: 3}})
        const done = new Promise((resolve, reject) => {
            output.on('close', resolve)
            output.on('error', reject)
            archive.on('error', reject)
        })
        archive.pipe(output)

        let count = 0
        // opendir streams the entries (no array with all file names of a big upload dir)
        for await (const entry of await fs.promises.opendir(ABS_UPLOAD_DIR)) {
            const file = entry.name
            if (!entry.isFile() || file.indexOf('@') >= 0 || file.startsWith('.')) {
                continue
            }
            if (filesToBackup) {
                if (!filesToBackup.has(file)) continue
            } else if ((await fs.promises.stat(path.join(ABS_UPLOAD_DIR, file))).size >= 200000000) {
                // only include files smaller than 200MB
                continue
            }
            archive.file(path.join(ABS_UPLOAD_DIR, file), {name: file})
            count++
        }
        if (!count) {
            // close the open .part file (it is removed in the catch below)
            archive.abort()
            output.destroy()
            throw new Error(`No files in folder -> ${ABS_UPLOAD_DIR}`)
        }
        await archive.finalize()
        await done
        await fs.promises.rename(partName, fullName)
        console.log(`createMediaBackup finished: ${fullName} (${count} files)`)
    }

    writeZip().catch(e => {
        console.error('createMediaBackup failed', e.message)
        fs.unlink(partName, () => {})
    })

    return {fullName, name, date, pending: true}
}


export const createHostruleBackup = () => {
    // make sure upload dir exists
    const backup_dir = getBackupDir('hostrule')
    if (!Util.ensureDirectoryExistence(backup_dir, true)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    const date = Date.now(),
        name = 'backup.hostrule.' + date + '.gz',
        fullName = path.join(backup_dir, name)


    // zip media dir
    zipper.sync.zip(HOSTRULES_ABSPATH).compress().save(fullName)

    return {fullName, name, date}

}