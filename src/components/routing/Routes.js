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
import SearchWhileSpeechContainer from '../../containers/SearchWhileSpeechContainer'
import LiveSpeechTranslaterContainer from '../../containers/LiveSpeechTranslaterContainer'
import ChatContainer from '../../containers/ChatContainer'
import WordContainer from '../../containers/WordContainer'
import Home from '../Home'
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
                    {isAuthenticated?<li><Link to="/translate">Translate</Link></li>:''}
					{isAuthenticated?<li><Link to="/search">Search</Link></li>:''}
					{isAuthenticated?<li><Link to="/chat">My chats</Link></li>:''}
					{isAuthenticated?<li><Link to="/word">Word</Link></li>:''}
					<li><Link to="/profile">Profile</Link></li>
				</ul>

				<hr/>

				<Route exact path="/" component={Home}/>
				<Route exact path="/search" component={SearchWhileSpeechContainer}/>
				<Route exact path="/translate" component={LiveSpeechTranslaterContainer}/>
				<Route exact path="/chat/:id*" component={ChatContainer}/>
				<Route exact path="/word" component={WordContainer}/>
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
