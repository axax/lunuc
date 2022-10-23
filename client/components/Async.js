import React from 'react'
import PropTypes from 'prop-types'
import Hook from '../../util/hook.cjs'

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
                    localStorage.setItem('forced-reload', true)
                    window.location.reload(true)
                }else {
                    Hook.call('AsyncError', {error: e})
                }
            })
        }
    }

    render = () => {
        const { load, expose, onForwardRef, asyncKey, ...rest} = this.props
        rest.ref = onForwardRef
        return this.Component ? React.createElement(this.Component, rest) : null
    }
}


Async.propTypes = {
    load: PropTypes.object.isRequired,
    expose: PropTypes.string
}

export default Async
