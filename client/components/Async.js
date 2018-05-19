import React from 'react'
import PropTypes from 'prop-types'

class Async extends React.Component {
    componentWillMount = () => {
        const {load, expose} = this.props

        load.then((Component) => {
            if (expose) {
                this.Component = Component[expose]
            }else{
                this.Component = Component.default
            }
            this.forceUpdate()
        })
    }

    render = () => {
        const {load, expose, ...rest} = this.props
        return this.Component ? <this.Component {...rest}/> : null
    }
}


Async.propTypes = {
    load: PropTypes.object.isRequired,
    expose: PropTypes.string
}

export default Async