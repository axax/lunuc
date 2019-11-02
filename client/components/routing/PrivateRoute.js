import React from 'react'
import PropTypes from 'prop-types'
import {Route, Redirect} from 'react-router-dom'
import config from 'gen/config'


const PrivateRoute = ({component: Component, isAuthenticated, ...rest}) => (
    <Route {...rest} render={props => (
        isAuthenticated ? (<Component {...props}/>
        ) : (
            <Redirect to={{
                pathname: config.ADMIN_BASE_URL + '/login',
                state: {from: props.location}
            }}/>
        )
    )}/>
)


PrivateRoute.propTypes = {
    component: PropTypes.any.isRequired,
    location: PropTypes.object,
    isAuthenticated: PropTypes.bool
}

export default PrivateRoute
