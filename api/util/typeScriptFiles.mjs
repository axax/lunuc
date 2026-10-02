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
import Util from './index.mjs'
import {createMatchForCurrentUser} from './dbquery.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../util/capabilities.mjs'
import {toPlainJson} from './plainJson.mjs'

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
            meta[key] = secretFields.indexOf(key) >= 0 ? (item[key] ? '*** not exported ***' : item[key]) : toPlainJson(item[key])
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
export const exportTypeScriptsToDirectory = async ({db, context, type, dir, filter = {}, removeStale = false}) => {
    if (!dir) {
        throw new Error('dir is missing')
    }
    const root = path.resolve(path.isAbsolute(dir) ? dir : path.join(path.resolve(), dir))

    let match = {...filter}
    if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
        match = {$and: [match, await createMatchForCurrentUser({typeName: type, db, context})]}
    }
    const items = await db.collection(type).find(match).sort({_id: 1}).toArray()
    const files = typeItemsToFiles(type, items)

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

    return {type, dir: root, items: items.length, files: files.length, removed}
}
