import React from 'react'
import PropTypes from 'prop-types'
import Hook from '../../util/hook'

class Async extends React.Component {

    static cache = {}

    componentWillMount = () => {
        const {load, expose} = this.props

        if( expose && Async.cache[expose]){
            this.Component = Async.cache[expose]
        }else {
            load.then((Component) => {
                if (expose) {
                    Async.cache = Component
                    this.Component = Component[expose]
                } else {
                    this.Component = Component.default
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
        const { load, expose, onForwardRef, ...rest} = this.props
        rest.ref = onForwardRef
        return this.Component ? React.createElement(this.Component, rest) : null
    }
}


Async.propTypes = {
    load: PropTypes.object.isRequired,
    expose: PropTypes.string
}

export default Async
