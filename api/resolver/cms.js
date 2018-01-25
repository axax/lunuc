import GenericResolver from './generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from 'client/components/JsonDom'
import React from 'react'
import Util from '../util'
import ClientUtil from 'client/util'
import UtilCms from '../util/cms'
import {UIProvider} from 'ui'
import {pubsub} from '../subscription'

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


export const cmsResolver = (db) => ({
    cmsPages: async ({limit, offset}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver'], {
            limit,
            offset
        })
    },
    cmsPage: async ({slug, query}, {context}) => {
        const cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver', 'ssr'], {match: {slug}})

        if (cmsPages.results.length == 0) {
            throw new Error('Cms page doesn\'t exist')
        }
console.log(query)
        const {_id, createdBy, template, script, dataResolver, ssr} = cmsPages.results[0]
        const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, dataResolver)
        let html

        if (ssr) {
            // Server side rendering
            // todo: ssr for apollo https://github.com/apollographql/apollo-client/blob/master/docs/source/recipes/server-side-rendering.md

            try {
                const scope = {page: {slug},params: ClientUtil.extractQueryParams(query)}

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
        if (Util.isUserLoggedIn(context)) {
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
    updateCmsPage: async ({_id, ...rest}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        const result = await GenericResolver.updateEnity(db, context, 'CmsPage', {_id, ...rest})

        // if dataResolver has changed resolveData and return it
        if (rest.dataResolver) {
            const {resolvedData, subscriptions} = await UtilCms.resolveData(db, context, rest.dataResolver)

            result.resolvedData = JSON.stringify(resolvedData)
            result.subscriptions = subscriptions
        }

        pubsub.publish('newNotification', {userId: context.id,
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


