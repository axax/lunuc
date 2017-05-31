import React from 'react'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import {gql, graphql} from 'react-apollo'
import {Link} from 'react-router-dom'

class SignUpContainer extends React.Component {
	state = {
		loading: false,
		error: null,
		username: '',
		password: '',
		email: ''
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
			this.setState({loading: false})

			console.log('got data', data)
		}).catch((error) => {
			this.setState({loading: false, error: error.message})
		})

	}

	render() {

		const {loading, email, username, password, error} = this.state

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

				<p>Already have an account? <Link to="/login">Login</Link></p>
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