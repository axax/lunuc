import React from 'react'
import ReactDOMServer from 'react-dom/server'
import {UIProvider} from 'ui'
import JsonDom from './components/JsonDom'
import genSchema from './gensrc/schema'
import schema from './schema'
import resolver from './resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import {
    CAPABILITY_MANAGE_CMS_PAGES
} from './constants'
import {getCmsPage} from './util/cmsPage'
import {resolveData} from './util/dataResolver'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
    schemas.push(genSchema)
})

// Hook to add or modify user roles
Hook.on('createUserRoles', ({userRoles}) => {
    userRoles.forEach(userRole => {
        if (['administrator', 'contributor', 'demo'].indexOf(userRole.name) >= 0) {
            console.log(`Add capability "${CAPABILITY_MANAGE_CMS_PAGES}" for user role "${userRole.name}"`)
            userRole.capabilities.push(CAPABILITY_MANAGE_CMS_PAGES)
        }
    })
})

Hook.on('cmsTemplateRenderer', async ({db, context, body, slug}) => {

    let cmsPages = await getCmsPage({db, context, slug})
    if (!cmsPages.results) {
        throw new Error(`Template ${slug} doesn't exist`)
    }
    let scopeContext
    try {
        scopeContext = JSON.parse(body)
    } catch (e) {
        throw new Error(`Error in body: ${e.message}`)
        scopeContext = {}
    }
    const scope = {context: scopeContext, page: {slug}}

    const {template, script, dataResolver} = cmsPages.results[0]
    const {resolvedData} = await resolveData(db, context, dataResolver ? dataResolver.trim() : '', scope)
    try {
        return ReactDOMServer.renderToString(<UIProvider>
            <JsonDom template={template}
                     script={script}
                     resolvedData={JSON.stringify(resolvedData)}
                     editMode={false}
                     scope={JSON.stringify(scope)}/>
        </UIProvider>)
    } catch (e) {
        throw new Error(`Error in template: ${e.message}`)
    }
    return body

})
