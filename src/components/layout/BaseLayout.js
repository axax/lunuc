import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {NavLink} from 'react-router-dom'
import ErrorHandlerContainer from '../../containers/ErrorHandlerContainer'
import NotificationContainer from '../../containers/NotificationContainer'

const BaseLayout = ({children, isAuthenticated}) => (
    <div>
        <ErrorHandlerContainer />
        <NotificationContainer />
        <ul>
            <li><NavLink activeStyle={{color: 'red'}} exact={true} to="/">Home</NavLink></li>
            {isAuthenticated?<li><NavLink activeStyle={{color: 'red'}} to="/translate">Translate</NavLink></li>:''}
            {isAuthenticated?<li><NavLink activeStyle={{color: 'red'}} to="/search">Search</NavLink></li>:''}
            {isAuthenticated?<li><NavLink activeStyle={{color: 'red'}} to="/chat">My chats</NavLink></li>:''}
            {isAuthenticated?<li><NavLink activeStyle={{color: 'red'}} to="/word">Word</NavLink></li>:''}
            {isAuthenticated?<li><NavLink activeStyle={{color: 'red'}} to="/post">Post</NavLink></li>:''}
            {isAuthenticated?<li><NavLink activeStyle={{color: 'red'}} to="/cms">Cms</NavLink></li>:''}
            <li><NavLink activeStyle={{color: 'red'}} to="/profile">Profile</NavLink></li>
        </ul>

        <hr/>

        {children}
    </div>
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