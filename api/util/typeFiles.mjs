/**
 * Export / import of type entries as files in a zip, generic for all types that register a handler
 * (admin: "Export as files (ZIP)" for the selected entries, "Import files (ZIP)" in the actions of the list).
 *
 * Registered by default: the types with scripts of typeScriptFiles.mjs (CronJob, Hook, Api).
 * Other types (also from extensions) can be added:
 *
 *   import {registerTypeFiles} from 'api/util/typeFiles.mjs'
 *   registerTypeFiles('MyType', {
 *       capability: 'manage_types',
 *       folder: 'mytypes',    // folder in the zip of "export / import all", default: the type name in lower case
 *       perType: true,        // false: not offered as "Export as files" in the list of the type
 *       aiGuideFiles: () => [{path: 'AGENTS.md', content: '...'}],  // optional: guide for LLMs, added to the root of "export all" if requested
 *       // ids: selected entries, all: every entry the user has access to (export of everything)
 *       exportFiles: async ({db, context, ids, all}) => [{path: 'a/meta.json', content: '...'}],
 *       importFiles: async ({db, context, files, dryRun, createMissing}) => ({created, updated, unchanged, skipped, names, errors})
 *   })
 *
 * "Export / import all" (/admin/system, capability export_import_data) uses the same handlers: it
 * exports every type the user has the handler capability for, limited to the entries the user has
 * access to, one folder per type. The import writes through the access rights of the user, too.
 */
import Util from './index.mjs'
import {CAPABILITY_RUN_SCRIPT, CAPABILITY_EXPORT_IMPORT_DATA} from '../../util/capabilities.mjs'
import {filesToZip, zipToFiles} from './zipFiles.mjs'
import {TYPE_SCRIPT_DEFINITIONS, typeItemsToFiles, getTypeScriptItems, importTypeScriptFiles} from './typeScriptFiles.mjs'

const handlers = {}

export const registerTypeFiles = (type, handler) => {
    handlers[type] = handler
}

export const getTypeFilesTypes = () => Object.keys(handlers).filter(type => handlers[type].perType !== false)

// types with scripts: the export contains code that runs on the server
Object.keys(TYPE_SCRIPT_DEFINITIONS).forEach(type => {
    registerTypeFiles(type, {
        // structure of a GenericDataDefinition is no server script: reading is limited by the entries the
        // user may see, creating needs admin_options and updating the ownership (checked by the resolver)
        capability: type === 'GenericDataDefinition' ? undefined : CAPABILITY_RUN_SCRIPT,
        // same folder names as the cronjob "System: export all dbscripts" writes into ./dbscripts
        folder: type.toLowerCase() + 's',
        exportFiles: async ({db, context, ids, all}) => typeItemsToFiles(type, await getTypeScriptItems({db, context, type, ids, all})),
        importFiles: ({db, context, files, dryRun, createMissing}) => importTypeScriptFiles({db, context, type, files, dryRun, createMissing})
    })
})

const handlerFor = async (db, context, type) => {
    const handler = handlers[type]
    if (!handler) {
        throw new Error(`export as files is not available for ${type}`)
    }
    if (handler.capability) {
        await Util.checkIfUserHasCapability(db, context, handler.capability)
    }
    return handler
}

/**
 * @returns {name, count, data (base64 zip)}
 */
export const exportTypeFiles = async ({db, context, type, ids}) => {
    const handler = await handlerFor(db, context, type)
    if (!ids || ids.length === 0) {
        throw new Error('ids are required')
    }
    const files = await handler.exportFiles({db, context, ids})
    // one meta.json per entry (handlers of other formats count the ids)
    const count = files.filter(f => /(^|\/)meta\.json$/.test(f.path)).length || ids.length
    if (!files.length) {
        throw new Error('nothing to export')
    }
    const date = new Date().toISOString().substring(0, 10)
    return {
        name: `${type.toLowerCase()}-${count}-${date}.zip`,
        count,
        data: filesToZip(files).toString('base64')
    }
}

export const importTypeFiles = async ({db, context, type, data, dryRun = false, createMissing = true}) => {
    const handler = await handlerFor(db, context, type)
    const files = zipToFiles(Buffer.from(data, 'base64'))
    return handler.importFiles({db, context, files, dryRun: !!dryRun, createMissing: createMissing !== false})
}


// ─── export / import of everything the user has access to ────────────────────────────────────

const folderOf = (type) => handlers[type].folder || type.toLowerCase()

const ALL_README = `# Export

One folder per type, one sub folder per entry (same layout as ./dbscripts).
Only entries the exporting user has access to are included. On import every entry is written
with the access rights of the importing user, entries without permission are reported as errors.
`

