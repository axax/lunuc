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
		loading: false,
		note: []
	}

	saveNoteTimeouts = {}

	saveNote = (id, value) => {
		clearTimeout(this.saveNoteTimeouts[id])
		this.saveNoteTimeouts[id] = setTimeout(() => {
			console.log('save note', value)
			this.setState({loading:true})

			this.props.setNote({value: value, id: id})
				.then(resp => {
					this.setState({loading:false})
				})
				.catch(error => {
					this.setState({loading:false})
					console.error(error)
				})

		},3000)
	}



	handleInputChange = (e) => {
		const target = e.target
		const value = target.type === 'checkbox' ? target.checked : target.value
		const name = target.name

		if ( target.name === 'note'){
			let note = this.state.note.map(
				(o) => {
					if( target.id===o._id){
						return Object.assign({},o,{value:value})
					}
					return o
				}
			)
			this.setState({
				[target.name]: note
			})
			// auto save
			this.saveNote(target.id,value)
		}else{
			this.setState({
				[target.name]: value
			})
		}
	}

	componentWillReceiveProps(nextProps) {
		console.log('prop',nextProps)
		if( nextProps.me )
			this.setState({username: nextProps.me.username, note: nextProps.me.note})
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

	updateNote = (e) => {
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
		const {username, usernameError, loading, note} = this.state

		const LogoutButton = withRouter(({history}) => (
			<button onClick={() => {
				localStorage.removeItem('token')
				history.push('/')
			}}>Logout</button>
		))

		let noteElements = []


		note.forEach(
			(o) => noteElements.push(<textarea name="note" id={o._id} key={o._id} onBlur={this.handleBlur} onChange={this.handleInputChange} defaultValue={o.value}/>)
		)


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
					<hr />
					{noteElements}
				</form>
			</div>
		)
	}
}


UserProfileContainer.propTypes = {
	/* apollo client props */
	me: PropTypes.object,
	changeMe: PropTypes.func.isRequired,
	setNote: PropTypes.func.isRequired,
	loading: PropTypes.bool,
}


const gqlQuery = gql`
  query {
  	me {
			username
			email
			_id
			note {
				_id
				value
			}
		}
  }`


const gqlUpdate = gql`
  mutation changeMe($username: String){ changeMe(username:$username){_id username}}
`

const gqlUpdateNote = gql`
	mutation setNote($id: ID!, $value: String){ setNote(value:$value,_id:$id){_id value}}
`


const UserProfileContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				reducer: (prev, {operationName, type, result: {data}}) => {
					console.log('xxxxx',prev)
					if (type === 'APOLLO_MUTATION_RESULT' && operationName === 'changeMe' && data && data.changeMe && data.changeMe.username) {
						return update(prev, {me: {username: {$set: data.changeMe.username}}})
					}
					return prev
				}
			}
		},
		props: ({data: {loading, me }}) => ({
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
	}),
	graphql(gqlUpdateNote, {
		props: ({ownProps, mutate}) => ({
			setNote: (args) => mutate({variables: args})
		})
	})
)(UserProfileContainer)


export default UserProfileContainerWithGql