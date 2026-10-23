import GenericResolver, {buildCollectionName} from '../../../api/resolver/generic/genericResolver.mjs'
import {contentVersion, VERSIONED_FIELDS} from '../util/contentVersion.mjs'
import Util from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'
import {getCmsPage, getCmsPageCacheKey} from '../util/cmsPage.mjs'
import {resolveData} from '../util/dataResolver.mjs'
import {pubsub, pubsubHooked} from '../../../api/subscription.mjs'
import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_CONTENT,
    CAPABILITY_MANAGE_CMS_TEMPLATE,
    CAPABILITY_CMS_PAGE_FILES,
    CAPABILITY_VIEW_CMS_EDITOR
} from '../constants/index.mjs'
import Cache from '../../../util/cache.mjs'
import {withFilter} from 'graphql-subscriptions'
import {getHostFromHeaders} from '../../../util/host.mjs'
import Hook from '../../../util/hook.cjs'
import {ObjectId} from 'mongodb'
import {
    settingKeyPrefix
} from '../util/cmsView.mjs'
import renderReact from '../renderReact.mjs'
import {appendServerTiming, timingEntry, SERVER_TIMING_ENABLED} from '../../../util/serverTiming.mjs'
import {createRequireForScript} from '../../../util/require.mjs'
import {DEFAULT_DATA_RESOLVER, DEFAULT_SCRIPT, DEFAULT_STYLE, DEFAULT_TEMPLATE} from '../constants/cmsDefaults.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {createMatchForCurrentUser} from '../../../api/util/dbquery.mjs'
import {matchExpr, parseOrElse} from '../../../client/util/json.mjs'
import {userHasAccessToObject} from '../../../api/util/access.mjs'
import {getCmsPagesForExport, createCmsPagesZip, readCmsPagesZip, importCmsPages} from '../util/cmsPageFilesServer.mjs'
import {filesToCmsPages} from '../util/cmsPageFiles.mjs'
import {findCmsIncludes, cmsPageForInclude, MAX_INCLUDE_DEPTH, MAX_INCLUDES} from '../util/cmsIncludes.mjs'


const createScopeForDataResolver = (query, _props) => {
    let queryParams = {}

    if (query) {
        try {
            queryParams = ClientUtil.extractQueryParams(query)
        } catch (e) {
            // Wir werfen einen neuen Fehler, der den Query-String zur Message hinzufügt
            throw new Error(`URI malformed while parsing query: "${query}". Original error: ${e.message}`)
        }
    }

    const props = (_props ? JSON.parse(_props) : {})
    const scope = { params: queryParams, props }
    return scope
}


const setPageOptionsAsMeta = async (db, context, result)=>{
    const pageName = result.realSlug.split('/')[0]
    const pageOptions = await Util.keyValueGlobalMap(db, context, ['PageOptions-' + pageName,'PageExtensions-' + result.realSlug], {parse: true})

    const meta = {
        PageOptions: pageOptions['PageOptions-' + pageName],
        PageExtensions: pageOptions['PageExtensions-' + result.realSlug]
    }
    result.meta = JSON.stringify(meta)
}

const globalScope = {}

class CmsPageConflictError extends Error {
    constructor(message, data) {
        super(message)
        this.key = 'cms_page_conflict'
        this.data = data
    }
}

/**
 * throws CmsPageConflictError if a field that is saved was changed by someone else since the editor loaded it
 * (baseVersions: {field: contentVersion of the value the change is based on})
 */
