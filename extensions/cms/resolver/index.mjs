import GenericResolver from '../../../api/resolver/generic/genericResolver.mjs'
import Util from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'
import {getCmsPage, getCmsPageCacheKey} from '../util/cmsPage.mjs'
import {resolveData} from '../util/dataResolver.mjs'
import {pubsub, pubsubHooked} from '../../../api/subscription.mjs'
import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_CONTENT,
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
import {createRequireForScript} from '../../../util/require.mjs'
import {DEFAULT_DATA_RESOLVER, DEFAULT_SCRIPT, DEFAULT_STYLE, DEFAULT_TEMPLATE} from '../constants/cmsDefaults.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'
import {createMatchForCurrentUser} from '../../../api/util/dbquery.mjs'
import {parseOrElse} from '../../../client/util/json.mjs'
import {userHasAccessToObject} from '../../../api/util/access.mjs'


const createScopeForDataResolver = (query, _props) => {
    const queryParams = query ? ClientUtil.extractQueryParams(query) : {}
    const props = (_props ? JSON.parse(_props) : {})
    const scope = {params: queryParams, props}
    return scope
}


const setPageOptionsAsMeta = async (db, context, result)=>{
    const pageName = result.realSlug.split('/')[0]
    const pageOptions = await Util.keyValueGlobalMap(db, context, ['PageOptions-' + pageName], {parse: true})

    const meta = {
        PageOptions: pageOptions['PageOptions-' + pageName]
    }
    result.meta = JSON.stringify(meta)
}

const cmsPageStatus = {}, globalScope = {}

export default db => ({
    Query: {
        cmsPages: async ({limit, page, offset, filter, sort, _version}, {headers, context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const fields = ['public', 'slug', 'hostRule', 'name', 'author','keyword', 'description', 'urlSensitiv', 'parseResolvedData', 'alwaysLoadAssets', 'loadPageOptions', 'ssrStyle', 'uniqueStyle', 'publicEdit', 'compress', 'isTemplate','ownerGroup$[UserGroup]','disableRendering']

            if (filter) {

                const parsedFilter = Util.parseFilter(filter)
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
        cmsPage: async ({slug, query, props, nosession, editmode, dynamic, inEditor, meta, _version}, req) => {
            const startTime = (new Date()).getTime()
            const {context, headers} = req
            meta = parseOrElse(meta,{})

            let cmsPages = await getCmsPage({db, context, slug, _version, checkHostrules: !dynamic, inEditor, headers, editmode})
            //console.log(`get cms ${slug} in ${(new Date()).getTime() - startTime}ms`)
            if (!cmsPages.results || cmsPages.results.length === 0) {
                Hook.call('track404', {req, event: '404', slug, db, context, data: query, meta})
                throw new Error('Cms page doesn\'t exist')
            }

            const {
                _id, createdBy, template, script, style, resources, dataResolver, parseResolvedData, alwaysLoadAssets, loadPageOptions, ssrStyle, uniqueStyle, publicEdit, compress,
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

            const {resolvedData, subscriptions} = await resolveData({
                db,
                context,
                dataResolver,
                scope,
                nosession,
                req,
                editmode,
                dynamic
            })

            // access restrictions based on data resolver
            if(resolvedData.access ){
                if(resolvedData.access.read === false){
                    throw new Error('No access rights')
                }
                if(resolvedData.access.edit === false){
                    userCanPotentiallyChangePage = false
                }
            }

            let html
            if (ssr) {

                // Server side rendering
                try {
                    html = await renderReact({
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
                    html = e.message
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
                template,
                script,
                resources,
                style,
                html,
                publicEdit,
                resolvedData: JSON.stringify(resolvedData),
                parseResolvedData,
                alwaysLoadAssets,
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

            if (userCanPotentiallyChangePage) {
                // return data that the user needs to see the editor view completely. no sensitive data may be visible here
                result.name = name
                result.keyword = keyword
                result.description = description
                result.manual = manual

                if (!dynamic) {
                    const pageName = result.realSlug.split('/')[0]
                    const pageOptions = await Util.keyValueGlobalMap(db, context, ['PageOptionsDefinition-' + pageName, 'PageOptions-' + pageName], {parse: true})
                    const editorOptions = await Util.keyvalueMap(db, context, [settingKeyPrefix, settingKeyPrefix + '-' + result.realSlug], {parse: true})

                    const pageDataMeta = {
                        PageOptionsDefinition: pageOptions['PageOptionsDefinition-' + pageName],
                        PageOptions: pageOptions['PageOptions-' + pageName],
                        EditorPageOptions: editorOptions[settingKeyPrefix + '-' + result.realSlug],
                        EditorOptions: editorOptions[settingKeyPrefix]
                    }

                    result.meta = JSON.stringify(pageDataMeta)
                }else if( loadPageOptions ){
                    await setPageOptionsAsMeta()
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
            console.debug(`CMS: resolver for ${slug} got data in ${(new Date()).getTime() - startTime}ms`)

            if(meta === 'fetchMore' || meta.isFetchMore /* || meta.isRefetch*/){
                delete result.dataResolver
                delete result.serverScript
                delete result.manual
                delete result.template
                delete result.script
                delete result.style
                delete result.name
            }

            return result
        },
        cmsPageStatus: async ({slug}, req) => {
            if (!req.context.id) {
                return {user: null}
            }
            if (!cmsPageStatus[slug] || (new Date() - cmsPageStatus[slug].time) > 6000) {
                cmsPageStatus[slug] = {user: {username: req.context.username, _id: req.context.id}}
            }

            if (cmsPageStatus[slug].user._id === req.context.id) {
                cmsPageStatus[slug].time = new Date()
            }

            const data = {}
            if (Hook.hooks['cmsPageStatus'] && Hook.hooks['cmsPageStatus'].length) {
                let c = Hook.hooks['cmsPageStatus'].length
                for (let i = 0; i < Hook.hooks['cmsPageStatus'].length; ++i) {
                    await Hook.hooks['cmsPageStatus'][i].callback({db, slug, req, data})
                }
            }

            return {user: cmsPageStatus[slug].user, data: JSON.stringify(data)}
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
                if (script && script.error) {
                    result = {error: script.error}
                    Hook.call('ServerScriptError', {slug, methodName, args, error: script.error})
                    console.log(script.error)
                } else {
                    result = await script.result
                    if(result && result.error){
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
        updateCmsPage: async ({_id, _meta, slug, realSlug, query, props, createdBy, ownerGroup, ...rest}, req, options) => {
            const {context, headers} = req

            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_CMS_CONTENT)


            const {_version} = rest


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
        cmsCustomData: withFilter(() => pubsub.asyncIterableIterator('cmsCustomData'),
            (payload, context) => {
                return payload && payload.session === context.session //payload.userId === context.id
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


