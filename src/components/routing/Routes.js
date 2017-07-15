import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'

import {BrowserRouter as Router, Route, Link, Redirect} from 'react-router-dom'

import LoginContainer from '../../containers/LoginContainer'
import SignUpContainer from '../../containers/SignUpContainer'
import UserProfileContainer from '../../containers/UserProfileContainer'
import ErrorHandlerContainer from '../../containers/ErrorHandlerContainer'
import NotificationContainer from '../../containers/NotificationContainer'
import SearchWhileSpeakContainer from '../../containers/SearchWhileSpeakContainer'
import ChatContainer from '../../containers/ChatContainer'
import PrivateRoute from './PrivateRoute'

class Routes extends React.Component {


	render() {

		const {isAuthenticated} = this.props
		return <Router>
			<div>
				<ErrorHandlerContainer />
				<NotificationContainer />
				<ul>
					<li><Link to="/">Home</Link></li>
					{isAuthenticated?<li><Link to="/search">Search</Link></li>:''}
					{isAuthenticated?<li><Link to="/chat">My chats</Link></li>:''}
					<li><Link to="/profile">Profile</Link></li>
				</ul>

				<hr/>

				<Route exact path="/" component={Home}/>
				<Route exact path="/search" component={SearchWhileSpeakContainer}/>
				<Route exact path="/chat/:id*" component={ChatContainer}/>
				<Route path="/login" component={LoginContainer}/>
				<Route path="/signup" component={SignUpContainer}/>

				<PrivateRoute path="/profile" isAuthenticated={isAuthenticated} component={UserProfileContainer}/>
			</div>
		</Router>
	}
}


Routes.propTypes = {
	/* UserReducer */
	isAuthenticated: PropTypes.bool
}


const Home = () => (
	<div>
		<h2>Welcome</h2>
	</div>
)



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
)(Routes)
