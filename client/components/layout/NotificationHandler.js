import React, {useContext, useEffect, useState} from 'react'
import {Snackbar, CloseIconButton, theme} from 'ui/admin'
import {Link} from '../../util/route'
import {client} from '../../middleware/graphql'
import {AppContext} from '../AppContext'


function NotificationHandler() {
    const globalContext = useContext(AppContext)
    const [notificationOpen, setNotificationOpen] = useState(true)

    useEffect(() => {
        const subscription = client.subscribe({
            query: `subscription{newNotification{key message link linkText}}`
        }).subscribe({
            next:(subscriptionData) =>{
                if(subscriptionData.data) {
                    _app_.dispatcher.addNotification(subscriptionData.data.newNotification)
                }
            },
            error(err) {
                console.error('err', err)
            },
        })
        // returned function will be called on component unmount
        return () => {
            subscription.unsubscribe()
        }
    }, [])


    const notificationStack = globalContext.state.notifications

    if (notificationStack.length > 0) {
        console.log('render NotificationHandler ' + notificationStack.length + ' - '+ notificationOpen)

        const handleNotificationClose = (e, reason) => {
            if (reason !== 'clickaway') {
                setNotificationOpen(false)
                setTimeout(()=>{
                    setNotificationOpen(true)
                    _app_.dispatcher.addNotification()
                },600)
            }
        }

        const notification = notificationStack[0]
        const actions = []
        if(notification.closeButton!==false){
            actions.push(
                <CloseIconButton
                    key="close"
                    aria-label="Close"
                    color="inherit"
                    className=""
                    onClick={handleNotificationClose}
                />)
        }
        if (notification.link) {
            actions.unshift(
                <Link style={{color:theme.palette.secondary.light}} key="link" to={notification.link}>{notification.linkText || notification.link}</Link>)
        }
        return <Snackbar
            key={notification.key}
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: notification.horizontal || 'left',
            }}
            open={notificationOpen}
            autoHideDuration={notification.autoHideDuration ?? 7000}
            onClose={handleNotificationClose}
            ContentProps={{
                'aria-describedby': 'message-id',
            }}
            message={<span id="message-id">{notification.message}</span>}
            action={actions}
        />
    }

    return null
}

export default NotificationHandler