const checkCmsPageConflicts = async ({db, context, _id, _version, baseVersions, values}) => {
    let base
    try {
        base = typeof baseVersions === 'string' ? JSON.parse(baseVersions) : baseVersions
    } catch (e) {
        return
    }
    const fields = Object.keys(base || {}).filter(field => VERSIONED_FIELDS.indexOf(field) >= 0 && values[field] !== undefined)
    if (fields.length === 0 || !ObjectId.isValid(_id)) {
        return
    }
    const projection = {}
    fields.forEach(field => projection[field] = 1)
    const collectionName = await buildCollectionName(db, context, 'CmsPage', _version)
    const current = await db.collection(collectionName).findOne({_id: new ObjectId(_id)}, {projection})
    if (!current) {
        return
    }
    const conflicts = fields.filter(field => {
        const now = current[field]
        // the same value as the new one is no conflict (e.g. both did the same change)
        return contentVersion(now) !== base[field] && contentVersion(now) !== contentVersion(values[field])
    })
    if (conflicts.length === 0) {
        return
    }
    // who saved last (best effort)
    let username = null
    try {
        const last = await db.collection('History').findOne(
            {'data._id': {$in: [new ObjectId(_id), String(_id)]}},
            {sort: {_id: -1}, projection: {createdBy: 1}})
        if (last && last.createdBy) {
            const user = await db.collection('User').findOne({_id: new ObjectId(String(last.createdBy._id || last.createdBy))}, {projection: {username: 1}})
            username = user ? user.username : null
        }
    } catch (e) {
    }
    throw new CmsPageConflictError(
        (username ? username + ' hat' : 'Jemand hat') + ' die Seite inzwischen geändert (' + conflicts.join(', ') + ')',
        {fields: conflicts, username})
}

/*
 * Who has a page open in the editor - one entry per browser tab (clientId).
 * An editor is registered while its subscription cmsPageEditors is running: it is added when the subscription
 * starts and removed when it ends (editor closed, tab closed, connection lost - the websocket server ends all
 * subscriptions of a closed connection). So no heartbeat/polling is needed.
 * What the editor is doing (typing, element with the caret) is reported via cmsPageActivity, only on change.
 * Kept in memory: fine for one API process (app.yml instances: 1), several processes would need a shared store.
 */
const cmsPageEditors = {} // slug -> {clientId: {_id, username, since, typing, elementKey, elementLabel}}

const getActiveEditors = (slug) => {
    const entries = cmsPageEditors[slug] || {}
    return Object.keys(entries)
        .map(clientId => ({clientId, ...entries[clientId]}))
        .sort((a, b) => a.since - b.since)
}

const publishEditors = (slug) => {
    pubsub.publish('cmsPageEditors', {slug, cmsPageEditors: {slug, editors: JSON.stringify(getActiveEditors(slug))}})
}

const addEditor = (slug, context) => {
    if (!slug || !context || !context.id || !context.clientId) {
        return null
    }
    if (!cmsPageEditors[slug]) {
        cmsPageEditors[slug] = {}
    }
    cmsPageEditors[slug][context.clientId] = {
        _id: context.id,
        username: context.username,
        since: Date.now(),
        typing: false,
        elementKey: null,
        elementLabel: null
    }
    publishEditors(slug)
    return context.clientId
}

const removeEditor = (slug, clientId) => {
    if (cmsPageEditors[slug] && cmsPageEditors[slug][clientId]) {
        delete cmsPageEditors[slug][clientId]
        if (Object.keys(cmsPageEditors[slug]).length === 0) {
            delete cmsPageEditors[slug]
        }
        publishEditors(slug)
    }
}

