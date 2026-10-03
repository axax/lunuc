/**
 * Exports entries of types that contain scripts (CronJob, Hook, Api, ...) as files,
 * so they can be edited with an editor or an AI. One folder per entry:
 *
 *   <dir>/<name>/script.js     the script (script.py for Python cronjobs)
 *   <dir>/<name>/meta.json     all other attributes, ids as {"$oid": "..."}
 *
 * Usage in a cronjob:
 *   const {exportTypeScriptsToDirectory} = await requireAsync('@api/util/typeScriptFiles.mjs')
 *   await exportTypeScriptsToDirectory({db: this.db, context: this.context, type: 'CronJob', dir: './dbscripts/cronjobs'})
 */
import fs from 'fs'
import path from 'path'
import {ObjectId} from 'mongodb'
import Util from './index.mjs'
import {createMatchForCurrentUser} from './dbquery.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../util/capabilities.mjs'
import {toPlainJson, fromPlainJson} from './plainJson.mjs'
import {readExportState, writeExportState, hashFields, hashValue, threeWayDiff} from './exportState.mjs'
import GenericResolver from '../resolver/generic/genericResolver.mjs'

export const META_FILE = 'meta.json'

/**
 * per type: which field names the folder, which fields are scripts and which fields must
 * never end up in a file (secrets)
 */
export const TYPE_SCRIPT_DEFINITIONS = {
    CronJob: {
        folderFields: ['name'],
        scripts: [{field: 'script', file: (item) => item.scriptLanguage === 'Python' ? 'script.py' : 'script.js'}]
    },
    Hook: {
        folderFields: ['name', 'hook'],
        scripts: [{field: 'script', file: () => 'script.js'}]
    },
    Api: {
        folderFields: ['slug', 'name'],
        scripts: [{field: 'script', file: () => 'script.js'}],
        secretFields: ['baPassword']
    }
}

const README = (type) => `# ${type} export

One folder per ${type} entry.

| File | Content |
|---|---|
| script.js / script.py | the script |
| meta.json | all other attributes (ids as \`{"$oid": "..."}\`, dates as \`{"$date": "..."}\`) |

\`_id\` in meta.json identifies the entry. Secrets (e.g. passwords) are not exported.
`

// never compared or imported
const INFO_FIELDS = ['_id', 'createdBy', 'modifiedAt']
const SECRET_PLACEHOLDER = '*** not exported ***'

/**
 * values of an entry in the representation of the files (plain json, scripts as text).
 * Secret fields are left out, they are never imported
 */
const comparableValues = (type, item) => {
    const definition = TYPE_SCRIPT_DEFINITIONS[type]
    const scriptFields = definition.scripts.map(s => s.field)
    const secretFields = definition.secretFields || []
    const values = {}
    scriptFields.forEach(field => values[field] = item[field] || '')
    Object.keys(item).forEach(key => {
        if (INFO_FIELDS.indexOf(key) < 0 && scriptFields.indexOf(key) < 0 && secretFields.indexOf(key) < 0 && !key.startsWith('_')) {
            values[key] = toPlainJson(item[key])
        }
    })
    return values
}

const sanitizeSegment = s => String(s).trim().replace(/[^A-Za-z0-9._\-äöüÄÖÜ]/g, '_').replace(/^\.+/, '_')

const folderForItem = (item, definition) => {
    for (const field of definition.folderFields) {
        const value = item[field]
        if (value && typeof value === 'string' && value.trim()) {
            const segments = value.split('/').map(sanitizeSegment).filter(s => s && s !== '.' && s !== '..')
            if (segments.length) {
                return segments.join('/')
            }
        }
    }
    return item._id.toString()
}

const assertInside = (root, target) => {
    if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`path "${target}" is outside of "${root}"`)
    }
}

/**
 * @returns [{path, content, _id}] - one meta.json and the script files per item
 */
export const typeItemsToFiles = (type, items) => {
    const definition = TYPE_SCRIPT_DEFINITIONS[type]
    if (!definition) {
        throw new Error(`no script definition for type ${type}`)
    }
    const scriptFields = definition.scripts.map(s => s.field)
    const secretFields = definition.secretFields || []
    const usedFolders = {}
    const files = []

    items.forEach(item => {
        let folder = folderForItem(item, definition)
        if (usedFolders[folder]) {
            // same name twice: the id keeps the folder stable between exports
            folder = folder + '_' + item._id.toString()
        }
        usedFolders[folder] = true

        const meta = {_id: item._id.toString()}
        Object.keys(item).forEach(key => {
            if (key === '_id' || scriptFields.indexOf(key) >= 0) {
                return
            }
            meta[key] = secretFields.indexOf(key) >= 0 ? (item[key] ? SECRET_PLACEHOLDER : item[key]) : toPlainJson(item[key])
        })
        files.push({path: folder + '/' + META_FILE, content: JSON.stringify(meta, null, 2) + '\n', _id: meta._id})

        definition.scripts.forEach(({field, file}) => {
            files.push({path: folder + '/' + file(item), content: item[field] || ''})
        })
    })
    if (items.length > 0) {
        files.push({path: 'README.md', content: README(type)})
    }
    return files
}

