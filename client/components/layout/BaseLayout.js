import React from 'react'
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
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import * as UserActions from 'client/actions/UserAction'
import {UIProvider} from 'ui/admin'
import 'gen/extensions-client-admin'
import {withKeyValues} from '../../containers/generic/withKeyValues'

const {ADMIN_BASE_URL, APP_NAME} = config


class BaseLayout extends React.Component {

    menuItems = [
        {name: 'Home', to: ADMIN_BASE_URL + '/', icon: <HomeIcon />},
        {name: 'Types', to: ADMIN_BASE_URL + '/types', auth: true, icon: <BuildIcon />},
        {name: 'System', to: ADMIN_BASE_URL + '/system', auth: true, icon: <SettingsIcon />},
        {name: 'Files', to: ADMIN_BASE_URL + '/files', auth: true, icon: <InsertDriveFileIcon />},
        {name: 'Backup', to: ADMIN_BASE_URL + '/backup', auth: true, icon: <BackupIcon />},
        {name: 'Profile', to: ADMIN_BASE_URL + '/profile', auth: true, icon: <AccountCircleIcon />}
    ]

    constructor(props) {
        super(props)
        Hook.call('MenuMenu', {menuItems: this.menuItems})
    }

    linkTo(item) {
        this.props.history.push(item.to);
    }

    render() {
        const {history, children, isAuthenticated, username, keyValueMap} = this.props

        const settings = keyValueMap.BaseLayoutSettings

        if( settings && settings.menu && settings.menu.hide ){
            for (let i = this.menuItems.length - 1; i >= 0; i--) {
                if (settings.menu.hide.indexOf(this.menuItems[i].name) >= 0) {
                    this.menuItems.splice(i, 1)
                }
            }
        }

        return <UIProvider>
            <ResponsiveDrawerLayout title={APP_NAME}
                                    menuItems={this.menuItems}
                                    headerRight={
                                        [
                                            (isAuthenticated ?
                                                <Button key="logout" color="inherit" size="small"
                                                        onClick={this.linkTo.bind(this, {to: ADMIN_BASE_URL + '/logout'})}>Logout {username}</Button>

                                                : <Button key="login" color="inherit" size="small"
                                                          onClick={this.linkTo.bind(this, {to: ADMIN_BASE_URL + '/login'})}>Login</Button>),
                                            <HomeIconButton
                                                key="home"
                                                onClick={() => {
                                                    history.push('/')
                                                }}
                                                color="inherit"/>
                                        ]
                                    }>

                <ErrorHandler />
                <NotificationHandler />
                <NetworkStatusHandler />


                {children}
            </ResponsiveDrawerLayout>
        </UIProvider>
    }
}


BaseLayout.propTypes = {
    isAuthenticated: PropTypes.bool,
    username: PropTypes.string,
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
        username: user.userData ? user.userData.username : ''
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
)(withRouter(withKeyValues(BaseLayout, ['BaseLayoutSettings'])))
