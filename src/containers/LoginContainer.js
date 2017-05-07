import React from 'react'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import {withApollo, gql} from 'react-apollo'
import ApolloClient from 'apollo-client'

class LoginContainer extends React.Component {
	state = {
		redirectToReferrer: false,
		loading: false,
		error: null,
		username: '',
		password: ''
	}


	handleInputChange = (e) => {
		const target = e.target
		const value = target.type === 'checkbox' ? target.checked : target.value
		const name = target.name

		this.setState({
			[target.name]: value
		})
	}


	login = (e) => {
		e.preventDefault()

		this.setState({loading: true, error: null})
		const {client} = this.props


		client.query({
			fetchPolicy: 'network-only',
			query: gql`query KeyValueQuery($username: String!, $password: String!) { login(username: $username, password: $password) { token error }}`,
			variables: {
				username: this.state.username,
				password: this.state.password
			},
			operationName: 'login',
		}).then(response => {
			this.setState({loading: false})
			if( response.data && response.data.login ) {
				this.setState({error: response.data.login.error})

				if (!response.data.login.error) {

					localStorage.setItem('token', response.data.login.token)
					this.setState({redirectToReferrer: true})
				}
			}
		}).catch(error => console.error(error))

	}

	render() {

		const {from} = this.props.location.state || {from: {pathname: '/'}}
		const {redirectToReferrer, loading, username, password, error} = this.state

		if (redirectToReferrer) {
			return (
				<Redirect to={from}/>
			)
		}

		return (
			<div>
				<p>You must log in to view the page at {from.pathname}</p>
				{loading ? <span>loading...</span> : ''}
				{error ? <span>{error}</span> : ''}

				<form onSubmit={this.login.bind(this)}>
					<label><b>Username</b></label>
					<input value={username} onChange={this.handleInputChange} type="text" placeholder="Enter Username"
								 name="username" required/>

					<label><b>Password</b></label>
					<input value={password} onChange={this.handleInputChange} type="password" placeholder="Enter Password"
								 name="password" required/>

					<button type="submit">Login</button>
				</form>
			</div>
		)
	}
}


LoginContainer.propTypes = {
	client: React.PropTypes.instanceOf(ApolloClient).isRequired
}
const LoginContainerWithApollo = withApollo(LoginContainer)

export default LoginContainerWithApollo