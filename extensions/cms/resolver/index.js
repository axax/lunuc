import GenericResolver from 'api/resolver/generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from '../components/JsonDom'
import React from 'react'
import Util from 'api/util'
import ClientUtil from 'client/util'
import {getCmsPage} from '../util/cmsPage'
import {resolveData} from '../util/dataResolver'
import {UIProvider} from 'ui'
import {pubsub} from 'api/subscription'
import {DEFAULT_DATA_RESOLVER, DEFAULT_TEMPLATE, DEFAULT_SCRIPT, CAPABILITY_MANAGE_CMS_PAGES} from '../constants'
import Cache from 'util/cache'
import {withFilter} from 'graphql-subscriptions'
import {getHostFromHeaders} from 'util/host'
import Hook from "../../../util/hook";
import {ObjectId} from "mongodb";

const createScopeForDataResolver = (query, _props) => {
    const queryParams = query ? ClientUtil.extractQueryParams(query) : {}
    const props = (_props ? JSON.parse(_props) : {})
    const scope = {params: queryParams, props}
    return scope
}

const createClientCacheKey = (query, props) => {
    const cacheKey = (query ? query.replace(/#/g, '-') : '') + '#' + (props ? props.replace(/#/g, '-') : '')
    if (cacheKey !== '#') {
        return cacheKey
    }
    return ''
}

export default db => ({
    Query: {
        cmsPages: async ({limit, page, offset, filter, sort, _version}, {headers, context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const fields = ['public', 'slug', 'hostRule', 'name', 'urlSensitiv', 'parseResolvedData', 'alwaysLoadAssets','compress']
            if (filter) {
                // search in fields
                fields.push('dataResolver')
                fields.push('script')
                fields.push('serverScript')
                fields.push('template')
            }

            const data = await GenericResolver.entities(db, context, 'CmsPage', fields, {
                limit,
                page,
                offset,
                filter,
                sort,
                _version
            })

            // add client cache key
            const clientCacheKey = createClientCacheKey(null, null)

            if (data.results) {
                data.results.forEach(page => {
                    page.cacheKey = clientCacheKey
                })
            }
            return data
        },
        cmsPage: async ({slug, query, props, nosession, editmode, _version}, req) => {
            const {context, headers} = req

            const userIsLoggedIn = Util.isUserLoggedIn(context)
            const startTime = (new Date()).getTime()
            let cmsPages = await getCmsPage({db, context, slug, _version, headers, editmode})

            if (!cmsPages.results || cmsPages.results.length === 0) {

                Hook.call('trackUser', {req, event: '404', slug, db, context, data:query} )

                throw new Error('Cms page doesn\'t exist')
            }
            const scope = {...createScopeForDataResolver(query, props), page: {slug, host: getHostFromHeaders(headers)}, editmode}
            const {_id, createdBy, template, script, style, resources, dataResolver, parseResolvedData,alwaysLoadAssets,compress,
                ssr, modifiedAt, urlSensitiv, name, serverScript} = cmsPages.results[0]
            const ispublic = cmsPages.results[0].public

            const {resolvedData, subscriptions} = await resolveData({
                db,
                context,
                dataResolver,
                scope,
                nosession,
                req,
                editmode
            })
            let html
            if (ssr) {
                // Server side rendering
                // todo: ssr for apollo https://github.com/apollographql/apollo-client/blob/master/docs/source/recipes/server-side-rendering.md
                try {
                    html = ReactDOMServer.renderToString(<UIProvider>
                        <JsonDom template={template}
                                 script={script}
                                 resolvedData={JSON.stringify(resolvedData)}
                                 editMode={false}
                                 scope={JSON.stringify(scope)}/>
                    </UIProvider>)
                } catch (e) {
                    html = e.message
                }
            }
            console.log(`cms resolver for ${slug} got data in ${(new Date()).getTime() - startTime}ms`)

            // this is used to locate the proper client cache value
            const clientCacheKey = createClientCacheKey(urlSensitiv && query ? query : null, props)

            if (userIsLoggedIn && editmode && await Util.userHasCapability(db, context, CAPABILITY_MANAGE_CMS_PAGES)) {
                // return all data if user is loggedin, and in editmode and has the capability to mange cms pages
                return {
                    _id,
                    modifiedAt,
                    createdBy,
                    slug,
                    name,
                    template,
                    script,
                    resources,
                    style,
                    dataResolver,
                    serverScript,
                    ssr,
                    public: ispublic, // if public the content is visible to everyone
                    online: _version === 'default',  // if true it is the active _version that is online
                    resolvedData: JSON.stringify(resolvedData),
                    parseResolvedData,
                    alwaysLoadAssets,
                    compress,
                    html,
                    subscriptions,
                    urlSensitiv,
                    /* we return a cacheKey here because the resolvedData may be dependent on the query that gets passed.
                     that leads to ambiguous results for the same id.
                     */
                    cacheKey: clientCacheKey,
                    /* Return the current user settings of the view
                     */
                    settings: ''
                }
            } else {

                // if user is not looged in return only slug and rendered html
                // never return sensitiv data here
                return {
                    _id,
                    modifiedAt,
                    createdBy,
                    ssr,
                    public: ispublic,
                    online: _version === 'default',
                    slug,
                    name,
                    template,
                    script,
                    resources,
                    style,
                    html,
                    resolvedData: JSON.stringify(resolvedData),
                    parseResolvedData,
                    alwaysLoadAssets,
                    compress,
                    subscriptions,
                    urlSensitiv,
                    cacheKey: clientCacheKey
                }

            }
        },
        cmsServerMethod: async ({slug, methodName, args, query, props, _version}, req) => {
            const {context, headers} = req
            const startTime = (new Date()).getTime()
            let cmsPages = await getCmsPage({db, context, slug, _version, headers})

            if (!cmsPages.results || cmsPages.results.length === 0) {
                throw new Error('Cms page doesn\'t exist')
            }

            const {serverScript} = cmsPages.results[0]

            if (args) {
                try {
                    args = JSON.parse(args)
                } catch (e) {

                }
            }

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

                    tpl.call({args, require, resolve, db, __dirname, context, req, GenericResolver, ObjectId})

                })
                result = await script.result
            } catch (error) {
                result = {error: error.message}
            }

            if( result && result.constructor !== String){
                result= JSON.stringify(result)
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
                script: DEFAULT_SCRIPT
            })
        },
        updateCmsPage: async ({_id, query, props, createdBy, ...rest}, req) => {
            const {context, headers} = req

            Util.checkIfUserIsLoggedIn(context)

            const {_version} = rest
            // clear server cache
            const cacheKey = 'cmsPage-' + (_version ? _version + '-' : '') + rest.slug

            Cache.clearStartWith(cacheKey)
            const result = await GenericResolver.updateEnity(db, context, 'CmsPage', {_id,createdBy:(createdBy?ObjectId(createdBy):createdBy), ...rest})


            // if dataResolver has changed resolveData and return it
            if (rest.dataResolver) {
                const scope = {...createScopeForDataResolver(query, props), page: {slug: rest.slug, host: getHostFromHeaders(headers)}}
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

            // this is used to locate the proper client cache value
            result.cacheKey = createClientCacheKey(query, props)

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


