import React, {useEffect} from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import {
    Button,
    ResponsiveDrawerLayout,
    HomeIconButton,
    HomeIcon,
    BuildIcon,
    SettingsIcon,
    AccountCircleIcon,
    BackupIcon,
    InsertDriveFileIcon
} from 'ui/admin'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import Hook from 'util/hook'
import config from 'gen/config'
import * as UserActions from 'client/actions/UserAction'
import {UIProvider} from 'ui/admin'
import 'gen/extensions-client-admin'
import {withKeyValues} from '../../containers/generic/withKeyValues'
import {useHistory} from 'react-router-dom'
import {CAPABILITY_MANAGE_TYPES} from "../../../util/capabilities";

const {ADMIN_BASE_URL, APP_NAME} = config

let menuItems

const BaseLayout = props => {
    const {children, isAuthenticated, user, keyValueMap} = props

    if(!menuItems){
        menuItems = [
            {name: 'Home', to: ADMIN_BASE_URL + '/', icon: <HomeIcon/>},
            {name: 'System', to: ADMIN_BASE_URL + '/system', auth: true, icon: <SettingsIcon/>},
            {name: 'Files', to: ADMIN_BASE_URL + '/files', auth: true, icon: <InsertDriveFileIcon/>},
            {name: 'Backup', to: ADMIN_BASE_URL + '/backup', auth: true, icon: <BackupIcon/>},
            {name: 'Profile', to: ADMIN_BASE_URL + '/profile', auth: true, icon: <AccountCircleIcon/>}
        ]



        const capabilities = (user.userData && user.userData.role && user.userData.role.capabilities) || []

        if(capabilities.indexOf(CAPABILITY_MANAGE_TYPES) >= 0){
            menuItems.splice(1,0,{name: 'Types', to: ADMIN_BASE_URL + '/types', auth: true, icon: <BuildIcon/>})
        }


        Hook.call('MenuMenu', {menuItems})

    }

    const username = user.userData ? user.userData.username : ''
    const settings = keyValueMap.BaseLayoutSettings

    if (settings && settings.menu && settings.menu.hide) {
        for (let i = menuItems.length - 1; i >= 0; i--) {
            if (settings.menu.hide.indexOf(menuItems[i].name) >= 0) {
                menuItems.splice(i, 1)
            }
        }
    }

    const history = useHistory()

    return <UIProvider>
        <ResponsiveDrawerLayout title={APP_NAME}
                                menuItems={menuItems}
                                headerRight={
                                    [
                                        (isAuthenticated ?
                                            <Button key="logout" color="inherit" size="small"
                                                    onClick={() => {
                                                        history.push(ADMIN_BASE_URL + '/logout')
                                                    }}>Logout {username}</Button>

                                            : <Button key="login" color="inherit" size="small"
                                                      onClick={() => {
                                                          history.push(ADMIN_BASE_URL + '/login')
                                                      }}>Login</Button>),
                                        <HomeIconButton
                                            key="home"
                                            onClick={() => {
                                                history.push('/')
                                            }}
                                            color="inherit"/>
                                    ]
                                }>

            <ErrorHandler/>
            <NotificationHandler/>
            <NetworkStatusHandler/>


            {children}
        </ResponsiveDrawerLayout>
    </UIProvider>

}


BaseLayout.propTypes = {
    isAuthenticated: PropTypes.bool,
    user: PropTypes.object,
    /* User Reducer */
    userActions: PropTypes.object.isRequired,
    keyValueMap: PropTypes.object
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    const {user} = store
    return {
        isAuthenticated: user.isAuthenticated,
        user
    }
}


/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    userActions: bindActionCreators(UserActions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withKeyValues(BaseLayout, ['BaseLayoutSettings']))
