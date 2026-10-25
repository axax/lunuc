/**
 * zip (Buffer) <-> [{path, content}] for the export / import as files (typeFiles.mjs, CmsPages).
 * Nothing is written to disk; the entries are checked anyway to keep imports predictable.
 */
import AdmZip from 'adm-zip'
import path from 'path'

export const MAX_ZIP_ENTRIES = 50000
export const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024

export const filesToZip = (files, {rootFolder} = {}) => {
    const zip = new AdmZip()
    files.forEach(file => {
        zip.addFile((rootFolder ? rootFolder + '/' : '') + file.path, Buffer.from(file.content, 'utf8'))
    })
    return zip.toBuffer()
}

/**
 * zip (Buffer) -> [{path, content}], hidden files and macOS metadata are left out.
 * filter(path): optional, only matching entries are read (and count for the size limit)
 */
export const zipToFiles = (buffer, {filter} = {}) => {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()
    // hard upper bound on the raw entry count (protects against zip bombs with millions of entries)
    if (entries.length > MAX_ZIP_ENTRIES * 4) {
        throw new Error(`zip contains too many entries (${entries.length})`)
    }
    let totalSize = 0
    const files = []
    for (const entry of entries) {
        if (entry.isDirectory) continue
        const name = entry.entryName.replace(/\\/g, '/')
        if (name.startsWith('__MACOSX/') || name.split('/').some(s => s.startsWith('.'))) continue
        if (name.split('/').some(s => s === '..') || path.isAbsolute(name)) {
            throw new Error(`invalid path in zip: "${name}"`)
        }
        if (filter && !filter(name)) continue
        if (files.length >= MAX_ZIP_ENTRIES) {
            throw new Error(`zip contains too many files (more than ${MAX_ZIP_ENTRIES})`)
        }
        totalSize += entry.header.size
        if (totalSize > MAX_UNCOMPRESSED_SIZE) {
            throw new Error('zip is too large')
        }
        files.push({path: name, content: entry.getData().toString('utf8')})
    }
    return files
}
