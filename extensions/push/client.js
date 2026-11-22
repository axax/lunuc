import {isSupported, isSubscribed} from './util/pushShared'

/* web push, generic: see util/pushClient.js (browser) and util/push.mjs (sending)

 Only this facade is in the main bundle. The sync methods are answered here, the async ones load
 util/pushClient.js (chunk "push", uses async/await) on the first call and pass it on - the api of
 _app_.push stays the same (they all return a promise anyway).
*/
let loading
const load = () => loading || (loading = import(/* webpackChunkName: "push" */ './util/pushClient').then(m => m.default).catch(e => {
    // e.g. offline -> try again with the next call
    loading = null
    throw e
}))
const lazyMethod = name => (...args) => load().then(p => p[name](...args))

const push = {
    isSupported,
    isSubscribed,
    getStatus: lazyMethod('getStatus'),
    subscribe: lazyMethod('subscribe'),
    setSettings: lazyMethod('setSettings'),
    unsubscribe: lazyMethod('unsubscribe'),
    test: lazyMethod('test')
}

/* a click on a notification: the service worker asks the open window to navigate (no page reload) */
const initPushClient = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.serviceWorker) return
    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data
        if (data && data.type === 'lunuc-push-navigate' && typeof data.url === 'string' && data.url[0] === '/' && data.url[1] !== '/') {
            // the page shown may handle it itself (e.g. system/llm opens the chat): preventDefault()
            const event = new CustomEvent('lunucpushnavigate', {detail: {url: data.url}, cancelable: true})
            if (!window.dispatchEvent(event)) return
            const target = new URL(data.url, location.origin)
            if (target.pathname !== location.pathname || !_app_.history || !_app_.history.push) {
                location.href = data.url
            } else {
                _app_.history.push(data.url)
            }
        }
    })
}

export default () => {
    if (typeof _app_ !== 'undefined' && !_app_.ssr) {
        _app_.push = push
        initPushClient()
    }
}
