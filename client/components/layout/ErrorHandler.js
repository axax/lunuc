import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as Actions from 'client/actions/ErrorHandlerAction'
import {SimpleDialog} from 'ui/admin'


class ErrorHandler extends React.Component {

    handleDialogClose(key) {
        this.props.actions.clearError(key)
    }

    render() {
        const {messages} = this.props
        if (!messages || !Object.keys(messages).length)
            return null

        const key = Object.keys(messages)[0], msg = messages[key].msg

        return <SimpleDialog open={true} onClose={this.handleDialogClose.bind(this, key)}
                             actions={[{autoFocus: true, key: 'ok', label: 'Ok', type: 'primary'}]} title="Error">
            {msg}
        </SimpleDialog>

    }
}


ErrorHandler.propTypes = {
    messages: PropTypes.object.isRequired,
    actions: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = (state) => {
    const {errorHandler} = state
    return {
        messages: errorHandler.messages
    }
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    actions: bindActionCreators(Actions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ErrorHandler)

