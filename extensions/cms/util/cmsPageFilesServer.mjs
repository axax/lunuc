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
import {readExportState, writeExportState, hashFields, hashValue, threeWayDiff} from '../../../api/util/exportState.mjs'
import {
    cmsPagesToFiles,
    filesToCmsPages,
    slugToFolder,
    CMS_PAGE_CODE_FILES,
    CMS_PAGE_META_FILE,
    CMS_PAGE_ATTRIBUTES_FILE,
    CMS_PAGE_RUNTIME_FIELDS,
    CMS_PAGE_INFO_FIELDS,
    CMS_PAGE_META_FIELDS
} from './cmsPageFiles.mjs'

const MAX_ZIP_ENTRIES = 5000
const MAX_UNCOMPRESSED_SIZE = 100 * 1024 * 1024
const KNOWN_FILES = [CMS_PAGE_META_FILE, CMS_PAGE_ATTRIBUTES_FILE, ...CMS_PAGE_CODE_FILES.map(f => f.file)]
const CODE_FIELDS = CMS_PAGE_CODE_FILES.map(f => f.field)
// never written by an import
const NOT_IMPORTED_FIELDS = [...CMS_PAGE_INFO_FIELDS, ...CMS_PAGE_RUNTIME_FIELDS]


/**
 * all fields of an export page that are compared on import, in the representation of the
 * files: standard attributes are null if not set, code fields '' if not set
 */
