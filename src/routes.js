import React from 'react'
import PropTypes from 'prop-types'
import {BrowserRouter as Router, Route, Link, Redirect} from 'react-router-dom'

import App from './components/App'



const Routes = () => (
	<Router>
		<div>
			<ul>
				<li><Link to="/">Home</Link></li>
				<li><Link to="/about">About</Link></li>
				<li><Link to="/protected">Protected</Link></li>
			</ul>

			<hr/>

			<Route exact path="/" component={App}/>
			<Route path="/about" component={About}/>

			<PrivateRoute path="/protected" component={Protected}/>
		</div>
	</Router>
)

const About = () => (
	<div>
		<h2>About</h2>
	</div>
)

const Protected = () => (
	<div>
		<h2>Protected</h2>
	</div>
)


const fakeAuth = {
	isAuthenticated: false,
	authenticate(cb) {
		this.isAuthenticated = true
		setTimeout(cb, 100) // fake async
	},
	signout(cb) {
		this.isAuthenticated = false
		setTimeout(cb, 100)
	}
}

const PrivateRoute = ({ component: Component, ...rest }) => (
	<Route {...rest} render={props => (
		fakeAuth.isAuthenticated ? (
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