const userMayUse = async (db, context, handler) => !handler.capability || await Util.userHasCapability(db, context, handler.capability)

/**
 * the types the user can export / import with "all": needs export_import_data and the
 * capability of the type handler (e.g. run_script for code that runs on the server)
 * @returns [{type, folder}]
 */
export const getExportAllSources = async ({db, context}) => {
    Util.checkIfUserIsLoggedIn(context)
    await Util.checkIfUserHasCapability(db, context, CAPABILITY_EXPORT_IMPORT_DATA)
    const sources = []
    for (const type of Object.keys(handlers)) {
        if (await userMayUse(db, context, handlers[type])) {
            sources.push({type, folder: folderOf(type)})
        }
    }
    return sources
}

const ENTRY_META_RE = /(^|\/)(meta|page)\.json$/

/**
 * zip with everything the user is allowed to see (only the entries the user has access to)
 * @returns {name, count, data (base64 zip)}
 */
export const exportAllTypeFiles = async ({db, context, aiGuide = false}) => {
    const sources = await getExportAllSources({db, context})
    const files = []
    let count = 0
    for (const {type, folder} of sources) {
        const typeFiles = await handlers[type].exportFiles({db, context, all: true})
        count += typeFiles.filter(f => ENTRY_META_RE.test(f.path)).length
        typeFiles.forEach(f => files.push({path: folder + '/' + f.path, content: f.content}))
    }
    if (!files.length) {
        throw new Error('nothing to export')
    }
    files.push({path: 'README.md', content: ALL_README})
    if (aiGuide) {
        // markdown files for LLMs (AGENTS.md, CLAUDE.md, reference docs), ignored by the import
        const used = new Set(files.map(f => f.path))
        for (const {type} of sources) {
            if (handlers[type].aiGuideFiles) {
                handlers[type].aiGuideFiles().forEach(f => {
                    if (!used.has(f.path)) {
                        used.add(f.path)
                        files.push(f)
                    }
                })
            }
        }
    }
    const date = new Date().toISOString().substring(0, 10)
    return {
        name: `export-${count}-${date}.zip`,
        count,
        data: filesToZip(files).toString('base64')
    }
}

/**
 * imports a zip of exportAllTypeFiles. Folders of types the user has no permission for are
 * rejected (not imported), the rest is imported with the access rights of the user.
 * @returns {created, updated, unchanged, skipped, names, errors}
 */
export const importAllTypeFiles = async ({db, context, data, dryRun = false, createMissing = true}) => {
    const sources = await getExportAllSources({db, context})
    const allowed = {}
    sources.forEach(s => allowed[s.folder] = s.type)
    const knownFolders = {}
    Object.keys(handlers).forEach(type => knownFolders[folderOf(type)] = type)

    let files = zipToFiles(Buffer.from(data, 'base64'))
    // zip of the whole folder: remove the common root folder (e.g. "dbscripts/")
    const roots = new Set(files.map(f => f.path.split('/')[0]))
    if (roots.size === 1 && !knownFolders[[...roots][0]] && files.every(f => f.path.indexOf('/') > 0)) {
        files = files.map(f => ({...f, path: f.path.substring(f.path.indexOf('/') + 1)}))
    }

    const result = {created: 0, updated: 0, unchanged: 0, skipped: 0, names: [], errors: []}
    const byFolder = {}
    files.forEach(f => {
        const i = f.path.indexOf('/')
        if (i < 0) return // README.md
        const folder = f.path.substring(0, i)
        ;(byFolder[folder] = byFolder[folder] || []).push({...f, path: f.path.substring(i + 1)})
    })

    const folders = Object.keys(byFolder)
    if (!folders.length) {
        result.errors.push('no folders found in zip')
    }
    for (const folder of folders) {
        if (folder.startsWith('_')) {
            // e.g. _lunuc/ reference docs of the AI guide
            continue
        }
        if (!knownFolders[folder]) {
            result.errors.push(`${folder}: unknown folder, ignored`)
            continue
        }
        if (!allowed[folder]) {
            result.errors.push(`${folder}: no permission to import ${knownFolders[folder]}`)
            result.skipped++
            continue
        }
        try {
            const r = await handlers[allowed[folder]].importFiles({
                db, context, files: byFolder[folder], dryRun: !!dryRun, createMissing: createMissing !== false
            })
            ;['created', 'updated', 'unchanged', 'skipped'].forEach(k => result[k] += r[k] || 0)
            ;(r.names || []).forEach(n => result.names.push(`${folder}/${n}`))
            ;(r.errors || []).forEach(e => result.errors.push(`${folder}/${e}`))
        } catch (e) {
            result.errors.push(`${folder}: ${e.message}`)
        }
    }
    return result
}
