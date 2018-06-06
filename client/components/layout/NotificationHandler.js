import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {Snackbar, Button, CloseIconButton} from 'ui/admin'

class NotificationHandler extends React.Component {

    notificationStack = []
    currentStackPosition = 0

    constructor(props) {
        super(props)
        this.state = {
            notificationOpen: true
        }
    }

    handleNotificationClose() {
        this.setState({notificationOpen: false})
        this.currentStackPosition++
    }

    handleNotificationClosed() {
        this.setState({notificationOpen: true})
    }

    componentWillReceiveProps(props) {
        this.addToNotificationStack(props)
    }

    shouldComponentUpdate(props) {
        return !!props.newNotification && this.currentStackPosition < this.notificationStack.length
    }

    addToNotificationStack(props) {
        const {newNotification} = props
        if (newNotification && this.notificationStack.indexOf(newNotification) < 0) {
            this.notificationStack.push(newNotification)
        }
    }

    render() {
        console.log('render NotificationHandler')
        if (this.notificationStack.length > this.currentStackPosition) {
            const notification = this.notificationStack[this.currentStackPosition]
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
                ContentProps={{
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


NotificationHandler.propTypes = {
    newNotification: PropTypes.object,
}

const gqlSubscriptionNotification = gql`
  subscription{
  	newNotification{
			key
			message
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


export default NotificationHandlerWithGql