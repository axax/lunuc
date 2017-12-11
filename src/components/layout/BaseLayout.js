import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {Layout, LayoutHeader, LayoutContent, LayoutFooter, HeaderMenu} from '../ui/index'
import ErrorHandlerContainer from '../../containers/ErrorHandlerContainer'
import NotificationContainer from '../../containers/NotificationContainer'

const menuEntries = [
    {name: 'Home', to: '/'},
    {name: 'Translate', to: '/translate', auth: true},
    {name: 'Search', to: '/search', auth: true},
    {name: 'My chats', to: '/chat', auth: true},
    {name: 'Words', to: '/word', auth: true},
    {name: 'Posts', to: '/post', auth: true},
    {name: 'Cms', to: '/cms', auth: true},
    {name: 'Profile', to: '/profile'}
]


const BaseLayout = ({children, isAuthenticated}) => (
    <Layout className="layout">
        <LayoutHeader>
            <HeaderMenu items={menuEntries}/>
        </LayoutHeader>

        <LayoutContent style={{ padding: '0 50px' }}>

            <ErrorHandlerContainer />
            <NotificationContainer />



            {children}
        </LayoutContent>
        <LayoutFooter style={{ textAlign: 'center' }}>
            ©2016 Created by simon
        </LayoutFooter>
    </Layout>
)

BaseLayout.propTypes = {
    /* UserReducer */
    isAuthenticated: PropTypes.bool
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
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(BaseLayout)