import {renderToString} from '../../api/resolver/graphqlSsr.js'
import {Provider} from 'react-redux'
import JsonDom from './components/JsonDom.js'
import React from 'react'
import {getStore} from '../../client/store/index.js'
import {getHostFromHeaders} from '../../util/host.mjs'
import {setGraphQlOptions} from '../../client/middleware/graphql.js'

const PORT = (process.env.PORT || 8080)

const renderReact = async ({
                               req,
                               template,
                               scope,
                               script,
                               style,
                               slug,
                               mailContext,
                               resolvedData,
                               context
                           }) => {

    const store = getStore()

    const loc = {pathname: '', search: '', origin: ''}
    if (req) {
        const host = getHostFromHeaders(req.headers)
        loc.origin = (req.isHttps ? 'https://' : 'http://') + (host === 'localhost' ? host + ':8080' : host)
    } else {
        console.warn('request is missing')
    }
    window.location = globalThis.location = loc

    setGraphQlOptions({url: 'http://localhost:' + PORT + '/graphql'})

    return await renderToString(<Provider store={store}>
        <JsonDom template={template}
                 script={script}
                 style={style}
                 location={loc}
                 history={{location: loc}}
                 slug={slug}
                 _props={mailContext?{context: mailContext}:undefined}
                 scope={scope?JSON.stringify(scope):undefined}
                 resolvedData={JSON.stringify(resolvedData)}
                 editMode={false}/>
    </Provider>, context)
}

export default renderReact
