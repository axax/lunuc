import React from 'react'
import PropTypes from 'prop-types'
import {graphql} from 'react-apollo'
import gql from 'graphql-tag'
import {ADMIN_BASE_URL} from 'gen/config'

import {Link} from 'react-router-dom'

class SignUpContainer extends React.Component {
	state = {
		loading: false,
		error: null,
		username: '',
		password: '',
		email: '',
		signupFinished:false
	}


	handleInputChange = (e) => {
		const target = e.target
		const value = target.type === 'checkbox' ? target.checked : target.value
		const name = target.name

		this.setState({
			[target.name]: value
		})
	}


	signup = (e) => {
		e.preventDefault()

		this.setState({loading: true, error: null})
		const {mutate} = this.props


		mutate({
			variables: {
				_errorHandling: false,
				email: this.state.email,
				username: this.state.username,
				password: this.state.password
			}
		}).then(({data}) => {
			this.setState({loading: false,signupFinished:true})

			console.log('got data', data)
		}).catch((error) => {
			this.setState({loading: false, error: error.message})
		})

	}

	render() {

		const {signupFinished, loading, email, username, password, error} = this.state

		if (signupFinished) {
			return (
				<div>
					<p>Thanks for your registration! <Link to={ADMIN_BASE_URL+'/login'}>Login</Link></p>
				</div>
			)
		}
		return (
			<div>
				<p>Sign up to use this service</p>
				{loading ? <span>loading...</span> : ''}
				{error ? <span>{error}</span> : ''}

				<form onSubmit={this.signup.bind(this)}>
					<label><b>Username</b></label>
					<input value={username} onChange={this.handleInputChange} type="text" placeholder="Enter Username"
								 name="username" required/>

					<label><b>Email</b></label>
					<input value={email} onChange={this.handleInputChange} type="text" placeholder="Enter Email"
								 name="email" required/>
					<label><b>Password</b></label>
					<input value={password} onChange={this.handleInputChange} autoComplete="new-password" type="password"
								 placeholder="Enter Password"
								 name="password" required/>

					<button type="submit">Sign up</button>
				</form>

				<p>Already have an account? <Link to={ADMIN_BASE_URL+'/login'}>Login</Link></p>
			</div>
		)
	}
}

SignUpContainer.propTypes = {
	mutate: PropTypes.func,
}

const gqlCreateUser = gql`
  mutation createUser($email: String!, $username: String!, $password: String!) {
    createUser(email: $email, username: $username, password: $password) {
      email password username _id
    }
  }
`

const SignUpContainerWithGql = graphql(gqlCreateUser)(SignUpContainer)


export default SignUpContainerWithGql