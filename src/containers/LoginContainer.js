import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import {withApollo, gql} from 'react-apollo'
import ApolloClient from 'apollo-client'
import {Link} from 'react-router-dom'
import * as UserActions from '../actions/UserAction'
import * as ErrorHandlerAction from '../actions/ErrorHandlerAction'

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
		const {client,userActions,errorHandlerAction} = this.props


		client.query({
			fetchPolicy: 'network-only',
			query: gql`query startLogin($username: String!, $password: String!) { login(username: $username, password: $password) { token error _id username }}`,
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
					userActions.setUser(response.data.login,true)
                    errorHandlerAction.clearErrors()

					this.setState({redirectToReferrer: true})
				}
			}
		}).catch(error => {
			this.setState({loading: false})
		})
	}

	render() {

		const {from} = this.props.location.state || {from: {pathname: '/'}}
		const {redirectToReferrer, loading, username, password, error} = this.state

		if (redirectToReferrer) {
			return (
				<Redirect to={from} push={false}/>
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

				<p>Don&apos;t have an account? <Link to="/signup">Sign up</Link></p>
			</div>
		)
	}
}


LoginContainer.propTypes = {
	client: PropTypes.instanceOf(ApolloClient).isRequired,
	location: PropTypes.object,
	/* UserReducer */
	userActions: PropTypes.object.isRequired,
    errorHandlerAction: PropTypes.object.isRequired
}



/**
 * Map the state to props.
 */
const mapStateToProps = () => {
	return {}
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
	userActions: bindActionCreators(UserActions, dispatch),
    errorHandlerAction: bindActionCreators(ErrorHandlerAction, dispatch)
})



const LoginContainerWithApollo = withApollo(LoginContainer)

/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
	mapStateToProps,
	mapDispatchToProps
)(LoginContainerWithApollo)