import ReactDOMServer from 'react-dom/server'
import {SSR_FETCH_CHAIN, finalFetch} from '../../client/middleware/graphql'

export const renderToString = (component, context) => {

    return new Promise(async (resolve) => {
        await ReactDOMServer.renderToStaticMarkup(component)

        const keys = Object.keys(SSR_FETCH_CHAIN)
        if (keys.length > 0) {
            for (let i = keys.length - 1; i >= 0; i--) {
                const cacheKey = keys[i]
                const res = await finalFetch({
                    cacheKey, ...SSR_FETCH_CHAIN[cacheKey],
                    fetchPolicy: 'network-only',
                    lang: (context && context.lang ? context.lang : null)
                })

            }
        }


        resolve(await ReactDOMServer.renderToString(component))

    })
}
