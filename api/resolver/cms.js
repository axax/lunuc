import GenericResolver from './generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from 'client/components/JsonDom'
import React from 'react'
import Util from '../util'
import UtilCms from '../util/cms'
import {UIProvider} from 'ui'

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

const defaultScript = ``


export const cmsResolver = (db) => ({
    cmsPages: async ({limit, offset}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver'], {
            limit,
            offset
        })
    },
    cmsPage: async ({slug}, {context}) => {
        const cmsPages = await GenericResolver.entities(db, context, 'CmsPage', ['slug', 'template', 'script', 'dataResolver','ssr'], {match: {slug}})

        if (cmsPages.results.length == 0) {
            throw new Error('Cms page doesn\'t exist')
        }

        const {_id, createdBy, template, script, dataResolver,ssr} = cmsPages.results[0]

        const resolvedData = await UtilCms.resolveData(db, context, dataResolver)
        let html

        if (ssr) {
            // Server side rendering
            // todo: ssr for apollo https://github.com/apollographql/apollo-client/blob/master/docs/source/recipes/server-side-rendering.md

            try {
                const scriptResult = new Function(script)();
                const scope = {page: {slug}, script:scriptResult, data: resolvedData}

                html = ReactDOMServer.renderToString(<UIProvider><JsonDom template={template} scope={JSON.stringify(scope)}/></UIProvider>)
            } catch (e) {
                html = e.message
            }
            console.log(html)
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
                html
            }
        } else {
            // if user is not looged in return only slug and rendered html
            return {
                ssr,
                slug,
                template,
                script,
                html,
                resolvedData: JSON.stringify(resolvedData)
            }
        }

    },
    createCmsPage: async ({slug}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        if (!slug || slug.trim() === '') {
            throw new Error('Slug is empty or invalid')
        }
        return await GenericResolver.createEnity(db, context, 'CmsPage', {slug,dataResolver:defaultDataResolver,template:defaultTemplate,script:defaultScript})
    },
    updateCmsPage: async ({_id, ...rest}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        const result =  await GenericResolver.updateEnity(db, context, 'CmsPage', {_id, ...rest})

        // if dataResolver has changed resolveData and return it
        if( rest.dataResolver ) {
            result.resolvedData = JSON.stringify(await UtilCms.resolveData(db, context, rest.dataResolver))
        }

        return result
    },
    deleteCmsPage: async ({_id}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return GenericResolver.deleteEnity(db, context, 'CmsPage', {_id})
    }
})


