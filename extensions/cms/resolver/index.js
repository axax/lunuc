import GenericResolver from 'api/resolver/generic/genericResolver'
import ReactDOMServer from 'react-dom/server';
import JsonDom from '../components/JsonDom'
import React from 'react'
import Util from 'api/util'
import ClientUtil from 'client/util'
import {getCmsPage} from '../util/cmsPage'
import {resolveData} from '../util/dataResolver'
import {pubsub} from 'api/subscription'
import {DEFAULT_DATA_RESOLVER, DEFAULT_TEMPLATE, DEFAULT_SCRIPT, DEFAULT_STYLE, CAPABILITY_MANAGE_CMS_PAGES} from '../constants'
import Cache from 'util/cache'
import {withFilter} from 'graphql-subscriptions'
import {getHostFromHeaders} from 'util/host'
import Hook from '../../../util/hook'
import {ObjectId} from "mongodb";
import {getStore} from '../../../client/store/index'
import {setGraphQlOptions} from '../../../client/middleware/graphql'
import {renderToString} from '../../../api/resolver/graphqlSsr'
import {Provider} from 'react-redux'
import {
    settingKeyPrefix
} from '../util/cmsView'


const PORT = (process.env.PORT || 3000)

const createScopeForDataResolver = (query, _props) => {
    const queryParams = query ? ClientUtil.extractQueryParams(query) : {}
    const props = (_props ? JSON.parse(_props) : {})
    const scope = {params: queryParams, props}
    return scope
}

const cmsPageStatus = {}, globalScope = {}

