import Hook from '../../util/hook.cjs'
import {getTypeQueries} from 'util/types.mjs'

// The page view beacon (./beacon.js) is loaded on demand: it only starts after the load event when
// the browser is idle, so it does not need to be part of the main bundle.
const scheduleBeacon = () => {
    const run = () => {
        import(/* webpackChunkName: "beacon" */ './beacon.js').then(m => m.default()).catch(() => {
            // e.g. chunk could not be loaded (offline) -> no beacon for this page view
        })
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