const findManagedFolders = (root, dir, result) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue
        }
        const abs = path.join(dir, entry.name)
        const metaFile = path.join(abs, META_FILE)
        if (fs.existsSync(metaFile)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
                if (meta && meta._id) {
                    result.push({abs, _id: meta._id})
                }
            } catch (e) {
            }
        }
        findManagedFolders(root, abs, result)
    }
    return result
}

/**
 * writes all entries of a type into dir
 * @param removeStale removes folders of entries that no longer exist. Only folders with a
 *        meta.json written by this export are touched, the known files are deleted and the
 *        folder itself only if it is empty afterwards
 */
/**
 * values of an exported folder as they are in the files
 * @returns {_id, fileValues, errors}
 */
const readLocalEntry = (folder, definition) => {
    const scriptFields = definition.scripts.map(s => s.field)
    const secretFields = definition.secretFields || []
    const meta = JSON.parse(fs.readFileSync(path.join(folder, META_FILE), 'utf8'))
    const fileValues = {}, errors = []
    Object.keys(meta).forEach(key => {
        if (INFO_FIELDS.indexOf(key) >= 0 || secretFields.indexOf(key) >= 0 || scriptFields.indexOf(key) >= 0) {
            return
        }
        if (key.startsWith('_') || key.startsWith('$') || key.indexOf('.') >= 0) {
            errors.push(`attribute "${key}" is not allowed, ignored`)
            return
        }
        fileValues[key] = meta[key]
    })
    definition.scripts.forEach(({field, file}) => {
        // the file name depends on the values in meta.json (e.g. scriptLanguage)
        const scriptFile = path.join(folder, file(fromPlainJson(fileValues)))
        if (fs.existsSync(scriptFile)) {
            fileValues[field] = fs.readFileSync(scriptFile, 'utf8')
        }
    })
    return {_id: meta._id, fileValues, errors}
}

/**
 * true if a file of the entry was changed since the last export / import
 */
const isLocallyModified = (fileValues, base, scriptFields) => Object.keys(fileValues).some(field => {
    const isCode = scriptFields.indexOf(field) >= 0
    return hashValue(fileValues[field], isCode) !== (base[field] !== undefined ? base[field] : hashValue(null, isCode))
})

/**
 * writes all entries of a type into dir.
 * Entries whose files were changed since the last export and not imported yet are not
 * overwritten (reported as keptLocal), unless force is set.
 */
export const exportTypeScriptsToDirectory = async ({db, context, type, dir, filter = {}, removeStale = false, force = false}) => {
    if (!dir) {
        throw new Error('dir is missing')
    }
    const root = path.resolve(path.isAbsolute(dir) ? dir : path.join(path.resolve(), dir))

    let match = {...filter}
    if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
        match = {$and: [match, await createMatchForCurrentUser({typeName: type, db, context})]}
    }
    const items = await db.collection(type).find(match).sort({_id: 1}).toArray()

    const definition = TYPE_SCRIPT_DEFINITIONS[type]
    if (!definition) {
        throw new Error(`no script definition for type ${type}`)
    }
    const scriptFields = definition.scripts.map(s => s.field)
    const state = readExportState(root)

    // do not overwrite local changes that were not imported yet
    const keptLocal = []
    if (!force && fs.existsSync(root)) {
        for (const folder of readEntryFolders(root, [])) {
            try {
                const {_id, fileValues} = readLocalEntry(folder, definition)
                const itemState = _id && state.items[_id]
                if (itemState && isLocallyModified(fileValues, itemState.fields, scriptFields)) {
                    keptLocal.push(_id)
                }
            } catch (e) {
            }
        }
    }
    const itemsToWrite = items.filter(item => keptLocal.indexOf(item._id.toString()) < 0)
    const files = typeItemsToFiles(type, itemsToWrite)

    let removed = 0
    if (removeStale && fs.existsSync(root)) {
        const ids = new Set(items.map(i => i._id.toString()))
        findManagedFolders(root, root, []).forEach(({abs, _id}) => {
            if (!ids.has(_id)) {
                for (const name of fs.readdirSync(abs)) {
                    if (name === META_FILE || /^script\.(js|py)$/.test(name)) {
                        fs.unlinkSync(path.join(abs, name))
                    }
                }
                if (fs.readdirSync(abs).length === 0) {
                    fs.rmdirSync(abs)
                }
                removed++
            }
        })
    }

    // script.js <-> script.py may change with the script language
    const folders = new Set(files.filter(f => f.path.endsWith('/' + META_FILE)).map(f => path.dirname(f.path)))
    folders.forEach(folder => {
        const absFolder = path.join(root, folder)
        assertInside(root, absFolder)
        ;['script.js', 'script.py'].forEach(name => {
            const absFile = path.join(absFolder, name)
            if (fs.existsSync(absFile)) {
                fs.unlinkSync(absFile)
            }
        })
    })

    files.forEach(file => {
        const absFile = path.join(root, file.path)
        assertInside(root, absFile)
        fs.mkdirSync(path.dirname(absFile), {recursive: true})
        fs.writeFileSync(absFile, file.content, 'utf8')
    })

    // baseline for importChangedTypeScriptsFromDirectory
    state.type = type
    itemsToWrite.forEach(item => {
        state.items[item._id.toString()] = {fields: hashFields(comparableValues(type, item), scriptFields)}
    })
    writeExportState(root, state)

    return {type, dir: root, items: itemsToWrite.length, files: files.length, removed, keptLocal: keptLocal.length}
}


