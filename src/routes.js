import React from 'react'
import PropTypes from 'prop-types'
import {BrowserRouter as Router, Route, Link, Redirect} from 'react-router-dom'

import App from './components/App'
import LoginContainer from './containers/LoginContainer'
import UserProfileContainer from './containers/UserProfileContainer'



const Routes = () => (
	<Router>
		<div>
			<ul>
				<li><Link to="/">Home</Link></li>
				<li><Link to="/about">About</Link></li>
				<li><Link to="/profile">Profile</Link></li>
			</ul>

			<hr/>

			<Route exact path="/" component={App}/>
			<Route path="/about" component={About}/>
			<Route path="/login" component={LoginContainer}/>

			<PrivateRoute path="/profile" component={UserProfileContainer}/>
		</div>
	</Router>
)

const About = () => (
	<div>
		<h2>About</h2>
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