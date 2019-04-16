import GenericResolver from 'api/resolver/generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from '../components/JsonDom'
import React from 'react'
import Util from 'api/util'
import ClientUtil from 'client/util'
import UtilCms from '../util'
import {UIProvider} from 'ui'
import {pubsub} from 'api/subscription'
import {DEFAULT_DATA_RESOLVER, DEFAULT_TEMPLATE, DEFAULT_SCRIPT} from '../constants'
import Cache from 'util/cache'

const createScopeForDataResolver = function (query , _props) {
    const queryParams = query ? ClientUtil.extractQueryParams(query) : {}
    const props =  (_props ? JSON.parse(_props) : {})
    const scope = {params: queryParams, props}
    return scope
}

export default db => ({
    Query: {
        cmsPages: async ({limit, page, offset, filter, sort, _version}, {headers, context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return await GenericResolver.entities(db, context, 'CmsPage', ['public', 'slug', 'hostRule', 'name', 'urlSensitiv'], {
                limit,
                page,
                offset,
                filter,
                sort,
                _version
            })
        },
        cmsPage: async ({slug, query, props, nosession, _version}, {context, headers}) => {
            // TODO: Not just check if user is logged in but also check what role he has
            const userIsLoggedIn = Util.isUserLoggedIn(context)
            const startTime = (new Date()).getTime()
            let cmsPages = await UtilCms.getCmsPage({db, context, slug, _version, headers})

            if (!cmsPages.results || cmsPages.results.length === 0) {
                throw new Error('Cms page doesn\'t exist')
            }
            const scope = {...createScopeForDataResolver(query, props), page: {slug}}
            const {_id, createdBy, template, script, resources, dataResolver, ssr, modifiedAt, urlSensitiv, name} = cmsPages.results[0]
            const ispublic = cmsPages.results[0].public
            const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, dataResolver ? dataResolver.trim() : '', scope, nosession)
            let html
            if (ssr) {
                // Server side rendering
                // todo: ssr for apollo https://github.com/apollographql/apollo-client/blob/master/docs/source/recipes/server-side-rendering.md
                try {
                    global._app_ = {}
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

            const apolloCacheKey = (query ? query + '#' : '') + (_version && _version !== 'default' ? _version : '')
            if (userIsLoggedIn) {
                // return all data
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
                    cacheKey: apolloCacheKey,
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
                    cacheKey: apolloCacheKey
                }

            }

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
        updateCmsPage: async ({_id, query, ...rest}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            // clear cache
            const cacheKey = 'cmsPage-' + rest._version + '-' + rest.slug
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


