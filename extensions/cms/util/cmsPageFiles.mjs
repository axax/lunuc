/**
 * Converts CmsPages into a plain file structure and back.
 *
 * Every page gets its own folder (the folder path is derived from the slug):
 *
 *   <slug>/page.json          all attributes (slug, name, description, flags, ownerGroup, ...) - required for the import
 *   <slug>/template.json      template
 *   <slug>/style.css          style
 *   <slug>/script.js          client script
 *   <slug>/serverScript.js    server script
 *   <slug>/dataResolver.json  data resolver
 *   <slug>/resources.json     resources (only if set)
 *   <slug>/manual.md          manual (only if set)
 *
 * The content of the code files is written verbatim, so an export followed by an
 * import is lossless. Pure module without dependencies: used by the client, the
 * graphql resolver and server side jobs (cronjob export to a directory).
 */

export const CMS_PAGE_FILES_VERSION = 1
export const CMS_PAGE_META_FILE = 'page.json'
// older exports had a separate file for the other attributes, still read by the import
export const CMS_PAGE_ATTRIBUTES_FILE = 'attributes.json'
export const CMS_PAGE_ROOT_FOLDER = '_root' // folder for the page with the empty slug

// field -> file name. Order is the order in which the files are written
export const CMS_PAGE_CODE_FILES = [
    {field: 'template', file: 'template.json'},
    {field: 'style', file: 'style.css'},
    {field: 'script', file: 'script.js'},
    {field: 'serverScript', file: 'serverScript.js'},
    {field: 'dataResolver', file: 'dataResolver.json'},
    {field: 'resources', file: 'resources.json', optional: true},
    {field: 'manual', file: 'manual.md', optional: true}
]

// fields that are stored in page.json
export const CMS_PAGE_META_FIELDS = [
    'slug', 'name', 'author', 'keyword', 'description', 'hostRule', 'public', 'urlSensitiv',
    'fetchPolicy', 'parseResolvedData', 'alwaysLoadAssets', 'compress', 'loadPageOptions',
    'uniqueStyle', 'ssr', 'ssrStyle', 'publicEdit', 'editable', 'isTemplate', 'disableRendering'
]

// computed at runtime or cache values - never exported
export const CMS_PAGE_RUNTIME_FIELDS = [
    'resolvedData', 'html', 'subscriptions', 'cacheKey', 'realSlug', 'online', 'query', 'props', 'meta'
]

// exported for information, but never written by an import
export const CMS_PAGE_INFO_FIELDS = ['_id', 'modifiedAt', 'createdBy']

const KNOWN_FIELDS = [
    ...CMS_PAGE_INFO_FIELDS,
    ...CMS_PAGE_META_FIELDS,
    ...CMS_PAGE_CODE_FILES.map(f => f.field)
]

/**
 * attributes.json contains every field that has no own file and is not in page.json.
 * Values must be plain JSON - the server converts ObjectIds to {"$oid": "..."} and
 * dates to {"$date": "..."} before and back after (see cmsPageFilesServer.mjs)
 */
export const getCmsPageAttributes = (page) => {
    const attributes = {}
    Object.keys(page).forEach(key => {
        if (KNOWN_FIELDS.indexOf(key) < 0 && CMS_PAGE_RUNTIME_FIELDS.indexOf(key) < 0 &&
            !key.startsWith('_') && page[key] !== undefined) {
            attributes[key] = page[key]
        }
    })
    if (page.createdBy !== undefined && page.createdBy !== null) {
        // informational only
        attributes.createdBy = page.createdBy
    }
    return attributes
}

// a field name that must never be written by an import (mongo operators, nested paths, internal)
const isUnsafeFieldName = key => !key || key.startsWith('$') || key.startsWith('_') || key.indexOf('.') >= 0

const README = `# CmsPage export

Every folder with a \`page.json\` is one CmsPage. The folder path is derived from the slug,
the real slug is the one in \`page.json\`.

| File | Field | Content |
|---|---|---|
| page.json | all attributes | slug, name, author, keyword, description, flags, ownerGroup, ... - required for the import |
| template.json | template | JSON template (JsonDom) |
| style.css | style | styles of the page |
| script.js | script | client script |
| serverScript.js | serverScript | server script (runs on the server) |
| dataResolver.json | dataResolver | data resolver definition |
| resources.json | resources | external scripts / styles (optional) |
| manual.md | manual | documentation (optional) |

Import rules:
- the page is matched by the slug in \`page.json\`
- a file that is missing leaves the field unchanged, an empty file clears it
- \`_id\`, \`modifiedAt\` and \`createdBy\` in page.json are informational only
- attributes with the value null are not set; to clear a text use an empty string
- in page.json ids are written as \`{"$oid": "..."}\` and dates as \`{"$date": "..."}\`
`

const isValidSegment = s => s && s !== '.' && s !== '..'

/**
 * folder path for a slug. Unsafe characters are replaced, so the result is always
 * a relative path without '..' segments
 */
export const slugToFolder = (slug) => {
    if (!slug) {
        return CMS_PAGE_ROOT_FOLDER
    }
    let decoded = slug
    try {
        decoded = decodeURI(slug)
    } catch (e) {
    }
    const segments = decoded.split('/')
        .map(s => s.trim().replace(/[^A-Za-z0-9._\-äöüÄÖÜ]/g, '_'))
        .filter(isValidSegment)
    return segments.length > 0 ? segments.join('/') : CMS_PAGE_ROOT_FOLDER
}

