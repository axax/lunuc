import GenericResolver from './generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from 'client/components/JsonDom'
import React from 'react'
import Util from '../util'
import ClientUtil from 'client/util'
import UtilCms from '../util/cms'
import {UIProvider} from 'ui'
import {pubsub} from '../subscription'
import Cache from 'util/cache'

const defaultDataResolver = `[
  {
    "t": "$Word",
    "d": [
      "en",
      "de",
      "it",
      {
        "categories": [
          "name",
          "_id"
        ]
      }
    ],
    "l": 20,
    "o": 0
  }
]`


const defaultTemplate = `[
    {
        "t": "div",
        "p": {},
        "c": [
            {
                "t": "h1$",
                "c": "Words"
            },
            {
                "t": "Row",
                "c": [
                    {
                        "$loop": {
                            "s": "x",
                            "$d": "data.Word.results",
                            "c": [
                                {
                                    "t": "Col",
                                    "p": {
                                        "md": 3
                                    },
                                    "c": [
                                        {
                                            "t": "p",
                                            "c": "$.x{de} = $.x{en}"
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
]`

const defaultScript = `// 1. access scope data
// scope.page.slug
// scope.data
// 2. handle events
// on('click',(payload)=>{console.log})

`


let createScopeForDataResolver = function (query) {
    const queryParams = query ? ClientUtil.extractQueryParams(query) : {}
    const scope = {params: queryParams}
    return scope
}

export const cmsResolver = (db) => ({
    cmsPages: async ({limit, page, offset, filter, sort, version}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return await GenericResolver.entities(db, context, 'CmsPage', ['public', 'slug', 'urlSensitiv'], {
            limit,
            page,
            offset,
            filter,
            sort,
            version
        })
    },
    cmsPage: async ({slug, query, nosession, version}, {context}) => {
        // TODO: Not just check if user is logged in but also check what role he has
        const userIsLoggedIn = Util.isUserLoggedIn(context)

        const startTime = (new Date()).getTime()
        let cmsPages
        const cacheKey = 'cmsPage' + slug
        if (!userIsLoggedIn) {
            // get page from cache
            cmsPages = Cache.get(cacheKey)
        }
        if (!cmsPages) {
            let match
            if (!userIsLoggedIn) {
                // if no user only match public entries
                match = {$and: [{slug}, {public: true}]}
            } else {
                match = {slug}
            }
            cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver', 'ssr', 'public', 'urlSensitiv'], {match, version})

            // minify template if no user is logged in
            if (!userIsLoggedIn && cmsPages.results && cmsPages.results.length) {

                // TODO: maybe it is better to store the template already minified in the collection instead of minify it here
                cmsPages.results[0].template = JSON.stringify(JSON.parse(cmsPages.results[0].template), null, 0)
            }
            Cache.set(cacheKey, cmsPages, 60000) // cache expires in 1 min
        }

        if (!cmsPages.results) {
            throw new Error('Cms page doesn\'t exist')
        }
        const scope = {...createScopeForDataResolver(query), page: {slug}}

        const {_id, createdBy, template, script, dataResolver, ssr, modifiedAt, urlSensitiv} = cmsPages.results[0]
        const ispublic = cmsPages.results[0].public
        const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, dataResolver.trim(), scope, nosession)
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

        if (userIsLoggedIn) {
            // return all data
            return {
                _id,
                modifiedAt,
                createdBy,
                slug,
                template,
                script,
                dataResolver,
                ssr,
                public: ispublic, // if public the content is visible to everyone
                online: true,  // if true it is the active version that is online
                resolvedData: JSON.stringify(resolvedData),
                html,
                subscriptions,
                urlSensitiv,
                /* we return a cacheKey here because the resolvedData may be dependent on the query that gets passed.
                 that leads to ambiguous results for the same id.
                 */
                cacheKey: query,
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
                online: true,
                slug,
                template,
                script,
                html,
                resolvedData: JSON.stringify(resolvedData),
                subscriptions,
                urlSensitiv,
                cacheKey: query
            }

        }

    },
    createCmsPage: async ({slug, ...rest}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        slug = encodeURIComponent(slug.trim())

        return await GenericResolver.createEnity(db, context, 'CmsPage', {
            slug,
            ...rest,
            dataResolver: defaultDataResolver,
            template: defaultTemplate,
            script: defaultScript
        })
    },
    updateCmsPage: async ({_id, query, ...rest}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)

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
})


