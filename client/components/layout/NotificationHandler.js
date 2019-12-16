import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as Actions from 'client/actions/NotificationAction'
import {graphql} from 'react-apollo'
import compose from 'util/compose'
import gql from 'graphql-tag'
import {Snackbar, CloseIconButton, theme} from 'ui/admin'
import {Link} from 'react-router-dom'

class NotificationHandler extends React.Component {

    notificationStack = []
    currentStackPosition = 0
    lastStackLength = 0
    lastStackPosition = 0

    constructor(props) {
        super(props)
        this.state = {
            notificationOpen: true
        }
    }

    handleNotificationClose(e, reason) {
        if (reason !== 'clickaway') {
            this.setState({notificationOpen: false})
        }
    }

    handleNotificationClosed() {
        this.currentStackPosition++
        this.setState({notificationOpen: true})
    }

    UNSAFE_componentWillReceiveProps(props) {
        this.addToNotificationStack(props)
    }

    shouldComponentUpdate(props, state) {
        const update = this.lastStackLength !== this.notificationStack.length || this.lastStackPosition !== this.currentStackPosition
        this.lastStackLength = this.notificationStack.length
        this.lastStackPosition = this.currentStackPosition
        return update || this.state.notificationOpen !== state.notificationOpen
    }

    addToNotificationStack(props) {
        const {newNotification, notification} = props
        if (notification && this.notificationStack.indexOf(notification) < 0) {
            this.notificationStack.push(notification)
        }
        if (newNotification && this.notificationStack.indexOf(newNotification) < 0) {
            this.notificationStack.push(newNotification)
        }
    }

    render() {
        console.log('render NotificationHandler ' + this.notificationStack.length + '/' + this.currentStackPosition)
        if (this.notificationStack.length > this.currentStackPosition) {
            const notification = this.notificationStack[this.currentStackPosition]
            const actions = [
                <CloseIconButton
                    key="close"
                    aria-label="Close"
                    color="inherit"
                    className=""
                    onClick={this.handleNotificationClose.bind(this)}
                />,
            ]
            if (notification.link) {
                actions.unshift(
                    <Link style={{color:theme.palette.secondary.light}} key="link" to={notification.link}>{notification.linkText || notification.link}</Link>)
            }
            return <Snackbar
                key={notification.key}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'left',
                }}
                onExited={this.handleNotificationClosed.bind(this)}
                open={this.state.notificationOpen}
                autoHideDuration={5000}
                onClose={this.handleNotificationClose.bind(this)}
                ContentProps={{
                    'aria-describedby': 'message-id',
                }}
                message={<span id="message-id">{notification.message}</span>}
                action={actions}
            />
        }

        return null
    }
}


NotificationHandler.propTypes = {
    newNotification: PropTypes.object,
    notification: PropTypes.object
}

const gqlSubscriptionNotification = gql`
  subscription{
  	newNotification{
			key
			message
			link
			linkText
		}
  }`

const NotificationHandlerWithGql = compose(graphql(gqlSubscriptionNotification, {
    options(props) {
        return {
            fetchPolicy: 'network-only'
        }
    },
    props: ({data: {newNotification}}) => ({
        newNotification
    })
}))
(NotificationHandler)


/**
 * Map the state to props.
 */
const mapStateToProps = (state) => {
    const {notification} = state
    // clear notification
    state.notification = null
    return {
        notification: notification
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
)(NotificationHandlerWithGql)
