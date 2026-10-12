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
 *       exportFiles: async ({db, context, ids}) => [{path: 'a/meta.json', content: '...'}],
 *       importFiles: async ({db, context, files, dryRun, createMissing}) => ({created, updated, unchanged, skipped, names, errors})
 *   })
 */
import AdmZip from 'adm-zip'
import path from 'path'
import Util from './index.mjs'
import {CAPABILITY_RUN_SCRIPT} from '../../util/capabilities.mjs'
import {TYPE_SCRIPT_DEFINITIONS, typeItemsToFiles, getTypeScriptItems, importTypeScriptFiles} from './typeScriptFiles.mjs'

const MAX_ZIP_ENTRIES = 5000
const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024

const handlers = {}

export const registerTypeFiles = (type, handler) => {
    handlers[type] = handler
}

export const getTypeFilesTypes = () => Object.keys(handlers)

// types with scripts: the export contains code that runs on the server
Object.keys(TYPE_SCRIPT_DEFINITIONS).forEach(type => {
    registerTypeFiles(type, {
        capability: CAPABILITY_RUN_SCRIPT,
        exportFiles: async ({db, context, ids}) => typeItemsToFiles(type, await getTypeScriptItems({db, context, type, ids})),
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

export const filesToZip = (files, {rootFolder} = {}) => {
    const zip = new AdmZip()
    files.forEach(file => {
        zip.addFile((rootFolder ? rootFolder + '/' : '') + file.path, Buffer.from(file.content, 'utf8'))
    })
    return zip.toBuffer()
}

/**
 * zip (Buffer) -> [{path, content}], hidden files and macOS metadata are left out,
 * a common root folder (e.g. when the folder was zipped again) is removed
 */
export const zipToFiles = (buffer) => {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()
    if (entries.length > MAX_ZIP_ENTRIES) {
        throw new Error(`zip contains too many entries (${entries.length})`)
    }
    let totalSize = 0
    let files = []
    for (const entry of entries) {
        if (entry.isDirectory) continue
        const name = entry.entryName.replace(/\\/g, '/')
        if (name.startsWith('__MACOSX/') || name.split('/').some(s => s.startsWith('.'))) continue
        if (name.split('/').some(s => s === '..') || path.isAbsolute(name)) {
            throw new Error(`invalid path in zip: "${name}"`)
        }
        totalSize += entry.header.size
        if (totalSize > MAX_UNCOMPRESSED_SIZE) {
            throw new Error('zip is too large')
        }
        files.push({path: name, content: entry.getData().toString('utf8')})
    }
    return files
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
