import React from 'react'
import PropTypes from 'prop-types'
import {BrowserRouter as Router, Route, Link, Redirect} from 'react-router-dom'

import LoginContainer from '../containers/LoginContainer'
import UserProfileContainer from '../containers/UserProfileContainer'
import ErrorHandlerContainer from '../containers/ErrorHandlerContainer'
import NotificationContainer from '../containers/NotificationContainer'
import SearchWhileSpeakContainer from '../containers/SearchWhileSpeakContainer'


const Routes = () => (
	<Router>
		<div>
			<ErrorHandlerContainer />
			<NotificationContainer />

			<ul>
				<li><Link to="/">Home</Link></li>
				<li><Link to="/search">Search</Link></li>
				<li><Link to="/profile">Profile</Link></li>
			</ul>

			<hr/>

			<Route exact path="/" component={Home}/>
			<Route exact path="/search" component={SearchWhileSpeakContainer}/>
			<Route path="/login" component={LoginContainer}/>

			<PrivateRoute path="/profile" component={UserProfileContainer}/>
		</div>
	</Router>
)

const Home = () => (
	<div>
		<h2>Welcome</h2>
	</div>
)


const isAuthenticated = () => {
	return localStorage.getItem('token') != null
}

const PrivateRoute = ({ component: Component, ...rest }) => (
	<Route {...rest} render={props => (
		isAuthenticated() ? (
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
	location: PropTypes.object
}



export default Routes