import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {LinearProgress} from 'ui/admin'

// loading indicator is shown if api requests take more than 500 ms
const LOADER_DELAY = 500

class NetworkStatusHandler extends React.Component {

    delayTimer = null

    constructor(props) {
        super(props)

        this.state = {
            showLoader: props.networkStatus.loading
        }
    }

    componentWillReceiveProps(props) {
        if (props.networkStatus.loading) {
            if (!this.delayTimer) {
                this.delayTimer = setTimeout(() => {
                    this.setState({showLoader: true})
                }, LOADER_DELAY)
            }
        } else {
            clearTimeout(this.delayTimer)
            this.delayTimer = null
            if (this.state.showLoader) {
                this.setState({showLoader: false})
            }
        }
    }


    render() {
        if (!this.state.showLoader) return null
        return <div
            style={{height: '10px', position: 'fixed', bottom: '0px', left: '0px', width: '100%', zIndex: 9999}}>
            <LinearProgress style={{height: '10px'}} mode="query" color="secondary"/>
        </div>
    }
}


NetworkStatusHandler.propTypes = {
    networkStatus: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = state => ({networkStatus: state.networkStatusHandler.networkStatus})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
)(NetworkStatusHandler)