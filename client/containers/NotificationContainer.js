import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {Snackbar, Button, CloseIconButton} from 'ui/admin'

class NotificationContainer extends React.Component {

    notificationStack = []

    constructor(props) {
        super(props)
        this.state = {
            notificationOpen: true
        }
    }

    handleNotificationClose() {
        this.setState({notificationOpen: false})
    }

    handleNotificationClosed() {
        this.notificationStack.shift()
        this.setState({notificationOpen: true})

    }

    componentWillReceiveProps(props) {
        this.addToNotificationStack(props)
    }

    shouldComponentUpdate(props) {
        return !!props.newNotification
    }

    addToNotificationStack(props) {
        const {newNotification} = props
        if (newNotification) {
            this.notificationStack.push(newNotification)
        }
    }

    render() {
        if (this.notificationStack.length > 0) {
            const notification = this.notificationStack[0]
            return <Snackbar
                key={notification.key}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'left',
                }}
                onExited={this.handleNotificationClosed.bind(this, notification)}
                open={this.state.notificationOpen}
                autoHideDuration={5000}
                onClose={this.handleNotificationClose.bind(this, notification)}
                SnackbarContentProps={{
                    'aria-describedby': 'message-id',
                }}
                message={<span id="message-id">{notification.message}</span>}
                action={[
                    <CloseIconButton
                        key="close"
                        aria-label="Close"
                        color="inherit"
                        className=""
                        onClick={this.handleNotificationClose.bind(this, notification)}
                    />,
                ]}
            />
        }

        return null
    }
}


NotificationContainer.propTypes = {
    newNotification: PropTypes.object,
}

const gqlSubscriptionNotification = gql`
  subscription{
  	newNotification{
			key
			message
		}
  }`

const NotificationContainerWithGql = compose(graphql(gqlSubscriptionNotification, {
    options(props) {
        return {
            fetchPolicy: 'network-only'
        }
    },
    props: ({data: {newNotification}}) => ({
        newNotification
    })
}))
(NotificationContainer)


export default NotificationContainerWithGql