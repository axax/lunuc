import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as Actions from 'client/actions/NotificationAction'
import {Snackbar, CloseIconButton, theme} from 'ui/admin'
import {Link} from 'react-router-dom'
import {client} from '../../middleware/graphql'

class NotificationHandler extends React.Component {


    constructor(props) {
        super(props)
        this.state = {
            notificationOpen: true,
            notificationStack: []
        }
    }

    handleNotificationClose(e, reason) {
        if (reason !== 'clickaway') {
            this.setState({notificationOpen: false})
        }
    }

    handleNotificationClosed() {
        const notificationStack = [...this.state.notificationStack]
        notificationStack.shift()

        this.setState({notificationStack, notificationOpen: true})
    }

    UNSAFE_componentWillReceiveProps(props) {
        this.addToNotificationStack(props.notification)
    }

    shouldComponentUpdate(props, state) {
        return this.state.notificationOpen !== state.notificationOpen ||
            this.state.notificationStack !== state.notificationStack ||
            this.state.notificationStack.length !== state.notificationStack.length
    }

    componentDidMount() {

        this.subscription = client.subscribe({
            query: `
  subscription{
  	newNotification{
			key
			message
			link
			linkText
		}
  }`
        }).subscribe({
            next:(supscriptionData) =>{
                this.addToNotificationStack(supscriptionData.data.newNotification)
            },
            error(err) {
                console.error('err', err)
            },
        })
    }

    componentWillUnmount() {
        if(this.subscription ){
            this.subscription.unsubscribe()
        }
    }

    addToNotificationStack(notification) {
        if(notification){
            const notificationStack = [...this.state.notificationStack]
            notificationStack.push(notification)
            this.setState({notificationStack})
        }
    }

    render() {
        const {notificationStack, notificationOpen} = this.state

        console.log('render NotificationHandler ' + notificationStack.length)
        if (notificationStack.length > 0) {
            const notification = notificationStack[0]
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
                open={notificationOpen}
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
)(NotificationHandler)
