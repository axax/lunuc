import Hook from '../../util/hook.cjs'
import {getTypeQueries} from 'util/types.mjs'
import config from 'gen/config-client'

/*
 Page view beacon (engagement + "visitor executes javascript" = human).

 Performance / compatibility rules:
 - starts only after the load event and when the browser is idle, adds no work before that
 - no layout reads at start, scroll depth is read at most every 500ms while scrolling
 - one navigator.sendBeacon per page view when the page is hidden / left (async, never blocks)
 - browsers without sendBeacon (IE, very old Safari) simply send nothing, the page works as before
 - everything is wrapped in try/catch, no cookies, no storage
*/
const BEACON_URL = '/graphql/tracking/beacon'
const MAX_VISIBLE_MS = 2 * 60 * 60 * 1000

const initBeacon = () => {
    if (typeof window === 'undefined' || (window._app_ && _app_.ssr)) return
    // only one beacon instance per page, even if this code runs more than once
    if (window.__lunucBeaconActive) return
    window.__lunucBeaconActive = true
    const nav = window.navigator
    if (!nav || typeof nav.sendBeacon !== 'function' || !window.addEventListener || !window.JSON) return
    // not in the admin and not inside an iframe (cms editor, previews)
    try {
        if (window.top !== window.self) return
    } catch (e) {
        return
    }

    const doc = document
    const adminBase = config.ADMIN_BASE_URL || '/admin'
    let state = null
    let lastScroll = 0

    const now = () => new Date().getTime()
    const isVisible = () => !doc.visibilityState || doc.visibilityState === 'visible'
    const randomId = () => Math.random().toString(36).substring(2, 10) + now().toString(36)

    const start = (navType) => {
        const path = location.pathname
        if (path === adminBase || path.indexOf(adminBase + '/') === 0) {
            state = null
            return
        }
        state = {pv: randomId(), path, nav: navType, visible: 0, since: isVisible() ? now() : 0, scroll: 0}
    }

    const pause = () => {
        if (state && state.since) {
            state.visible += now() - state.since
            state.since = 0
        }
    }

    const resume = () => {
        if (state && !state.since && isVisible()) {
            state.since = now()
        }
    }

    const measureScroll = () => {
        if (!state) return
        const el = doc.documentElement, body = doc.body
        const height = Math.max(el ? el.scrollHeight : 0, body ? body.scrollHeight : 0)
        const bottom = (window.pageYOffset || (el && el.scrollTop) || 0) + (window.innerHeight || (el && el.clientHeight) || 0)
        const percent = height > 0 ? Math.min(100, Math.round(bottom / height * 100)) : 100
        if (percent > state.scroll) state.scroll = percent
    }

    const send = () => {
        if (!state) return
        try {
            pause()
            measureScroll()
            const payload = JSON.stringify({
                pv: state.pv,
                p: state.path,
                n: state.nav,
                t: Math.min(state.visible, MAX_VISIBLE_MS),
                s: state.scroll,
                w: window.screen ? window.screen.width : 0,
                l: nav.language || ''
            })
            // nothing new since the last beacon of this page view (e.g. visibilitychange + pagehide,
            // quick tab switches): only again when at least one more second was visible or more was scrolled
            const key = Math.floor(state.visible / 1000) + '|' + state.scroll
            if (key === state.lastKey) return
            state.lastKey = key
            nav.sendBeacon(BEACON_URL, payload)
        } catch (e) {
        }
    }

    const onScroll = () => {
        const t = now()
        if (t - lastScroll > 500) {
            lastScroll = t
            measureScroll()
        }
    }

    const onVisibility = () => {
        if (doc.visibilityState === 'hidden') {
            // the same page view can be sent several times (tab switch), the server keeps the latest values
            send()
        } else {
            resume()
        }
    }

    start('load')
    window.addEventListener('scroll', onScroll, {passive: true})
    doc.addEventListener('visibilitychange', onVisibility)
    // old safari without visibilitychange on unload
    window.addEventListener('pagehide', send)

    // navigation inside the app: one listener per history object (Routes creates a new one when it mounts again)
    const onNavigate = () => {
        if (state && state.path === location.pathname) return
        send()
        start('spa')
    }
    const listened = []
    const listen = () => {
        const history = window._app_ && _app_.history
        if (!history || !history.listen || listened.indexOf(history) >= 0) return
        listened.push(history)
        history.listen(onNavigate)
    }
    listen()
    // keyed hook: registered only once, also if Routes mounts again later
    Hook.on('Routes.usertrackingBeacon', () => setTimeout(listen, 0))
}

const scheduleBeacon = () => {
    const run = () => {
        try {
            initBeacon()
        } catch (e) {
        }
    }
    const idle = () => {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(run, {timeout: 5000})
        } else {
            setTimeout(run, 1000)
        }
    }
    if (document.readyState === 'complete') {
        idle()
    } else {
        window.addEventListener('load', idle)
    }
}

export default () => {
    Hook.on('JsonDomUserEvent', ({event, payload, container}) => {
        if (payload._track) {
            const queries = getTypeQueries('UserTracking')
            container.props.clientQuery(queries.create, {
                variables: {
                    slug: container.props.slug,
                    data: JSON.stringify(payload._track.data),
                    event
                }
            })
        }
    })

    if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(window._app_ && _app_.ssr)) {
        scheduleBeacon()
    }
}
