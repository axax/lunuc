import genSchema from './gensrc/schema.mjs'
import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_CONTENT,
    CAPABILITY_MANAGE_CMS_TEMPLATE
} from './constants/index.mjs'
import renderReact from './renderReact.mjs'
import {getCmsPage} from './util/cmsPage.mjs'
import {resolveData} from './util/dataResolver.mjs'

const PORT = (process.env.PORT || 3000)

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
        if (['administrator', 'editor', 'demo'].indexOf(userRole.name) >= 0) {
            console.log(`Add capabilities "${CAPABILITY_MANAGE_CMS_PAGES}",${CAPABILITY_MANAGE_CMS_TEMPLATE} and ${CAPABILITY_MANAGE_CMS_CONTENT} for user role "${userRole.name}"`)
            userRole.capabilities.push(CAPABILITY_MANAGE_CMS_PAGES, CAPABILITY_MANAGE_CMS_CONTENT, CAPABILITY_MANAGE_CMS_TEMPLATE)
        }else if( userRole.name === 'author'){
            console.log(`Add capability ${CAPABILITY_MANAGE_CMS_CONTENT} and ${CAPABILITY_MANAGE_CMS_PAGES} for user role "${userRole.name}"`)
            userRole.capabilities.push(CAPABILITY_MANAGE_CMS_CONTENT, CAPABILITY_MANAGE_CMS_PAGES)
        }else if( userRole.name === 'contributor'){
            console.log(`Add capability ${CAPABILITY_MANAGE_CMS_CONTENT} for user role "${userRole.name}"`)
            userRole.capabilities.push(CAPABILITY_MANAGE_CMS_CONTENT)
        }
    })
})


Hook.on('cmsTemplateRenderer', async ({db, context, body, slug, req}) => {
    let cmsPages = await getCmsPage({db, context, slug, checkHostrules: false, ignorePublicState: true})
    if (!cmsPages.results || cmsPages.results.length === 0) {
        throw new Error(`Template ${slug} doesn't exist`)
    }
    let mailContext = {}
    if( body ) {
        if(body.constructor === Object){
            mailContext = body
        }else {
            try {
                mailContext = JSON.parse(body)
            } catch (e) {
                throw new Error(`Error in body: ${e.message}`)
                mailContext = {}
            }
        }
    }
    const scope = {page: {slug, lang: context.lang}, props: {context:mailContext}}
    const {template, script, dataResolver, style} = cmsPages.results[0]
    const {resolvedData} = await resolveData({db, context, req, dataResolver, scope})

    try {
        return await renderReact({
            req,
            template,
            script,
            style,
            slug,
            mailContext,
            resolvedData,
            context
        })
    } catch (e) {
        throw new Error(`Error in template: ${e.message}`)
    }
    return body

})
