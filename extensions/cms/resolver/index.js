import GenericResolver from 'api/resolver/generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from '../components/JsonDom'
import React from 'react'
import Util from 'api/util'
import ClientUtil from 'client/util'
import UtilCms from '../util'
import {UIProvider} from 'ui'
import {pubsub} from 'api/subscription'
import {DEFAULT_DATA_RESOLVER, DEFAULT_TEMPLATE, DEFAULT_SCRIPT, CAPABILITY_MANAGE_CMS_PAGES} from '../constants'
import Cache from 'util/cache'

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
            const data = await GenericResolver.entities(db, context, 'CmsPage', ['public', 'slug', 'hostRule', 'name', 'urlSensitiv'], {
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
        cmsPage: async ({slug, query, props, nosession, editmode, _version}, {context, headers}) => {
            const userIsLoggedIn = Util.isUserLoggedIn(context)
            const startTime = (new Date()).getTime()
            let cmsPages = await UtilCms.getCmsPage({db, context, slug, _version, headers, editmode})

            if (!cmsPages.results || cmsPages.results.length === 0) {
                throw new Error('Cms page doesn\'t exist')
            }
            const scope = {...createScopeForDataResolver(query, props), page: {slug}}
            const {_id, createdBy, template, script, resources, dataResolver, ssr, modifiedAt, urlSensitiv, name, serverScript} = cmsPages.results[0]
            const ispublic = cmsPages.results[0].public

            const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, dataResolver ? dataResolver.trim() : '', scope, nosession)
            let html
            if (ssr) {
                // Server side rendering
                // todo: ssr for apollo https://github.com/apollographql/apollo-client/blob/master/docs/source/recipes/server-side-rendering.md
                try {
                    global._app_ = {ssr: true}
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
                    dataResolver,
                    serverScript,
                    ssr,
                    public: ispublic, // if public the content is visible to everyone
                    online: _version === 'default',  // if true it is the active _version that is online
                    resolvedData: JSON.stringify(resolvedData),
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
                    html,
                    resolvedData: JSON.stringify(resolvedData),
                    subscriptions,
                    urlSensitiv,
                    cacheKey: clientCacheKey
                }

            }
        },
        cmsServerMethod: async ({slug, methodName, query, props, _version}, {context, headers}) => {
            const userIsLoggedIn = Util.isUserLoggedIn(context)
            const startTime = (new Date()).getTime()
            let cmsPages = await UtilCms.getCmsPage({db, context, slug, _version, headers})

            if (!cmsPages.results || cmsPages.results.length === 0) {
                throw new Error('Cms page doesn\'t exist')
            }

            const {serverScript} = cmsPages.results[0]

            return {result: 'sss'}
        }
    },
    Mutation: {
        createCmsPage: async ({slug, ...rest}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            if (!slug) slug = ''
            slug = encodeURI(slug.trim())

            return await GenericResolver.createEnity(db, context, 'CmsPage', {
                slug,
                ...rest,
                dataResolver: DEFAULT_DATA_RESOLVER,
                template: DEFAULT_TEMPLATE,
                script: DEFAULT_SCRIPT
            })
        },
        updateCmsPage: async ({_id, query, props, ...rest}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const {_version} = rest
            // clear server cache
            const cacheKey = 'cmsPage-' + (_version ? _version + '-' : '') + rest.slug

            Cache.clearStartWith(cacheKey)
            const result = await GenericResolver.updateEnity(db, context, 'CmsPage', {_id, ...rest})


            // if dataResolver has changed resolveData and return it
            if (rest.dataResolver) {
                const scope = createScopeForDataResolver(query)
                const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, rest.dataResolver, scope)

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
        cloneCmsPage: async (data, {context}) => {
            return GenericResolver.cloneEntity(db, context, 'CmsPage', data)
        }
    }
})


