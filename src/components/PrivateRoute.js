import React from 'react'
import PropTypes from 'prop-types'
import { Route, Redirect} from 'react-router-dom'


const PrivateRoute = ({ component: Component, isAuthenticated, ...rest }) => (
	<Route {...rest} render={props => (
		isAuthenticated ? (
			<Component {...props}/>
		) : (
			<Redirect to={{
				pathname: '/login',
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