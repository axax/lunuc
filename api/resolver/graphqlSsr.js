import ReactDOMServer from 'react-dom/server'
import {SSR_FETCH_CHAIN, finalFetch} from '../../client/middleware/graphql'

export const renderToString = (component, context) => {

    return new Promise(async (resolve) => {


        const backupLang = _app_.lang

        try {
            const lang = (context && context.lang ? context.lang : _app_.lang)
            // set global lang temporarily
            _app_.lang = lang
            await ReactDOMServer.renderToStaticMarkup(component)
            _app_.lang = backupLang

            const keys = Object.keys(SSR_FETCH_CHAIN)
            if (keys.length > 0) {
                for (let i = keys.length - 1; i >= 0; i--) {
                    const cacheKey = keys[i]
                    const res = await finalFetch({
                        cacheKey, ...SSR_FETCH_CHAIN[cacheKey],
                        fetchPolicy: 'network-only',
                        lang
                    })

                }
            }
            _app_.lang = lang
            resolve(await ReactDOMServer.renderToString(component))


        }catch (e) {
            console.log(e)
        }
        _app_.lang = backupLang
    })
}
