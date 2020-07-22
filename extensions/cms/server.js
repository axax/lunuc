import React from 'react'
import JsonDom from './components/JsonDom'
import genSchema from './gensrc/schema'
import schema from './schema'
import resolver from './resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_CONTENT,
    CAPABILITY_MANAGE_CMS_TEMPLATE
} from './constants'
import {getCmsPage} from './util/cmsPage'
import {resolveData} from './util/dataResolver'
import {
    InMemoryCache,
    createHttpLink,
    ApolloProvider,
    ApolloClient
} from '@apollo/client'
import configureStore from '../../client/store/index'
import {Provider} from 'react-redux'
import {renderToStringWithData} from '@apollo/client/react/ssr'
import {getHostFromHeaders} from '../../util/host'

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

    let cmsPages = await getCmsPage({db, context, slug, checkHostrules: false})
    if (!cmsPages.results) {
        throw new Error(`Template ${slug} doesn't exist`)
    }
    let mailContext
    try {
        mailContext = JSON.parse(body)
    } catch (e) {
        throw new Error(`Error in body: ${e.message}`)
        mailContext = {}
    }
    const scope = {page: {slug}}
    const {template, script, dataResolver, style} = cmsPages.results[0]
    const {resolvedData} = await resolveData({db, context, dataResolver, scope})


    console.log('sendmail', mailContext)
    try {
        const client = new ApolloClient({
            ssrMode: true,
            // Remember that this is the interface the SSR server will use to connect to the
            // API server, so we need to ensure it isn't firewalled, etc
            link: createHttpLink({
                uri: 'http://localhost:' + PORT + '/graphql',
                credentials: 'same-origin'
            }),
            cache: new InMemoryCache()
        })

        const {store} = configureStore()

        const loc = {pathname: '', search:'', origin: ''}
        if( req){
            const host = getHostFromHeaders(req.headers)
            loc.origin = req.isHttps ? 'https://' : 'http://' + host
        }
        console.log(req, loc)
        window.location = globalThis.location = loc

        return await renderToStringWithData(
            <Provider store={store}>
                <ApolloProvider client={client}>
                    <JsonDom template={template}
                             script={script}
                             style={style}
                             location={loc}
                             history={{location:loc}}
                             slug={slug}
                             _props={{context: mailContext}}
                             resolvedData={JSON.stringify(resolvedData)}
                             editMode={false}/>
                </ApolloProvider>
            </Provider>)
    } catch (e) {
        throw new Error(`Error in template: ${e.message}`)
    }
    return body

})
