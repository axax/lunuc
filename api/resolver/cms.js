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
        "c":"Word",
        "f":["de","en"],
        "l":20,
        "o":0
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
    cmsPages: async ({limit, offset}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return await GenericResolver.entities(db, context, 'CmsPage', ['public', 'slug'], {
            limit,
            offset
        })
    },
    cmsPage: async ({slug, query}, {context}) => {
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
            cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver', 'ssr', 'public'], {match})
            Cache.set(cacheKey, cmsPages)
        }


        if (!cmsPages.results) {
            throw new Error('Cms page doesn\'t exist')
        }
        const scope = {...createScopeForDataResolver(query), page: {slug}}

        const {_id, createdBy, template, script, dataResolver, ssr} = cmsPages.results[0]
        const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, dataResolver, scope)
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
        console.log(`cms resolver got data in ${(new Date()).getTime() - startTime}ms`)

        if (userIsLoggedIn) {
            // return all data
            return {
                _id,
                createdBy,
                slug,
                template,
                script,
                dataResolver,
                ssr,
                resolvedData: JSON.stringify(resolvedData),
                html,
                subscriptions
            }
        } else {

            // if user is not looged in return only slug and rendered html
            // never return sensitiv data here
            return {
                _id,
                createdBy,
                ssr,
                slug,
                template,
                script,
                html,
                resolvedData: JSON.stringify(resolvedData),
                subscriptions
            }

        }

    },
    createCmsPage: async ({slug}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        slug = encodeURIComponent(slug.trim())

        return await GenericResolver.createEnity(db, context, 'CmsPage', {
            slug,
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
    deleteCmsPage: async ({_id}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return GenericResolver.deleteEnity(db, context, 'CmsPage', {_id})
    }
})