const comparableFields = (page) => {
    const values = {}
    CMS_PAGE_META_FIELDS.forEach(field => values[field] = null)
    CODE_FIELDS.forEach(field => values[field] = '')
    Object.keys(page).forEach(field => {
        if (!field.startsWith('_') && NOT_IMPORTED_FIELDS.indexOf(field) < 0 && page[field] !== undefined) {
            values[field] = page[field]
        }
    })
    return values
}

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
export const exportCmsPagesToDirectory = async ({db, context, dir, ids, slugs, filter, _version, force = false}) => {
    const root = resolveDir(dir)
    const allPages = await getCmsPagesForExport({db, context, ids, slugs, filter, _version})
    const state = readExportState(root)

    // pages whose files were changed since the last export and not imported yet are not
    // overwritten (unless force), otherwise the export would destroy these changes
    const keptLocal = []
    if (!force && fs.existsSync(root)) {
        const {pages: localPages} = filesToCmsPages(readDirRecursive(root, root, []))
        localPages.forEach(localPage => {
            const itemState = localPage._id && state.items[localPage._id]
            if (!itemState) {
                return
            }
            const modified = Object.keys(localPage).some(field => {
                if (field.startsWith('_') || NOT_IMPORTED_FIELDS.indexOf(field) >= 0) {
                    return false
                }
                const isCode = CODE_FIELDS.indexOf(field) >= 0
                const base = itemState.fields[field] !== undefined ? itemState.fields[field] : hashValue(null, isCode)
                return hashValue(localPage[field], isCode) !== base
            })
            if (modified) {
                keptLocal.push(localPage._id)
            }
        })
    }
    const pages = allPages.filter(page => keptLocal.indexOf(page._id) < 0)
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

    // baseline for importChangedCmsPagesFromDirectory
    state.type = 'CmsPage'
    pages.forEach(page => {
        state.items[page._id] = {slug: page.slug, fields: hashFields(comparableFields(page), CODE_FIELDS)}
    })
    writeExportState(root, state)

    return {dir: root, pages: pages.length, files: files.length, keptLocal: keptLocal.length, slugs: pages.map(p => p.slug)}
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


/**
 * imports only what was changed in the files since the last export (three way compare
 * against .export-state.json, see api/util/exportState.mjs). Changes made in the admin
 * after the export are never overwritten - such fields are reported as conflicts.
 *
 * - page with baseline, changed in file only  -> the changed fields are updated
 * - page in the db without baseline           -> skipped (run an export first)
 * - page with baseline that no longer exists  -> skipped (deleted in the admin)
 * - new folder (no _id, slug unknown)         -> created if createMissing, _id is written to page.json
 */
export const importChangedCmsPagesFromDirectory = async ({db, context, dir, _version, createMissing = true, dryRun = false}) => {
    const root = resolveDir(dir)
    const collectionName = await resolveCollectionName(db, context, _version)
    const state = readExportState(root)
    const {pages, errors} = filesToCmsPages(readDirRecursive(root, root, []))

    const result = {created: 0, updated: 0, unchanged: 0, conflicts: 0, skipped: 0, slugs: [], errors: [...errors]}
    const projection = {}
    CMS_PAGE_RUNTIME_FIELDS.forEach(f => projection[f] = 0)

    for (const page of pages) {
        const label = page.slug + ' [' + page._path + ']'
        try {
            const fileValues = {}
            Object.keys(page).forEach(field => {
                if (!field.startsWith('_') && NOT_IMPORTED_FIELDS.indexOf(field) < 0) {
                    fileValues[field] = page[field]
                }
            })

            let doc = null
            if (page._id && ObjectId.isValid(page._id)) {
                doc = await db.collection(collectionName).findOne({_id: new ObjectId(page._id)}, {projection})
                if (!doc && state.items[page._id]) {
                    result.skipped++
                    result.slugs.push(label + ': deleted in the admin, skipped')
                    continue
                }
            }
            if (!doc) {
                doc = await db.collection(collectionName).findOne({slug: page.slug}, {projection})
            }

            if (!doc) {
                if (!createMissing) {
                    result.skipped++
                    continue
                }
                if (!dryRun) {
                    const data = {}
                    Object.keys(fileValues).forEach(field => {
                        data[field] = CODE_FIELDS.indexOf(field) >= 0 ? fileValues[field] : fromPlainJson(fileValues[field])
                    })
                    const created = await GenericResolver.createEntity(db, {context: {lang: 'de', ...context}}, 'CmsPage', {_version, ...data})
                    const newId = created._id.toString()
                    // remember the id in page.json, so the next import updates this page
                    const metaFile = path.join(root, page._path, CMS_PAGE_META_FILE)
                    assertInside(root, metaFile)
                    const {_id: ignore, ...meta} = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
                    fs.writeFileSync(metaFile, JSON.stringify({_id: newId, ...meta}, null, 2) + '\n', 'utf8')
                    state.items[newId] = {slug: page.slug, fields: hashFields(comparableFields(page), CODE_FIELDS)}
                    Cache.clearStartWith(getCmsPageCacheKey({_version, slug: page.slug}))
                }
                result.created++
                result.slugs.push(label + ': new')
                continue
            }

            const docId = doc._id.toString()
            const itemState = state.items[docId]
            if (!itemState) {
                result.skipped++
                result.slugs.push(label + ': no export baseline, skipped (run the export first)')
                continue
            }

            const diff = threeWayDiff({
                fileValues,
                dbValues: comparableFields(docToExportPage(doc)),
                base: itemState.fields,
                codeFields: CODE_FIELDS
            })
            const changedFields = Object.keys(diff.changed)

            if (diff.conflicts.length) {
                result.conflicts++
                result.slugs.push(label + ': conflict, changed in file and admin: ' + diff.conflicts.join(', '))
            }

            if (changedFields.length === 0) {
                if (!diff.conflicts.length) {
                    result.unchanged++
                }
            } else {
                if (!dryRun) {
                    const data = {}
                    changedFields.forEach(field => {
                        data[field] = CODE_FIELDS.indexOf(field) >= 0 ? diff.changed[field] : fromPlainJson(diff.changed[field])
                    })
                    await GenericResolver.updateEntity(db, context, 'CmsPage', {_id: docId, _version, ...data})
                    Cache.clearStartWith(getCmsPageCacheKey({_version, slug: doc.slug}))
                    if (data.slug && data.slug !== doc.slug) {
                        Cache.clearStartWith(getCmsPageCacheKey({_version, slug: data.slug}))
                    }
                }
                result.updated++
                result.slugs.push(label + ': ' + changedFields.join(', '))
            }
            if (!dryRun) {
                state.items[docId] = {slug: fileValues.slug || doc.slug, fields: diff.base}
            }
        } catch (e) {
            result.errors.push(`${label}: ${e.message}`)
        }
    }

    if (!dryRun) {
        state.type = 'CmsPage'
        writeExportState(root, state)
    }
    return result
}

export {slugToFolder, toPlainJson, fromPlainJson}
