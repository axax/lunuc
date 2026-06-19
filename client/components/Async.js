import React from 'react'
import Hook from '../../util/hook.cjs'
import {unregisterAllServiceworker} from '../util/serviceWorkerUtil.mjs'

// Retry a dynamic import a few times before giving up — handles transient
// network failures and chunks that briefly 404 during a deploy window.
// Only retries when `load` is passed as a factory: load={() => import('...')}
const retryImport = (factory, retries = 2, delay = 400) =>
    Promise.resolve()
        .then(factory)
        .catch((error) => {
            if (retries <= 0) {
                throw error
            }
            return new Promise(resolve => setTimeout(resolve, delay))
                .then(() => retryImport(factory, retries - 1, delay * 2))
        })

class Async extends React.Component {

    static cache = {expose: {}}

    componentWillMount = () => {
        const {load, expose, asyncKey} = this.props

        const ac = Async.cache
        if (ac[asyncKey]) {
            this.Component = ac[asyncKey]
        } else if (expose && ac.expose[expose]) {
            this.Component = ac.expose[expose]
        } else {
            // Support both a factory (retryable) and a plain promise (legacy).
            const loadPromise = typeof load === 'function' ? retryImport(load) : load

            loadPromise.then((Component) => {
                // Clear a stale forced-reload flag after a successful load, so the
                // fallback can trigger again on a future deploy instead of staying stuck.
                localStorage.removeItem('forced-reload')

                if (expose) {
                    ac.expose = Component
                    this.Component = Component[expose]
                } else {
                    this.Component = Component.default
                    if (asyncKey) {
                        ac[asyncKey] = Component.default
                    }
                }
                this.forceUpdate()
            }).catch((e) => {
                const hasForcedReload = localStorage.getItem('forced-reload')
                if (!hasForcedReload) {
                    // Retry failed too → try to force reload exactly once.
                    unregisterAllServiceworker(() => {
                        localStorage.setItem('forced-reload', true)
                        const url = new URL(window.location.href)
                        url.searchParams.set('_ts', Date.now())
                        window.location.href = url.href
                    })
                } else {
                    Hook.call('AsyncError', {error: e})
                }
            })
        }
    }

    render = () => {
        const {load, expose, onForwardRef, asyncRef, asyncKey, ...rest} = this.props
        rest.ref = asyncRef || onForwardRef
        return this.Component ? React.createElement(this.Component, rest) : null
    }
}

export default Async