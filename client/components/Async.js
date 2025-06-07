import React from 'react'
import Hook from '../../util/hook.cjs'
import {unregisterAllServiceworker} from '../util/serviceWorkerUtil.mjs'

class Async extends React.Component {

    static cache = {expose:{}}

    componentWillMount = () => {
        const {load, expose, asyncKey} = this.props

        if(Async.cache[asyncKey]){
            this.Component = Async.cache[asyncKey]
        }else if( expose && Async.cache.expose[expose]){
            this.Component = Async.cache.expose[expose]
        }else {
            load.then((Component) => {
                if (expose) {
                    Async.cache.expose = Component
                    this.Component = Component[expose]
                } else {
                    this.Component = Component.default
                    if(asyncKey){
                        Async.cache[asyncKey] = Component.default
                    }
                }
                this.forceUpdate()
            }).catch(e=>{
                const hasForcedReload = localStorage.getItem('forced-reload')
                if(!hasForcedReload){
                    // try to force reload one time
                    unregisterAllServiceworker(()=>{
                        localStorage.setItem('forced-reload', true)
                        const url = new URL(window.location.href)
                        url.searchParams.set('_ts', Date.now())
                        window.location.href = url.href
                    })
                }else {
                    Hook.call('AsyncError', {error: e})
                }
            })
        }
    }

    render = () => {
        const { load, expose, onForwardRef, asyncRef, asyncKey, ...rest} = this.props
        rest.ref = asyncRef || onForwardRef
        return this.Component ? React.createElement(this.Component, rest) : null
    }
}

export default Async
