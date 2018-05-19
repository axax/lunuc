import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import {Button, ResponsiveDrawerLayout} from 'ui/admin'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import Hook from 'util/hook'
import {withRouter} from 'react-router-dom'
import config from 'gen/config'
import * as UserActions from 'client/actions/UserAction'
import {UIProvider} from 'ui/admin'

const {ADMIN_BASE_URL} = config


class BaseLayout extends React.Component {

    menuItems = [
        {name: 'Home', to: ADMIN_BASE_URL + '/'},
        {name: 'System', to: ADMIN_BASE_URL + '/system', auth: true},
        {name: 'Backup', to: ADMIN_BASE_URL + '/backup', auth: true},
        {name: 'Types', to: ADMIN_BASE_URL + '/types', auth: true},
        {name: 'Cms', to: ADMIN_BASE_URL + '/cms', auth: true},
        {name: 'Profile', to: ADMIN_BASE_URL + '/profile', auth: true}
    ]

    constructor(props) {
        super(props)
        Hook.call('MenuMenu', {menuItems: this.menuItems})
    }

    linkTo(item) {
        this.props.history.push(item.to);
    }

    render() {
        const {history, children, isAuthenticated, userActions} = this.props


        return <UIProvider>
            <ResponsiveDrawerLayout title="lunuc"
                                    menuItems={this.menuItems}
                                    headerRight={
                                        isAuthenticated ?
                                            <Button color="inherit" size="small" onClick={() => {
                                                localStorage.removeItem('token')
                                                userActions.setUser(null, false)
                                                history.push('/')
                                            }}>Logout</Button>

                                            : <Button color="inherit" size="small"
                                                      onClick={this.linkTo.bind(this, {to: ADMIN_BASE_URL + '/login'})}>Login</Button>
                                    }>

                <ErrorHandler />
                <NotificationHandler />
                <NetworkStatusHandler />


                {children}
            </ResponsiveDrawerLayout>
        </UIProvider>


        /*return <Layout className="Layout">

         <LayoutHeader style={{marginTop:'64px'}} className="LayoutHeader">



         <HeaderMenu items={this.menuItems} metaContent={
         isAuthenticated ?
         <Button color="inherit" dense onClick={() => {
         localStorage.removeItem('token')
         userActions.setUser(null, false)
         history.push('/')
         }}>Logout</Button>

         : <Button color="inherit" dense onClick={this.linkTo.bind(this, {to: ADMIN_BASE_URL + '/login'})}>Login</Button>
         }/>


         </LayoutHeader>


         <LayoutContent style={{padding: '50px'}}>

         </LayoutContent>
         <LayoutFooter style={{textAlign: 'center'}}>
         ©2016 Created by simon
         </LayoutFooter>

         <NetworkStatusHandler />

         </Layout>*/
    }
}


BaseLayout.propTypes = {
    isAuthenticated: PropTypes.bool,
    /* User Reducer */
    userActions: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    const {user} = store
    return {
        isAuthenticated: user.isAuthenticated
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
)(withRouter(BaseLayout))