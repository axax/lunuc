/**
 * Server side export / import of CmsPages as files.
 *
 * Used by the graphql resolver (zip download / upload) and can be used directly in a
 * cronjob to write the pages into a directory on the server:
 *
 *   const {exportCmsPagesToDirectory} = require('@ext/cms/util/cmsPageFilesServer.mjs')
 *   const result = await exportCmsPagesToDirectory({
 *       db: this.db, context: this.context,
 *       dir: '/var/lunuc/cmsexport',          // absolute or relative to the project root
 *       slugs: ['home', 'core/wysiwyg']       // optional: ids, slugs or filter (mongo match)
 *   })
 *   this.log(JSON.stringify(result))
 *
 * importCmsPagesFromDirectory works the same way in the other direction.
 */
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import {ObjectId} from 'mongodb'
import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Util from '../../../api/util/index.mjs'
import Cache from '../../../util/cache.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {createMatchForCurrentUser} from '../../../api/util/dbquery.mjs'
import {getCmsPageCacheKey} from './cmsPage.mjs'
import {toPlainJson, fromPlainJson} from '../../../api/util/plainJson.mjs'
import {
    cmsPagesToFiles,
    filesToCmsPages,
    slugToFolder,
    CMS_PAGE_CODE_FILES,
    CMS_PAGE_META_FILE,
    CMS_PAGE_ATTRIBUTES_FILE,
    CMS_PAGE_RUNTIME_FIELDS,
    CMS_PAGE_INFO_FIELDS
} from './cmsPageFiles.mjs'

const MAX_ZIP_ENTRIES = 5000
const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024
const KNOWN_FILES = [CMS_PAGE_META_FILE, CMS_PAGE_ATTRIBUTES_FILE, ...CMS_PAGE_CODE_FILES.map(f => f.file)]
const CODE_FIELDS = CMS_PAGE_CODE_FILES.map(f => f.field)
// never written by an import
const NOT_IMPORTED_FIELDS = [...CMS_PAGE_INFO_FIELDS, ...CMS_PAGE_RUNTIME_FIELDS]


const docToExportPage = (doc) => {
    const page = {}
    Object.keys(doc).forEach(key => {
        if (key === '_id') {
            page._id = doc._id.toString()
        } else if (CODE_FIELDS.indexOf(key) >= 0) {
            page[key] = doc[key]
        } else {
            page[key] = toPlainJson(doc[key])
        }
    })
    return page
}


const resolveCollectionName = async (db, context, _version) => {
    if (!_version) {
        const values = await Util.keyValueGlobalMap(db, context, ['TypesSelectedVersions'])
        if (values && values['TypesSelectedVersions']) {
            _version = values['TypesSelectedVersions']['CmsPage']
        }
    }
    return 'CmsPage' + (_version && _version !== 'default' ? '_' + _version : '')
}

const resolveDir = (dir) => {
    if (!dir) {
        throw new Error('dir is missing')
    }
    return path.resolve(path.isAbsolute(dir) ? dir : path.join(path.resolve(), dir))
}

const assertInside = (root, target) => {
    if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`path "${target}" is outside of "${root}"`)
    }
}


/**
 * loads the pages including all fields that are needed for the export.
 * Users without CAPABILITY_MANAGE_OTHER_USERS only get pages they have access to.
 */
export const getCmsPagesForExport = async ({db, context, ids, slugs, filter, _version}) => {
    const collectionName = await resolveCollectionName(db, context, _version)

    let match = {}
    if (ids && ids.length) {
        match._id = {$in: ids.map(id => new ObjectId(id))}
    } else if (slugs && slugs.length) {
        match.slug = {$in: slugs}
    } else if (filter) {
        match = {...filter}
    }

    if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
        const accessMatch = await createMatchForCurrentUser({typeName: 'CmsPage', db, context})
        match = {$and: [match, accessMatch]}
    }

    // everything except values that are computed at runtime
    const projection = {}
    CMS_PAGE_RUNTIME_FIELDS.forEach(f => projection[f] = 0)

    const docs = await db.collection(collectionName).find(match, {projection}).sort({slug: 1}).toArray()
    return docs.map(docToExportPage)
}


/**
 * @returns Buffer with a zip containing one folder per page
 */
export const createCmsPagesZip = (pages, {rootFolder} = {}) => {
    const zip = new AdmZip()
    cmsPagesToFiles(pages).forEach(file => {
        zip.addFile((rootFolder ? rootFolder + '/' : '') + file.path, Buffer.from(file.content, 'utf8'))
    })
    return zip.toBuffer()
}

/**
 * reads a zip (Buffer) into [{path, content}]. Nothing is written to disk, but the
 * entries are still checked to keep the import predictable
 */
