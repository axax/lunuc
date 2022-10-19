import React, {useContext} from 'react'
import {Snackbar, CloseIconButton, theme} from 'ui/admin'
import {Link} from '../../util/route'
import {client} from '../../middleware/graphql'
import {AppContext} from '../AppContext'

class NotificationHandler extends React.Component {


    constructor(props) {
        super(props)
        this.state = {
            notificationOpen: true
        }
    }

    handleNotificationClose(e, reason) {
        if (reason !== 'clickaway') {
            this.setState({notificationOpen: false})
            setTimeout(()=>{
                this.setState({notificationOpen: true})
                _app_.dispatcher.addNotification()
            },600)
        }
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
                _app_.dispatcher.addNotification(supscriptionData.data.newNotification)
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

    render() {
        const {notificationOpen} = this.state

        const globalContext = useContext(AppContext)

        const notificationStack = globalContext.state.notifications

        if (notificationStack.length > 0) {
            console.log('render NotificationHandler ' + notificationStack.length + ' - '+ notificationOpen)

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
                open={notificationOpen}
                autoHideDuration={7000}
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

export default NotificationHandler
