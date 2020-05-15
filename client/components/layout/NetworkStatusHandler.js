import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {LinearProgress} from 'ui/admin'

// loading indicator is shown if api requests take more than 500 ms
const LOADER_DELAY = 500

class NetworkStatusHandler extends React.Component {

    delayTimer = null

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.networkStatus.loading !== prevState.showLoader) {
            return NetworkStatusHandler.propsToState(nextProps, prevState)
        }
        return null
    }

    static propsToState(props, state) {
        return {
            showLoader: props.networkStatus.loading,
            showLoaderDelayed: !props.networkStatus.loading || !state ? false : state.showLoaderDelayed
        }
    }


    constructor(props) {
        super(props)

        this.state = NetworkStatusHandler.propsToState(props)
    }


    componentDidMount() {
        if (this.state.showLoader) {
            this.showLoaderDelayed()
        }
    }

    componentWillUnmount() {
        clearTimeout(this.delayTimer)
        this.delayTimer = null
    }

    shouldComponentUpdate(nextProps, nextState) {
        if (nextState.showLoader && !nextState.showLoaderDelayed) {
            this.showLoaderDelayed()
            return false
        } else {
            clearTimeout(this.delayTimer)
            this.delayTimer = null
        }
        return nextState.showLoaderDelayed !== this.state.showLoaderDelayed || nextState.showLoader !== this.state.showLoader
    }

    showLoaderDelayed() {
        if (!this.delayTimer) {
            this.delayTimer = setTimeout(() => {
                this.setState({showLoaderDelayed: this.state.showLoader})
            }, LOADER_DELAY)
        }
    }


    render() {
        if (!this.state.showLoader) return null
        return <div
            style={{height: '10px', position: 'fixed', bottom: '0px', left: '0px', width: '100%', zIndex: 9999}}>
            <LinearProgress style={{height: '10px'}} variant="query" color="secondary"/>
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
