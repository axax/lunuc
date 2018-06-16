import React from 'react'
import PropTypes from 'prop-types'

class Async extends React.Component {

    static cache = {}

    UNSAFE_componentWillMount = () => {
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
            })
        }
    }

    render = () => {
        const { load, expose, ...rest} = this.props
        return this.Component ? <this.Component {...rest}/> : null
    }
}


Async.propTypes = {
    load: PropTypes.object.isRequired,
    expose: PropTypes.string
}

export default Async