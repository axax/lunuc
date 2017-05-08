import React from 'react'
import PropTypes from 'prop-types'
import {withRouter} from 'react-router-dom'
import {gql, graphql, compose} from 'react-apollo'
import update from 'immutability-helper'


class UserProfileContainer extends React.Component {
	state = {
		username: '',
		usernameError: '',
		message: '',
		loading: false
	}

	handleInputChange = (e) => {
		const target = e.target
		const value = target.type === 'checkbox' ? target.checked : target.value
		const name = target.name

		this.setState({
			[target.name]: value
		})
	}

	componentWillReceiveProps(nextProps) {
		this.setState({username: nextProps.me.username})
	}


	updateProfile = (e) => {
		e.preventDefault()
		this.setState({usernameError: '',loading:true})

		this.props.changeMe({username: this.state.username})
			.then(resp => {
				this.setState({loading:false})
			})
			.catch(error => {
				this.setState({loading:false})
				if (error.graphQLErrors.length > 0) {
					const e = error.graphQLErrors[0]
					if (e.key === 'username.taken') {
						this.setState({username: this.props.me.username, usernameError: e.message})
					}
				}
			})
	}


	render() {
		const {username, usernameError, loading} = this.state

		const LogoutButton = withRouter(({history}) => (
			<button onClick={() => {
				localStorage.removeItem('token')
				history.push('/')
			}}>Logout</button>
		))

		return (
			<div>
				<LogoutButton />
				<h1>Profile</h1>
				{this.props.loading|loading ? <span>loading...</span> : ''}
				<form onSubmit={this.updateProfile.bind(this)}>
					<div>
						<input type="text" name="username" value={username} onChange={this.handleInputChange}/>
						{usernameError ? <strong>{usernameError}</strong> : ''}
					</div>

					<div>
						<button type="submit">Update profile</button>
					</div>
				</form>
			</div>
		)
	}
}


UserProfileContainer.propTypes = {
	/* apollo client props */
	me: PropTypes.object,
	changeMe: PropTypes.func.isRequired,
	loading: PropTypes.bool,
}


const gqlQuery = gql`
  query {
  	me {
			username
			email
			_id
			node {value}
		}
  }`


const gqlUpdate = gql`
  mutation changeMe($username: String){ changeMe(username:$username){_id username}}
`

const UserProfileContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				reducer: (prev, {operationName, type, result: {data}}) => {
					if (type === 'APOLLO_MUTATION_RESULT' && operationName === 'changeMe' && data && data.changeMe && data.changeMe.username) {
						return update(prev, {me: {username: {$set: data.changeMe.username}}})
					}
					return prev
				}
			}
		},
		props: ({data: {loading, me}}) => ({
			me,
			loading
		})
	}),
	graphql(gqlUpdate, {
		props: ({ownProps, mutate}) => ({
			changeMe: ({username}) => {
				return mutate({
					variables: {username},
					/*optimisticResponse: {
						__typename: 'Mutation',
						changeMe: {
							username:username,
							__typename: 'User'
						}
					}*/
				})
			}
		})
	})
)(UserProfileContainer)


export default UserProfileContainerWithGql