/**
 * @returns [{path, content}] - paths relative to the export root
 */
export const cmsPageToFiles = (page, {folder} = {}) => {
    const base = folder || slugToFolder(page.slug)
    const files = []

    // page.json holds every attribute that has no own file. The standard attributes are
    // always written (null if not set), so it is visible which ones exist
    const meta = {
        _exportVersion: CMS_PAGE_FILES_VERSION,
        _id: page._id ? String(page._id) : undefined
    }
    CMS_PAGE_META_FIELDS.forEach(field => {
        meta[field] = page[field] !== undefined ? page[field] : null
    })
    if (!meta.slug) {
        meta.slug = ''
    }
    Object.assign(meta, getCmsPageAttributes(page))
    if (page.modifiedAt !== undefined) {
        meta.modifiedAt = page.modifiedAt
    }
    files.push({path: base + '/' + CMS_PAGE_META_FILE, content: JSON.stringify(meta, null, 2) + '\n'})

    CMS_PAGE_CODE_FILES.forEach(({field, file, optional}) => {
        let value = page[field]
        if (value === undefined || value === null) {
            value = ''
        } else if (typeof value !== 'string') {
            value = JSON.stringify(value, null, 2)
        }
        if (optional && !value) {
            return
        }
        files.push({path: base + '/' + file, content: value})
    })
    return files
}

/**
 * @returns [{path, content}] for several pages incl. README.md. Pages whose folder
 * would collide get a numeric suffix
 */
export const cmsPagesToFiles = (pages, {readme = true} = {}) => {
    const files = []
    const usedFolders = {}
    pages.forEach(page => {
        let folder = slugToFolder(page.slug)
        if (usedFolders[folder]) {
            let i = 2
            while (usedFolders[folder + '_' + i]) i++
            folder = folder + '_' + i
        }
        usedFolders[folder] = true
        files.push(...cmsPageToFiles(page, {folder}))
    })
    if (readme && pages.length > 0) {
        files.push({path: 'README.md', content: README})
    }
    return files
}

const normalizePath = p => p.replace(/\\/g, '/').replace(/^\/+/, '')

/**
 * Reverse of cmsPagesToFiles.
 * @param files [{path, content}] - content as string
 * @returns {pages: [{slug, ...fields}], errors: [String]}
 */
export const filesToCmsPages = (files) => {
    const byPath = {}
    files.forEach(f => {
        byPath[normalizePath(f.path)] = f.content
    })

    // a zip often contains a top level folder (e.g. "export/"), so every page.json counts
    const metaPaths = Object.keys(byPath).filter(p => p === CMS_PAGE_META_FILE || p.endsWith('/' + CMS_PAGE_META_FILE))

    const pages = [], errors = []
    metaPaths.forEach(metaPath => {
        const dir = metaPath.substring(0, metaPath.length - CMS_PAGE_META_FILE.length)
        let meta
        try {
            meta = JSON.parse(byPath[metaPath])
        } catch (e) {
            errors.push(`${metaPath}: invalid JSON (${e.message})`)
            return
        }
        if (!meta || typeof meta !== 'object' || typeof meta.slug !== 'string') {
            errors.push(`${metaPath}: slug is missing`)
            return
        }
        const page = {}

        const takeAttributes = (attributes, fileName) => {
            Object.keys(attributes).forEach(key => {
                if (key.startsWith('_') || CMS_PAGE_INFO_FIELDS.indexOf(key) >= 0 || CMS_PAGE_RUNTIME_FIELDS.indexOf(key) >= 0) {
                    // informational (_id, _exportVersion, createdBy, modifiedAt) or computed
                    return
                }
                if (isUnsafeFieldName(key)) {
                    errors.push(`${dir + fileName}: attribute "${key}" is not allowed, ignored`)
                } else if (attributes[key] !== null && attributes[key] !== undefined) {
                    // null means not set
                    page[key] = attributes[key]
                }
            })
        }

        // separate file of older exports first, so page.json and the code files win
        const attributesContent = byPath[dir + CMS_PAGE_ATTRIBUTES_FILE]
        if (attributesContent !== undefined && attributesContent.trim()) {
            try {
                const attributes = JSON.parse(attributesContent)
                if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
                    throw new Error('object expected')
                }
                takeAttributes(attributes, CMS_PAGE_ATTRIBUTES_FILE)
            } catch (e) {
                errors.push(`${dir + CMS_PAGE_ATTRIBUTES_FILE}: invalid JSON (${e.message}), ignored`)
            }
        }

        takeAttributes(meta, CMS_PAGE_META_FILE)
        page.slug = meta.slug.trim()

        CMS_PAGE_CODE_FILES.forEach(({field, file}) => {
            const content = byPath[dir + file]
            if (content !== undefined) {
                page[field] = content
            }
        })
        page._path = dir || './'
        pages.push(page)
    })

    // same slug twice would overwrite each other on import
    const seen = {}
    for (let i = pages.length - 1; i >= 0; i--) {
        const slug = pages[i].slug
        if (seen[slug]) {
            errors.push(`slug "${slug}" exists more than once (${pages[i]._path}), ignored`)
            pages.splice(i, 1)
        } else {
            seen[slug] = true
        }
    }
    return {pages, errors}
}
