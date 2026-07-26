import path from 'path'
import Util from '../util/index.mjs'
import fs from 'fs'
import config from '../../gensrc/config.mjs'
import {exec, execFileSync} from 'child_process'
import os from 'os'
import zipper from 'zip-local'
import {MONGO_URL} from '../database.mjs'
const {BACKUP_DIR, BACKUP_URL, UPLOAD_DIR, HOSTRULES_ABSPATH} = config

const ABS_UPLOAD_DIR = path.join(path.resolve(), UPLOAD_DIR)

// Whitelist of all allowed backup/export types.
// type is used both in paths and (for mongoExport) as a collection name,
// so it MUST be strictly validated.
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

// query must be valid JSON (mongoexport -q expects a JSON query string).
// This doesn't inherently rule out shell metacharacters like ; ` $() ' "
// (JSON can contain strings with such characters), but since we use
// execFileSync without a shell, the string is NEVER interpreted by a
// shell - it lands 1:1 as a single argument in the mongoexport process.
// We still check for valid JSON so mongoexport doesn't throw cryptic
// errors, and to catch at least blatant abuse (e.g. completely malformed
// payloads) early.
const assertValidJsonQuery = (query) => {
    try {
        JSON.parse(query)
    } catch (e) {
        throw new Error(`Invalid query, must be valid JSON: ${e.message}`)
    }
}

export const getBackupDir = type => {
    assertAllowedType(type)
    return path.join(path.resolve(), `${BACKUP_DIR}/${type}dumps/`)
}

export const listBackups = type => {
    assertAllowedType(type)

    // make sure upload dir exists
    const backup_dir = getBackupDir(type)
    if (!Util.ensureDirectoryExistence(backup_dir, true)) {
        throw new Error(`Backup folder could not be created -> ${backup_dir}`)
    }

    const files = []
    fs.readdirSync(backup_dir).forEach(file => {
        if (file !== '.DS_Store') {
            const stats = fs.statSync(backup_dir + '/' + file)
            files.push({
                name: file,
                createdAt: (new Date(stats.mtime)).getTime(),
                size: (stats.size / 1000) + 'kb'
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
        result = createMediaBackup()
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

    return {name: result.name, createdAt: result.date, size: (stats.size / 1000) + 'kb'}
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

    if (!fs.existsSync(targetPath)) {
        throw new Error(`Backup file not found: ${safeName}`)
    }

    fs.unlinkSync(targetPath)

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

    // exec() is intentionally kept here (async, fire-and-forget like the
    // original) - MONGO_URL comes from our own config and is not user
    // input. If that ever changes, switch this to execFile as well.
    exec(`mongodump ${args.map(a => `"${a}"`).join(' ')}`)
    console.log('createDbDump', 'mongodump', args)
    return {fullName, name, date}
}

export const mongoExport = ({type, query}) => {
    // type is used as a MongoDB collection name -> validate strictly
    assertValidCollectionName(type)
    // query must be valid JSON
    assertValidJsonQuery(query)

    const fileName = `${type}-${new Date().getTime()}.json`
    const outDir = getBackupDir('export')
    const outFile = path.join(outDir, fileName)

    // execFileSync calls mongoexport WITHOUT a shell - every argument is
    // passed 1:1 as a process argument, NO shell interpretation of
    // ; ` $() ' " etc. takes place. This rules out command injection here,
    // even if "query" should contain malicious shell metacharacters.
    execFileSync('mongoexport', [
        '--uri', MONGO_URL,
        '-c', type,
        '-q', query,
        '-o', outFile
    ])

    return BACKUP_URL + '/exportdumps/' + fileName
}

export const createMediaBackup = (filesToBackup) => {
    // make sure upload dir exists
    const backup_dir = getBackupDir('media')
    if (!Util.ensureDirectoryExistence(backup_dir, true)) {
        throw new Error(`Backup folder coud not be created -> ${backup_dir}`)
    }

    const date = Date.now(),
        name = 'backup.media.' + date + '.gz',
        fullName = path.join(backup_dir, name)


    const media_dir = ABS_UPLOAD_DIR

    const files = fs.readdirSync(media_dir)
    if (files.length === 0) {
        throw new Error(`No files in folder -> ${media_dir}`)
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunuc'))
    files.forEach((file) => {
        if (file.indexOf('@') === -1) {
            if (filesToBackup) {
                if (filesToBackup.indexOf(file) >= 0) {
                    fs.copyFileSync(media_dir + '/' + file, tmpDir + '/' + file)
                }
            } else {
                const stat = fs.lstatSync(media_dir + '/' + file)


                if (!stat.isDirectory() && stat.size < 200000000) {
                    // only include files small then 200MBs
                    fs.copyFileSync(media_dir + '/' + file, tmpDir + '/' + file)
                }
            }
        }
    })


    // zip media dir
    zipper.sync.zip(tmpDir).compress().save(fullName)

    //remove temp files
    const tempFiles = fs.readdirSync(tmpDir)
    tempFiles.forEach((file) => {
        fs.unlinkSync(path.join(tmpDir, file))
    })
    fs.rmdirSync(tmpDir)

    return {fullName, name, date}

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