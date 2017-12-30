import React from 'react'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {BrowserRouter as Router, Route} from 'react-router-dom'
import LoginContainer from '../../containers/LoginContainer'
import SignUpContainer from '../../containers/SignUpContainer'
import UserProfileContainer from '../../containers/UserProfileContainer'
import SearchWhileSpeechContainer from '../../containers/SearchWhileSpeechContainer'
import LiveSpeechTranslaterContainer from '../../containers/LiveSpeechTranslaterContainer'
import ChatContainer from '../../containers/ChatContainer'
import WordContainer from '../../containers/WordContainer'
import PostContainer from '../../containers/PostContainer'
import CmsViewContainer from '../../containers/CmsViewContainer'
import CmsContainer from '../../containers/CmsContainer'
import Home from '../Home'
import PrivateRoute from './PrivateRoute'

class Routes extends React.Component {


	render() {

		const {isAuthenticated} = this.props

		return <Router>
			<div id="router">
				<Route exact path="/" component={Home}/>
				<Route exact path="/search" component={SearchWhileSpeechContainer}/>
				<Route exact path="/translate" component={LiveSpeechTranslaterContainer}/>
				<Route exact path="/chat/:id*" component={ChatContainer}/>
				<Route exact path="/word/:page*" component={WordContainer}/>
				<Route exact path="/post/:id*" component={PostContainer}/>
				<Route exact path="/cms/view/:slug" component={CmsViewContainer}/>
				<Route exact path="/cms" component={CmsContainer}/>
				<Route exact path="/cms/:page" component={CmsContainer}/>
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