export default db => ({
    Query: {
        cmsPages: async ({limit, page, offset, filter, sort, _version}, {headers, context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const fields = ['public', 'slug', 'hostRule', 'name', 'urlSensitiv', 'parseResolvedData', 'alwaysLoadAssets', 'loadPageOptions', 'ssrStyle', 'publicEdit', 'compress', 'isTemplate']



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
            }

            const data = await GenericResolver.entities(db, context, 'CmsPage', fields, {
                limit,
                page,
                offset,
                filter,
                sort,
                _version
            })

            return data
        },
        cmsPage: async ({slug, query, props, nosession, editmode, dynamic, meta, _version}, req) => {
            const startTime = (new Date()).getTime()
            const {context, headers} = req

            const userIsLoggedIn = Util.isUserLoggedIn(context)
            let cmsPages = await getCmsPage({db, context, slug, _version, checkHostrules: !dynamic, headers, editmode})
            if (!cmsPages.results || cmsPages.results.length === 0) {

                Hook.call('trackUser', {req, event: '404', slug, db, context, data: query, meta})

                throw new Error('Cms page doesn\'t exist')
            }

            const {
                _id, createdBy, template, script, style, resources, dataResolver, parseResolvedData, alwaysLoadAssets, loadPageOptions, ssrStyle, publicEdit, compress,
                ssr, modifiedAt, urlSensitiv, name, serverScript
            } = cmsPages.results[0]
            const scope = {
                ...createScopeForDataResolver(query, props),
                page: {slug, host: getHostFromHeaders(headers), meta},
                editmode
            }
            const ispublic = cmsPages.results[0].public

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
            let html
            if (ssr) {

                // Server side rendering
                try {

                    const store = getStore()

                    const loc = {pathname: '', search: '', origin: ''}
                    if (req) {
                        const host = getHostFromHeaders(req.headers)
                        loc.origin = (req.isHttps ? 'https://' : 'http://') + host
                    }
                    window.location = globalThis.location = loc

                    setGraphQlOptions({url: 'http://localhost:' + PORT + '/graphql'})

                    html = await renderToString(<Provider store={store}>
                        <JsonDom template={template}
                                 script={script}
                                 style={style}
                                 location={loc}
                                 history={{location: loc}}
                                 slug="_ssr"
                                 resolvedData={JSON.stringify(resolvedData)}
                                 editMode={false}
                                 scope={JSON.stringify(scope)}/>
                    </Provider>)

                } catch (e) {
                    console.log(e)
                    html = e.message
                }
            }


            const result = {
                _id,
                modifiedAt,
                createdBy,
                ssr,
                public: ispublic,
                online: _version === 'default',
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
                compress,
                subscriptions,
                urlSensitiv,
                cacheKey: '' // todo: remove
            }


            const setPageOptions = async ()=>{
                const pageName = result.realSlug.split('/')[0]
                const pageOptions = await Util.keyValueGlobalMap(db, context, ['PageOptions-' + pageName], {parse: true})

                const meta = {
                    PageOptions: pageOptions['PageOptions-' + pageName]
                }
                result.meta = JSON.stringify(meta)
            }

            if (userIsLoggedIn && editmode) {
                // return all data if user is loggedin, and in editmode and has the capability to mange cms pages
                result.name = name

                if (!dynamic) {
                    const pageName = result.realSlug.split('/')[0]
                    const pageOptions = await Util.keyValueGlobalMap(db, context, ['PageOptionsDefinition-' + pageName, 'PageOptions-' + pageName], {parse: true})
                    const editorOptions = await Util.keyvalueMap(db, context, [settingKeyPrefix, settingKeyPrefix + '-' + result.realSlug], {parse: true})

                    const meta = {
                        PageOptionsDefinition: pageOptions['PageOptionsDefinition-' + pageName],
                        PageOptions: pageOptions['PageOptions-' + pageName],
                        EditorPageOptions: editorOptions[settingKeyPrefix + '-' + result.realSlug],
                        EditorOptions: editorOptions[settingKeyPrefix]
                    }

                    result.meta = JSON.stringify(meta)
                }else if( loadPageOptions ){
                    await setPageOptions()
                }

                if (await Util.userHasCapability(db, context, CAPABILITY_MANAGE_CMS_PAGES)) {
                    result.dataResolver = dataResolver
                    result.serverScript = serverScript
                }
            } else {

                // if user is not looged in return only slug and rendered html
                // never return sensitiv data here
                result.name = {[context.lang]: name[context.lang]}

                if( loadPageOptions ){
                    await setPageOptions()
                }
            }
            console.log(`cms resolver for ${slug} got data in ${(new Date()).getTime() - startTime}ms`)

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

            const {serverScript, dataResolver} = cmsPages.results[0]

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
            try {
                const script = await new Promise(resolve => {
                    const tpl = new Function(`
                    const require = this.require
                    const data = (async () => {
                        try{
                            ${serverScript}
                            let result = ${methodName}(this.args)
                            this.resolve({result: result})
                        }catch(error){                       
                            this.resolve({error})
                        }
                    })()`)

                    tpl.call({
                        args,
                        require,
                        resolve,
                        db,
                        __dirname,
                        context,
                        req,
                        GenericResolver,
                        ObjectId,
                        globalScope
                    })

                })
                if (script.error) {
                    result = {error: script.error}
                    console.log(script)
                } else {
                    result = await script.result
                }
            } catch (error) {
                console.log(error)
                result = {error: error.message}
            }

            if (result && result.constructor !== String) {
                result = JSON.stringify(result)
            }

            return {result}
        }
    },
    Mutation: {
        createCmsPage: async ({slug, ...rest}, req) => {
            Util.checkIfUserIsLoggedIn(req.context)
            if (!slug) slug = ''
            slug = encodeURI(slug.trim())

            return await GenericResolver.createEntity(db, req, 'CmsPage', {
                slug,
                ...rest,
                dataResolver: DEFAULT_DATA_RESOLVER,
                template: DEFAULT_TEMPLATE,
                script: DEFAULT_SCRIPT,
                style: DEFAULT_STYLE
            })
        },
        updateCmsPage: async ({_id, slug, realSlug, query, props, createdBy, ...rest}, req) => {
            const {context, headers} = req

            Util.checkIfUserIsLoggedIn(context)

            const {_version} = rest


            if (realSlug) {
                rest.slug = realSlug
            }else{
                rest.slug = slug
            }


            // clear server cache
            const cacheKey = 'cmsPage-' + (_version ? _version + '-' : '') + rest.slug


            Cache.clearStartWith(cacheKey)

            const result = await GenericResolver.updateEnity(db, context, 'CmsPage', {
                _id,
                createdBy: (createdBy ? ObjectId(createdBy) : createdBy), ...rest
            })

            result.slug = slug
            result.realSlug = rest.slug

            // if dataResolver has changed resolveData and return it
            if (rest.dataResolver) {
                const scope = {
                    ...createScopeForDataResolver(query, props),
                    page: {slug, realSlug: rest.slug, host: getHostFromHeaders(headers)}
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

            pubsub.publish('newNotification', {
                userId: context.id,
                newNotification: {
                    key: 'updateCmsPage',
                    message: `CMS Page ${_id} was successfully updated on ${new Date().toLocaleTimeString()}`
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
        cmsPageData: withFilter(() => pubsub.asyncIterator('cmsPageData'),
            (payload, context) => {
                return payload && payload.session === context.session //payload.userId === context.id
            }
        ),
        cmsCustomData: withFilter(() => pubsub.asyncIterator('cmsCustomData'),
            (payload, context) => {
                return payload && payload.session === context.session //payload.userId === context.id
            }
        )
    }
})