export default db => ({
    Query: {
        exportCmsPages: async ({ids, slugs, _version, aiGuide}, {context}) => {
            // the export contains scripts and server scripts: own capability (author and up)
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_CMS_PAGE_FILES)

            if ((!ids || ids.length === 0) && (!slugs || slugs.length === 0)) {
                throw new Error('ids or slugs are required')
            }
            const pages = await getCmsPagesForExport({db, context, ids, slugs, _version})
            if (pages.length === 0) {
                throw new Error('no pages found')
            }
            const date = new Date().toISOString().substring(0, 10)
            const baseName = pages.length === 1 ?
                'cmspage-' + (pages[0].slug || 'root').replace(/[^A-Za-z0-9._-]/g, '_') :
                'cmspages-' + pages.length
            return {
                name: `${baseName}-${date}.zip`,
                count: pages.length,
                // aiGuide: AGENTS.md / CLAUDE.md + Lunuc reference for AI assistants (default on)
                data: createCmsPagesZip(pages, {aiGuide: aiGuide !== false}).toString('base64')
            }
        },
        cmsPages: async ({limit, page, offset, filter, sort, _version}, {headers, context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const fields = ['public', 'slug', 'hostRule', 'name', 'author','keyword', 'description', 'urlSensitiv', 'fetchPolicy', 'parseResolvedData', 'alwaysLoadAssets', 'loadPageOptions', 'ssrStyle', 'uniqueStyle', 'publicEdit', 'compress', 'isTemplate','ownerGroup$[UserGroup]','disableRendering']

            if (filter) {

                const parsedFilter = Util.parseFilterV2(filter)
                const hasRest = parsedFilter.rest.length>0
                // search in fields
                if(hasRest || parsedFilter.parts.dataResolver) {
                    fields.push('dataResolver')
                }

                if(hasRest || parsedFilter.parts.script) {
                    fields.push('script')
                }

                if(hasRest || parsedFilter.parts.serverScript) {
                    fields.push('serverScript')
                }

                if(hasRest || parsedFilter.parts.template) {
                    fields.push('template')
                }

                if(hasRest || parsedFilter.parts.style) {
                    fields.push('style')
                }

                if(hasRest || parsedFilter.parts.resources) {
                    fields.push('resources')
                }

                if(hasRest || parsedFilter.parts.manual) {
                    fields.push('manual')
                }
            }
            const data = await GenericResolver.entities(db, {context, headers}, 'CmsPage', fields, {
                limit,
                page,
                offset,
                filter,
                sort,
                _version
            })
            return data
        },
        cmsPage: async function resolveCmsPage({slug, query, props, nosession, editmode, dynamic, inEditor, meta, _version}, req, info) {
            // set when the page is resolved as include of another page (see util/cmsIncludes.mjs)
            const includeState = info && info.__cmsInclude ? info : null
            const startTime = Date.now()
            const {context, headers} = req
            meta = parseOrElse(meta,{})
            // included components the client already has (withCms.js). Removed from meta,
            // meta is passed to the data resolver and stored by the tracking
            const cachedIncludeKeys = Array.isArray(meta.includes) ? meta.includes : null
            delete meta.includes

            // Server-Timing (diagnostic only, no influence on the result)
            const tStart = performance.now()
            const segmentTimings = SERVER_TIMING_ENABLED ? [] : undefined
            let tGetPage = 0, tResolveData = 0, tSsr = 0

            let cmsPages = await getCmsPage({db, context, slug, _version, checkHostrules: !dynamic, inEditor, headers, editmode})
            tGetPage = performance.now() - tStart

            if (!cmsPages.results || cmsPages.results.length === 0) {
                if (!includeState) {
                    Hook.call('track404', {req, event: '404', slug, db, context, data: query, meta})
                }
                throw new Error('Cms page doesn\'t exist')
            }

            const {
                _id, createdBy, template, script, style, resources, dataResolver, parseResolvedData, fetchPolicy, alwaysLoadAssets, loadPageOptions, ssrStyle, uniqueStyle, publicEdit, compress,
                ssr, modifiedAt, urlSensitiv, name, keyword, author, description, serverScript, manual, disableRendering
            } = cmsPages.results[0]


            let userCanPotentiallyChangePage = editmode && Util.isUserLoggedIn(context) && await Util.userHasCapability(db, context, CAPABILITY_VIEW_CMS_EDITOR)
            const userHasRightsToChangePage = userCanPotentiallyChangePage && (await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS) || userHasAccessToObject(context, cmsPages.results[0]))

            const scope = {
                ...createScopeForDataResolver(query, props),
                page: {
                    slug,
                    slugContext:cmsPages?.usedHostrule?.slugContext,
                    host: getHostFromHeaders(headers), meta, referer: req.headers['referer'], lang: context.lang,
                    userHasRightsToChangePage
                },
                editmode
            }

            const tResolveStart = performance.now()
            const {resolvedData, subscriptions} = await resolveData({
                db,
                context,
                dataResolver,
                scope,
                nosession,
                req,
                editmode,
                dynamic,
                timings: segmentTimings
            })
            const tResolveEnd = performance.now()
            tResolveData = tResolveEnd - tResolveStart

            // access restrictions based on data resolver
            if(resolvedData.access ){
                if(resolvedData.access.read === false){
                    throw new Error('No access rights')
                }
                if(resolvedData.access.edit === false){
                    userCanPotentiallyChangePage = false
                }
            }

            // Public date to return
            const result = {
                _id,
                modifiedAt,
                createdBy,
                ssr,
                public: cmsPages.results[0].public,
                online: !_version || _version === 'default',
                slug,
                realSlug: cmsPages.results[0].slug,
                script,
                resources,
                style,
                publicEdit,
                resolvedData: JSON.stringify(resolvedData),
                parseResolvedData,
                alwaysLoadAssets,
                fetchPolicy,
                loadPageOptions,
                ssrStyle,
                uniqueStyle,
                compress,
                subscriptions,
                urlSensitiv,
                editable: userCanPotentiallyChangePage, // if false editor is not shown
                author,
                disableRendering
            }

            if (ssr) {

                // Server side rendering
                const tSsrStart = performance.now()
                try {
                    result.html = await renderReact({
                        req,
                        template,
                        script,
                        style,
                        slug:'_ssr',
                        resolvedData,
                        context,
                        scope
                    })

                } catch (e) {
                    console.log(e)
                    result.html = e.message
                }
                tSsr = performance.now() - tSsrStart
                if(editmode){
                    result.template = template
                }
            }else{
                result.template = template
            }


            if (userCanPotentiallyChangePage) {
                // return data that the user needs to see the editor view completely. no sensitive data may be visible here
                result.name = name
                result.keyword = keyword
                result.description = description
                result.manual = manual

                if (!dynamic) {
                    const pageName = result.realSlug.split('/')[0]
                    const globalOptions = await Util.keyValueGlobalMap(db, context, [
                        'PageOptionsDefinition-' + pageName, /* Options definition for general page (root slug) */
                        'PageOptions-' + pageName,  /* Options values for general page (root slug) */
                        'PageExtensionsDefinition-' + result.realSlug, /* Page extension definition for the current page */
                        'PageExtensions-' + result.realSlug /* Page extension value for the current page */

                    ], {parse: true})
                    const editorOptions = await Util.keyvalueMap(db, context, [
                        settingKeyPrefix,  /* CmsViewEditor options */
                        settingKeyPrefix + '-' + result.realSlug /* CmsViewEditor options for the current slug */
                    ], {parse: true})

                    const pageDataMeta = {
                        PageOptionsDefinition: globalOptions['PageOptionsDefinition-' + pageName],
                        PageOptions: globalOptions['PageOptions-' + pageName],
                        EditorPageOptions: editorOptions[settingKeyPrefix + '-' + result.realSlug],
                        EditorOptions: editorOptions[settingKeyPrefix],
                        PageExtensionsDefinition: globalOptions['PageExtensionsDefinition-' + result.realSlug],
                        PageExtensions: globalOptions['PageExtensions-' + result.realSlug]
                    }

                    result.meta = JSON.stringify(pageDataMeta)
                }else if( loadPageOptions ){
                    await setPageOptionsAsMeta(db, context, result)
                }

                if (userHasRightsToChangePage) {
                    //dataResolver and serverScript may contain sensitive data, therefore only visible to authorised users
                    result.dataResolver = dataResolver
                    result.serverScript = serverScript
                }
            } else {

                // if user is not logged in return only slug and rendered html
                // never return sensitiv data here
                result.name = {[context.lang]: name[context.lang]}
                if(keyword) {
                    result.keyword = {[context.lang]: keyword[context.lang]}
                }
                if(description) {
                    result.description = {[context.lang]: description[context.lang]}
                }
                if( loadPageOptions ){
                    await setPageOptionsAsMeta(db, context, result)
                }
            }

            // Optional: embedded components with p.include are resolved right away and returned in
            // `includes`, so the client does not need an extra request for them (util/cmsIncludes.mjs).
            // Not for editors: their components can be requested in edit mode (forceEditMode)
            const isFetchMore = meta === 'fetchMore' || meta.isFetchMore
            if (result.template && !editmode && !inEditor && !isFetchMore &&
                (!includeState || includeState.depth < MAX_INCLUDE_DEPTH)) {
                const specs = findCmsIncludes(result.template, `${result.realSlug}|${_version || ''}|${modifiedAt}`)
                if (specs.length > 0 && !await Util.userHasCapability(db, context, CAPABILITY_VIEW_CMS_EDITOR)) {
                    // components the client already has in its cache are not sent again (meta.includes)
                    const shared = includeState ? includeState.shared : {
                        count: 0, list: [],
                        done: new Set(cachedIncludeKeys ? cachedIncludeKeys.slice(0, 50).filter(k => typeof k === 'string') : [])
                    }
                    const depth = includeState ? includeState.depth : 0
                    await Promise.all(specs.map(async spec => {
                        const key = spec.slug + '|' + spec.props
                        if (shared.done.has(key) || shared.count >= MAX_INCLUDES) {
                            return
                        }
                        shared.done.add(key)
                        shared.count++
                        // same variables as the request of the component (getGqlVariables / getSlugVersion)
                        let childSlug = spec.slug, childVersion
                        if (childSlug.indexOf('@') === 0) {
                            const pos = childSlug.indexOf('/')
                            childVersion = pos >= 0 ? childSlug.substring(1, pos) : childSlug.substring(1)
                            childSlug = pos >= 0 ? childSlug.substring(pos + 1) : ''
                        }
                        try {
                            const child = await resolveCmsPage({
                                slug: childSlug,
                                _version: childVersion,
                                props: spec.props || undefined,
                                nosession,
                                dynamic: true
                            }, req, {__cmsInclude: true, depth: depth + 1, shared})
                            if (child) {
                                shared.list.push({slug: spec.slug, props: spec.props, cmsPage: cmsPageForInclude(child)})
                            }
                        } catch (e) {
                            // not included -> the component is loaded by its own request as before
                            console.warn(`CMS: include ${spec.slug} in ${slug} failed: ${e.message}`)
                        }
                    }))
                    if (!includeState && shared.list.length > 0) {
                        result.includes = JSON.stringify(shared.list)
                    }
                }
            }

            if(isFetchMore /* || meta.isRefetch*/){
                delete result.dataResolver
                delete result.serverScript
                delete result.manual
                delete result.template
                delete result.script
                delete result.style
                delete result.name
            }
            const elapsedTime = Date.now() - startTime

            if(elapsedTime>20) {
                console.debug(`CMS: resolver for ${slug} got data in ${elapsedTime}ms`)
            }

            if (SERVER_TIMING_ENABLED && !includeState) {
                const entries = [
                    timingEntry('cms-getpage', tGetPage),
                    timingEntry('cms-resolvedata', tResolveData)
                ]
                if (ssr) {
                    entries.push(timingEntry('cms-ssr', tSsr))
                }
                entries.push(timingEntry('cms-total', performance.now() - tStart, slug))
                // the 5 slowest dataResolver segments (end = start of the next one)
                if (segmentTimings && segmentTimings.length) {
                    const segs = segmentTimings.map((s, i) => ({
                        ...s,
                        dur: (i + 1 < segmentTimings.length ? segmentTimings[i + 1].start : tResolveEnd) - s.start
                    }))
                    segs.sort((a, b) => b.dur - a.dur)
                    for (const s of segs.slice(0, 5)) {
                        entries.push(timingEntry(`cms-seg-${s.index}`, s.dur, s.key || ('segment ' + s.index)))
                    }
                }
                appendServerTiming(req.res, entries)
            }
            return result
        },
        cmsPageActivity: async ({slug, typing, elementKey, elementLabel}, req) => {
            const {context} = req
            const entry = context.id && context.clientId && cmsPageEditors[slug] && cmsPageEditors[slug][context.clientId]
            if (entry) {
                entry.typing = !!typing
                entry.elementKey = elementKey || null
                entry.elementLabel = elementLabel || null
                publishEditors(slug)
            }
            return {editors: JSON.stringify(getActiveEditors(slug))}
        },
        cmsPageHistoryChanges: async ({_id, field, limit = 1000}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_CMS_CONTENT)
            if (VERSIONED_FIELDS.indexOf(field) < 0 || !ObjectId.isValid(_id)) {
                throw new Error('invalid field or _id')
            }
            // a save contains every field that was sent, also unchanged ones (e.g. imports). Compared here, so the
            // client gets one flag per entry instead of the whole content of every save
            const entries = await db.collection('History').find(
                {'data._id': {$in: [new ObjectId(_id), String(_id)]}, 'meta.keys': field},
                {projection: {['data.' + field]: 1}, sort: {_id: -1}, limit: Math.min(Math.max(1, limit), 5000)}
            ).toArray()
            const result = {}
            let previous = null
            entries.reverse().forEach((entry, i) => {
                const version = contentVersion(entry.data ? entry.data[field] : undefined)
                result[String(entry._id)] = i === 0 || version !== previous
                previous = version
            })
            return JSON.stringify(result)
        },
        cmsPageStatus: async ({slug}, req) => {
            if (!req.context.id) {
                return {user: null}
            }
            const editors = getActiveEditors(slug)
            const data = {}
            if (Hook.hooks['cmsPageStatus'] && Hook.hooks['cmsPageStatus'].length) {
                for (let i = 0; i < Hook.hooks['cmsPageStatus'].length; ++i) {
                    await Hook.hooks['cmsPageStatus'][i].callback({db, slug, req, data})
                }
            }

            // user (the former single owner of the page) is not used any more, see editors
            return {user: null, data: JSON.stringify(data), editors: JSON.stringify(editors)}
        },
        cmsPageGroups: async ({path ='', _version}, req) => {
            const {context} = req
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_CMS_PAGES)

            const userCanManageOtherUsers = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)

            let match = {}
            if (!userCanManageOtherUsers) {
                // only select items that belong to the current user or the user has permission to read
                match = await createMatchForCurrentUser({typeName:'CmsPage', db, context})
            }

            match.slug = { $regex: `^${path}` } // Only include slugs containing at least one "/"

            const data = await db.collection('CmsPage').aggregate([
                {
                    $match: match
                },
                {
                    $project: {
                        name: {
                            $substrBytes: [
                                "$slug",
                                path.length,
                                { $subtract: [{$indexOfBytes: ["$slug", "/", path.length] }, path.length ] }

                            ]
                        },
                        public:1,
                        slug: 1, // Keep the original slug for reference
                    }
                },
                {
                    $sort: { name: 1, _id: 1 } // Ensure a consistent "first" entry by sorting
                },
                {
                    $group: {
                        _id: "$name",
                        childrenCount: { $sum: 1 },
                        firstPublic: { $first: "$public" },
                        firstSlug: { $first: "$slug" } // Or use "$$ROOT" for the whole doc
                    }
                },
                {
                    $project: {
                        name: "$_id",
                        childrenCount: 1,
                        firstSlug: 1,
                        firstPublic: 1,
                        _id: 0
                    }
                },
                {
                    $addFields: {
                        path: path,
                    }
                },
                {
                    // set count to zero if there are no children
                    $addFields: {
                        childrenCount: {
                            $cond: [
                                { $eq: ["$firstSlug", { $concat: [ path, "$name" ] }] },
                                0,
                                "$childrenCount"
                            ]
                        }
                    }
                },
                {
                    $sort: { childrenCount: -1,name: 1 } // 1 for ascending, -1 for descending
                }
            ]).toArray()
            return data
        },
        cmsServerMethod: async ({slug, methodName, args, query, props, dynamic, _version}, req) => {

            if (!methodName.match(/^[0-9a-zA-Z_]+$/) || methodName.trim() === 'require') {
                throw new Error('Invalid methodName')
            }

            const {context, headers} = req
            const startTime = (new Date()).getTime()
            let cmsPages = await getCmsPage({db, context, slug, checkHostrules: !dynamic, _version, headers})

            if (!cmsPages.results || cmsPages.results.length === 0) {
                throw new Error('Cms page doesn\'t exist')
            }

            const {serverScript} = cmsPages.results[0]

            if (!serverScript) {
                throw new Error('serverScript doesn\'t exist')
            }

            if (args) {
                try {
                    args = JSON.parse(args)
                } catch (e) {

                }
            }

            console.log(`Server methode call ${methodName}`)
            let result
            const requireContext = createRequireForScript(import.meta.url)
            const scriptExecution = `
            
                    ${requireContext.script}
                    
                    const data = (async () => {
                        try{
                            ${serverScript}
                            let result = ${methodName}(this.args)
                            this.resolve({result: result})
                        }catch(error){                       
                            this.resolve({error})
                        }
                    })()`

            try {
                const script = await new Promise(resolve => {
                    const tpl = new Function(scriptExecution)

                    tpl.call({
                        require:requireContext.require,
                        args,
                        resolve,
                        db,
                        context,
                        req,
                        GenericResolver,
                        ObjectId,
                        globalScope,
                        cmsPage: cmsPages.results[0]
                    })

                })
                if (script && script.error && script.error.message) {
                    result = {error: script.error}
                    Hook.call('ServerScriptError', {slug, methodName, args, error: script.error})
                    console.log(script.error)
                } else {
                    result = await script.result
                    if(result && result.error && result.error.message){
                        Hook.call('ServerScriptError', {slug, methodName, args, error: result.error})
                        console.log(result.error)
                    }
                }
            } catch (error) {
                Hook.call('ServerScriptError', {slug, methodName, args, error})
                result = {error: error.message}
            }

            if (result && result.constructor !== String) {
                result = JSON.stringify(result)
            }

            return {result}
        }
    },
    Mutation: {
        importCmsPages: async ({data, _version, createMissing, dryRun}, {context}) => {
            // roles with the page files capability may import (author and up). serverScript and
            // dataResolver run on the server: they are only imported with manage_cms_template
            // (see importCmsPages), for other users these fields are left unchanged
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_CMS_PAGE_FILES)

            const files = readCmsPagesZip(Buffer.from(data, 'base64'))
            const {pages, errors} = filesToCmsPages(files)
            if (pages.length === 0) {
                return {created: 0, updated: 0, unchanged: 0, skipped: 0, slugs: [], errors: errors.length ? errors : ['no page.json found in zip']}
            }
            const result = await importCmsPages({
                db, context, pages, _version,
                createMissing: createMissing !== false,
                dryRun: !!dryRun
            })
            result.errors.unshift(...errors)
            return result
        },
        createCmsPage: async ({slug,ownerGroup,template,style,script,resources,meta, ...rest}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_CMS_CONTENT)

            if (!slug) slug = ''
            slug = encodeURI(slug.trim())

            const data = {
                slug,
                ...rest,
                ownerGroup:(ownerGroup?ownerGroup.reduce((o,id)=>{o.push(new ObjectId(id));return o},[]):ownerGroup),
                dataResolver: DEFAULT_DATA_RESOLVER,
                resources: resources
            }

            const metaJson = parseOrElse(meta,{})
            if(metaJson.selectedTemplate === 'defaultLayout'){
                data.template = DEFAULT_TEMPLATE
                data.script = DEFAULT_SCRIPT
                data.style = DEFAULT_STYLE
            }else{
                data.template = template
                data.script = script
                data.style = style
            }

            return await GenericResolver.createEntity(db, req, 'CmsPage', data)
        },
        updateCmsPage: async ({_id, _meta, slug, realSlug, query, props, createdBy, ownerGroup, baseVersions, ...rest}, req, options) => {
            const {context, headers} = req

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_CMS_CONTENT)


            const {_version} = rest

            // concurrent editing: the editor sends the version of each field its change is based on.
            // if someone else saved one of these fields meanwhile, nothing is saved and the editor asks what to do
            if (baseVersions) {
                await checkCmsPageConflicts({db, context, _id, _version, baseVersions, values: rest})
            }


            if (realSlug) {
                rest.slug = realSlug
            }else{
                rest.slug = slug
            }


            // clear server cache
            const cacheKey = getCmsPageCacheKey({_version, slug: rest.slug})

            Cache.clearStartWith(cacheKey)
            const result = await GenericResolver.updateEnity(db, context, 'CmsPage', {
                _id,
                ownerGroup:(ownerGroup?ownerGroup.reduce((o,id)=>{o.push(new ObjectId(id));return o},[]):ownerGroup),
                createdBy: (createdBy ? new ObjectId(createdBy) : createdBy), ...rest
            })

            result.slug = slug
            result.realSlug = rest.slug

            // if dataResolver has changed resolveData and return it
            if (rest.dataResolver) {
                const scope = {
                    ...createScopeForDataResolver(query, props),
                    page: {slug, realSlug: rest.slug, host: getHostFromHeaders(headers), userHasRightsToChangePage:true}
                }
                const {resolvedData, subscriptions} = await resolveData({
                    db,
                    context,
                    dataResolver: rest.dataResolver,
                    scope,
                    req
                })

                result.resolvedData = JSON.stringify(resolvedData)
                result.subscriptions = subscriptions
            } else if (rest.dataResolver === '') {
                // if resolver explicitly is set to ''
                result.resolvedData = '{}'
            }

            /*pubsub.publish('newNotification', {
                userId: context.id,
                newNotification: {
                    key: 'updateCmsPage',
                    message: `CMS Page ${_id} was successfully updated on ${new Date().toLocaleTimeString()}`
                }
            })*/
            if(options && options.publish!==false){
                pubsubHooked.publish('subscribeCmsPage', {userId:context.id,subscribeCmsPage: {_meta, action: 'update', data: [result]}}, db, context)
            }

            // lightweight notice for open editors of this page (no page content)
            pubsub.publish('cmsPageChanged', {
                slug: rest.slug,
                clientId: context.clientId,
                cmsPageChanged: {
                    slug: rest.slug,
                    userId: context.id,
                    username: context.username,
                    modifiedAt: result.modifiedAt ? String(result.modifiedAt) : String(Date.now()),
                    fields: Object.keys(rest).filter(key => ['slug', '_version'].indexOf(key) < 0)
                }
            })

            return result
        },
        deleteCmsPage: async ({_id, _version}, {context}) => {
            return GenericResolver.deleteEnity(db, context, 'CmsPage', {_id, _version})
        },
        deleteCmsPages: async ({_id, _version}, {context}) => {
            return GenericResolver.deleteEnities(db, context, 'CmsPage', {_id, _version})
        },
        cloneCmsPage: async (data, {context}) => {
            return GenericResolver.cloneEntity(db, context, 'CmsPage', data)
        }
    },
    Subscription: {
        cmsPageData: withFilter(() => pubsub.asyncIterableIterator('cmsPageData'),
            (payload, context) => {
                return payload && context.clientId === payload.clientId
            }
        ),
        // root field function: called with (args, context, info) when the subscription starts
        cmsPageEditors: async (args, context, info) => {
            // withFilter returns a promise of the iterator
            const filtered = await withFilter(() => pubsub.asyncIterableIterator('cmsPageEditors'),
                async (payload, ctx) => {
                    return !!(payload && ctx && ctx.id && ctx.variables &&
                        payload.slug === ctx.variables.slug &&
                        await Util.userHasCapability(db, ctx, CAPABILITY_VIEW_CMS_EDITOR))
                }
            )(args, context, info)
            // the websocket server does not pass the graphql variables on, they are in context.variables
            // (see api/subscription.mjs) - same as for the other subscriptions
            const slug = (args && args.slug) || (context && context.variables && context.variables.slug)
            const clientId = addEditor(slug, context)
            if (clientId) {
                // ends when the editor unsubscribes or the websocket connection is closed
                const originalReturn = filtered.return ? filtered.return.bind(filtered) : null
                let removed = false
                filtered.return = (value) => {
                    if (!removed) {
                        removed = true
                        removeEditor(slug, clientId)
                    }
                    return originalReturn ? originalReturn(value) : Promise.resolve({value, done: true})
                }
            }
            return filtered
        },
        cmsPageChanged: withFilter(() => pubsub.asyncIterableIterator('cmsPageChanged'),
            async (payload, context) => {
                // not to the tab that saved
                return !!(payload && context && context.id && context.variables &&
                    payload.slug === context.variables.slug &&
                    (!payload.clientId || payload.clientId !== context.clientId) &&
                    await Util.userHasCapability(db, context, CAPABILITY_VIEW_CMS_EDITOR))
            }
        ),
        cmsCustomData: withFilter(() => pubsub.asyncIterableIterator('cmsCustomData'),
            (payload, context) => {
                if(context.variables && context.variables.filter){
                    const data = parseOrElse(payload.cmsCustomData.data,{})
                    return !matchExpr(context.variables.filter, data)
                }
                return payload && payload.session === context.session && (!payload.clientId || context.clientId === payload.clientId)
            }
        ),
        subscribeCmsPage: withFilter(() => pubsub.asyncIterableIterator('subscribeCmsPage'),
            async (payload, context) => {
                if( payload ) {

                    const hookResponse = {}
                    if (Hook.hooks['ResolverBeforePublishSubscription'] && Hook.hooks['ResolverBeforePublishSubscription'].length) {
                        for (let i = 0; i < Hook.hooks['ResolverBeforePublishSubscription'].length; ++i) {
                            await Hook.hooks['ResolverBeforePublishSubscription'][i].callback({
                                db, payload, context, hookResponse
                            })
                        }
                    }

                    if(hookResponse.abort){
                        return false
                    }
                    return await Util.userCanSubscribe(db,context,'CmsPage',payload)
                }
            }
        )
    }
})


