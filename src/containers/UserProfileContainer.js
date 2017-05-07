import React from 'react'
import PropTypes from 'prop-types'
import {withRouter} from 'react-router-dom'
import {gql, graphql, compose} from 'react-apollo'


class UserProfileContainer extends React.Component {
	state = {
		username: ''
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
		this.props.changeMe({username:this.state.username})
	}


	render() {
		const {username} = this.state
		const {loading} = this.props

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
					{loading ? <span>loading...</span> :
						<form onSubmit={this.updateProfile.bind(this)}>
							<input type="text" name="username" value={username} onChange={this.handleInputChange}/>

							<button type="submit">Update profile</button>
						</form>
					}
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
		}
  }`


const gqlUpdate = gql`
  mutation changeMe($username: String){ changeMe(username:$username){_id}}
`

const UserProfileContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',

				reducer: (prev, {operationName, type, result: {data}}) => {
					/*if (type === 'APOLLO_MUTATION_RESULT' && operationName === 'KeyValueUpdate' && data && data.setValue && data.setValue.key ) {

					 let found=prev.keyvalue.find(x => x.key === data.setValue.key )
					 if( !found ) {
					 return update(prev, {keyvalue: {$push: [data.setValue]}})
					 }
					 }*/
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
					 setValue: {
					 key: key,
					 value: value,
					 __typename: 'KeyValue'
					 }
					 }*/
				})
			}
		})
	})
)(UserProfileContainer)


export default UserProfileContainerWithGql