const readEntryFolders = (dir, result) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue
        }
        const abs = path.join(dir, entry.name)
        if (fs.existsSync(path.join(abs, META_FILE))) {
            result.push(abs)
        }
        readEntryFolders(abs, result)
    }
    return result
}

/**
 * imports only what was changed in the files since the last export (three way compare,
 * see exportState.mjs). Entries without baseline and entries that were deleted in the admin
 * are skipped, new entries are never created.
 */
export const importChangedTypeScriptsFromDirectory = async ({db, context, type, dir, dryRun = false}) => {
    const definition = TYPE_SCRIPT_DEFINITIONS[type]
    if (!definition) {
        throw new Error(`no script definition for type ${type}`)
    }
    const root = path.resolve(path.isAbsolute(dir) ? dir : path.join(path.resolve(), dir))
    const result = {type, updated: 0, unchanged: 0, conflicts: 0, skipped: 0, details: [], errors: []}
    if (!fs.existsSync(root)) {
        result.errors.push(`${root} does not exist`)
        return result
    }
    const scriptFields = definition.scripts.map(s => s.field)
    const secretFields = definition.secretFields || []
    const state = readExportState(root)

    for (const folder of readEntryFolders(root, [])) {
        const label = path.relative(root, folder)
        try {
            const local = readLocalEntry(folder, definition)
            const meta = {_id: local._id}
            local.errors.forEach(e => result.errors.push(`${label}: ${e}`))
            if (!meta._id || !ObjectId.isValid(meta._id)) {
                result.skipped++
                result.details.push(label + ': _id missing in meta.json, skipped')
                continue
            }
            const itemState = state.items[meta._id]
            if (!itemState) {
                result.skipped++
                result.details.push(label + ': no export baseline, skipped (run the export first)')
                continue
            }
            const doc = await db.collection(type).findOne({_id: new ObjectId(meta._id)})
            if (!doc) {
                result.skipped++
                result.details.push(label + ': deleted in the admin, skipped')
                continue
            }
            const fileValues = local.fileValues

            const diff = threeWayDiff({
                fileValues,
                dbValues: comparableValues(type, doc),
                base: itemState.fields,
                codeFields: scriptFields
            })
            const changedFields = Object.keys(diff.changed)
            if (diff.conflicts.length) {
                result.conflicts++
                result.details.push(label + ': conflict, changed in file and admin: ' + diff.conflicts.join(', '))
            }
            if (changedFields.length === 0) {
                if (!diff.conflicts.length) {
                    result.unchanged++
                }
            } else {
                if (!dryRun) {
                    const data = {}
                    changedFields.forEach(field => {
                        data[field] = scriptFields.indexOf(field) >= 0 ? diff.changed[field] : fromPlainJson(diff.changed[field])
                    })
                    // triggers typeUpdated_<type>, so cronjobs, hooks and apis are reloaded
                    await GenericResolver.updateEntity(db, context, type, {_id: meta._id, ...data})
                }
                result.updated++
                result.details.push(label + ': ' + changedFields.join(', '))
            }
            if (!dryRun) {
                state.items[meta._id] = {fields: diff.base}
            }
        } catch (e) {
            result.errors.push(`${label}: ${e.message}`)
        }
    }
    if (!dryRun) {
        state.type = type
        writeExportState(root, state)
    }
    return result
}
