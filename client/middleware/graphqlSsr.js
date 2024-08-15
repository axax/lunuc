import ReactDOMServer from 'react-dom/server'
import {SSR_FETCH_CHAIN, finalFetch} from './graphql'
import JsonDom from '../../extensions/cms/components/JsonDom'
import App from '../components/App'
import React from 'react'

const renderToCollectFetchRec = async (component, context)=>{
    // set global lang temporarily
    const backupLang = _app_.lang
    const lang = (context && context.lang ? context.lang : _app_.lang)
    console.log('renderToCollectFetchRec',lang)
    _app_.lang = lang
    ReactDOMServer.renderToStaticMarkup(component)

    const keys = Object.keys(SSR_FETCH_CHAIN)
    if (keys.length > 0) {
        for (let i = keys.length - 1; i >= 0; i--) {
            const cacheKey = keys[i]
            const res = await finalFetch({
                cacheKey, ...SSR_FETCH_CHAIN[cacheKey],
                fetchPolicy: 'network-only',
                lang,
                headersExtra: {Cookie:`auth=${context.auth}`}
            })
            delete SSR_FETCH_CHAIN[cacheKey]
            if(res?.data?.cmsPage?.template && res?.data?.cmsPage?.template.indexOf('"t":"Cms"')>=0){
                const {template, script, style, slug, resolvedData} = res?.data?.cmsPage
                await renderToCollectFetchRec(
                    <App>
                        <JsonDom template={template}
                                 script={script}
                                 style={style}
                                 location={window.location}
                                 history={{location: window.location}}
                                 slug={slug}
                                 user={{isAuthenticated:!!context.id, userData:{}}}
                                 _props={undefined}
                                 scope={undefined}
                                 resolvedData={resolvedData}
                                 editMode={false}/>
                    </App>,context
                )
            }
        }
    }
    _app_.lang = backupLang
}

export const renderToString = (component, context) => {
console.log('renderToString', context)
    return new Promise(async (resolve) => {

        const backupLang = _app_.lang
        try {
            await renderToCollectFetchRec(component, context)

            const lang = (context && context.lang ? context.lang : _app_.lang)
            _app_.lang = lang
            resolve(ReactDOMServer.renderToString(component))

        }catch (e) {
            console.log(e)
        }

        _app_.lang = backupLang
    })
}
