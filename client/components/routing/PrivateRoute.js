import React from 'react'
import PropTypes from 'prop-types'
import { Route, Redirect} from 'react-router-dom'
import {ADMIN_BASE_URL} from 'gen/config'


const PrivateRoute = ({ component: Component, isAuthenticated, ...rest }) => (
	<Route {...rest} render={props => (
		isAuthenticated ? (
			<Component {...props}/>
		) : (
			<Redirect to={{
				pathname: ADMIN_BASE_URL+'/login',
				state: { from: props.location }
			}}/>
		)
	)}/>
)


PrivateRoute.propTypes = {
	component: PropTypes.func.isRequired,
	location: PropTypes.object,
	isAuthenticated: PropTypes.bool
}

export default PrivateRoute