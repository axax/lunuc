import React from 'react'
import PropTypes from 'prop-types'
import {withRouter} from 'react-router-dom'

class UserProfileContainer extends React.Component {
	state = {
	}


	render() {

		const LogoutButton = withRouter(({ history }) => (
			<button onClick={() => {
				localStorage.removeItem('token')
				history.push('/')
			}}>Logout</button>
		))

		return (
			<div>
				<h1>Profile</h1>
				<LogoutButton />
			</div>
		)
	}
}


export default UserProfileContainer