export const readCmsPagesZip = (buffer) => {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()
    if (entries.length > MAX_ZIP_ENTRIES) {
        throw new Error(`zip contains too many entries (${entries.length})`)
    }
    let totalSize = 0
    const files = []
    for (const entry of entries) {
        if (entry.isDirectory) {
            continue
        }
        const name = entry.entryName.replace(/\\/g, '/')
        // macOS metadata and hidden files
        if (name.startsWith('__MACOSX/') || name.split('/').some(s => s.startsWith('.'))) {
            continue
        }
        if (name.split('/').some(s => s === '..') || path.isAbsolute(name)) {
            throw new Error(`invalid path in zip: "${name}"`)
        }
        const baseName = name.substring(name.lastIndexOf('/') + 1)
        if (KNOWN_FILES.indexOf(baseName) < 0) {
            continue
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
 * creates or updates the pages (matched by slug)
 * @param pages result of filesToCmsPages
 * @returns {created, updated, unchanged, skipped, slugs, errors}
 */
export const importCmsPages = async ({db, context, pages, _version, createMissing = true, dryRun = false}) => {
    const collectionName = await resolveCollectionName(db, context, _version)
    const result = {created: 0, updated: 0, unchanged: 0, skipped: 0, slugs: [], errors: []}

    for (const page of pages) {
        const {slug} = page
        try {
            const data = {}
            Object.keys(page).forEach(field => {
                if (page[field] === undefined || field.startsWith('_') || field.startsWith('$') ||
                    field.indexOf('.') >= 0 || NOT_IMPORTED_FIELDS.indexOf(field) >= 0) {
                    return
                }
                data[field] = CODE_FIELDS.indexOf(field) >= 0 ? page[field] : fromPlainJson(page[field])
            })
            data.slug = slug

            const existing = await db.collection(collectionName).findOne({slug})

            if (existing) {
                const changed = {}
                Object.keys(data).forEach(field => {
                    if (JSON.stringify(toPlainJson(existing[field]) ?? null) !== JSON.stringify(toPlainJson(data[field]) ?? null)) {
                        changed[field] = data[field]
                    }
                })
                if (Object.keys(changed).length === 0) {
                    result.unchanged++
                    continue
                }
                if (!dryRun) {
                    // updateEntity checks the access rights of the user
                    await GenericResolver.updateEntity(db, context, 'CmsPage', {
                        _id: existing._id.toString(),
                        _version,
                        ...changed
                    })
                }
                result.updated++
                result.slugs.push(slug + ' (' + Object.keys(changed).join(', ') + ')')
            } else if (createMissing) {
                if (!dryRun) {
                    await GenericResolver.createEntity(db, {context: {lang: 'de', ...context}}, 'CmsPage', {
                        _version,
                        ...data
                    })
                }
                result.created++
                result.slugs.push(slug + ' (new)')
            } else {
                result.skipped++
            }

            if (!dryRun) {
                Cache.clearStartWith(getCmsPageCacheKey({_version, slug}))
            }
        } catch (e) {
            result.errors.push(`${slug}: ${e.message}`)
        }
    }
    return result
}


/**
 * writes the pages into dir (one folder per page). Known files of a page folder that
 * are no longer part of the page (e.g. an emptied manual.md) are removed, other files
 * in the directory are never touched.
 */
export const exportCmsPagesToDirectory = async ({db, context, dir, ids, slugs, filter, _version}) => {
    const root = resolveDir(dir)
    const pages = await getCmsPagesForExport({db, context, ids, slugs, filter, _version})
    const files = cmsPagesToFiles(pages)

    // clean up known files in the page folders first
    const folders = new Set(files.filter(f => f.path.endsWith('/' + CMS_PAGE_META_FILE))
        .map(f => f.path.substring(0, f.path.length - CMS_PAGE_META_FILE.length - 1)))
    folders.forEach(folder => {
        const absFolder = path.join(root, folder)
        assertInside(root, absFolder)
        KNOWN_FILES.forEach(file => {
            const absFile = path.join(absFolder, file)
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

    return {dir: root, pages: pages.length, files: files.length, slugs: pages.map(p => p.slug)}
}


const readDirRecursive = (root, dir, files) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.name.startsWith('.')) {
            continue
        }
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            readDirRecursive(root, abs, files)
        } else if (entry.isFile() && KNOWN_FILES.indexOf(entry.name) >= 0) {
            files.push({path: path.relative(root, abs).split(path.sep).join('/'), content: fs.readFileSync(abs, 'utf8')})
        }
    }
    return files
}

/**
 * reads a directory created by exportCmsPagesToDirectory and imports it
 */
export const importCmsPagesFromDirectory = async ({db, context, dir, _version, createMissing = true, dryRun = false}) => {
    const root = resolveDir(dir)
    const {pages, errors} = filesToCmsPages(readDirRecursive(root, root, []))
    const result = await importCmsPages({db, context, pages, _version, createMissing, dryRun})
    result.errors.unshift(...errors)
    return result
}

export {slugToFolder, toPlainJson, fromPlainJson}
