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

	saveNote = (id, value, timeout ) => {
		clearTimeout(this.saveNoteTimeouts[id])
		this.saveNoteTimeouts[id] = setTimeout(() => {
			console.log('save note', value)
			this.setState({loading:true})

			this.props.updateNote({value: value, id: id})
				.then(resp => {
					this.setState({loading:false})
				})
				.catch(error => {
					this.setState({loading:false})
					console.error(error)
				})
		},timeout)
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
			// auto save note after 5s
			this.saveNote(target.id,value,5000)
		}else{
			this.setState({
				[target.name]: value
			})
		}
	}



	handleBlur = (e) => {
		const target = e.target
		const value = target.type === 'checkbox' ? target.checked : target.value

		if( this.saveNoteTimeouts[target.id] ){
			this.saveNote(target.id,value,0)
		}
	}

	componentWillReceiveProps(nextProps) {
		if( nextProps.me )
			this.setState({username: nextProps.me.username, note: nextProps.me.note})
	}


	updateProfile = (e) => {
		e.preventDefault()
		this.setState({usernameError: '',loading:true})

		this.props.updateMe({username: this.state.username})
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

	createNote = (e) => {
		e.preventDefault()
		this.setState({loading:true})
		this.props.createNote()
			.then(resp => {
				this.setState({loading:false})
			})
			.catch(error => {
				this.setState({loading:false})
			})
	}

	deleteNote = (e) => {
		e.preventDefault()
		this.setState({loading:true})

		this.props.deleteNote({id:e.target.id})
			.then(resp => {
				this.setState({loading:false})
			})
			.catch(error => {
				this.setState({loading:false})
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
			(o) => noteElements.push(<div key={o._id}>
				<textarea name="note" id={o._id} onBlur={this.handleBlur} onChange={this.handleInputChange} defaultValue={o.value}/>
				<button id={o._id} onClick={this.deleteNote}>Delete</button>
			</div>)
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
				</form>

				<hr />
				{noteElements}
				<br />
				<button onClick={this.createNote}>Add new note</button>

			</div>
		)
	}
}


UserProfileContainer.propTypes = {
	/* apollo client props */
	me: PropTypes.object,
	updateMe: PropTypes.func.isRequired,
	createNote: PropTypes.func.isRequired,
	updateNote: PropTypes.func.isRequired,
	deleteNote: PropTypes.func.isRequired,
	loading: PropTypes.bool
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
  mutation updateMe($username: String){ updateMe(username:$username){_id username}}
`

const gqlUpdateNote = gql`
	mutation updateNote($id: ID!, $value: String){ updateNote(value:$value,_id:$id){_id value}}
`


const gqlCreateNote = gql`
	mutation createNote{createNote{_id value}}
`

const gqlDeleteNote = gql`
	mutation deleteNote($id: ID!){deleteNote(_id:$id){_id value}}
`


const UserProfileContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				reducer: (prev, {operationName, type, result: {data}}) => {
					if (type === 'APOLLO_MUTATION_RESULT' ) {
						if (operationName === 'updateMe' && data && data.updateMe && data.updateMe.username) {
							return update(prev, {me: {username: {$set: data.updateMe.username}}})
						}else if (operationName === 'createNote' && data && data.createNote && data.createNote._id ) {
							return update(prev, {me: {note:{$push: [data.createNote]}}})
						}else if (operationName === 'deleteNote' && data && data.deleteNote && data.deleteNote._id ) {
							return update(prev, {me: {note:{$apply: notes => notes.filter(note => note._id !== data.deleteNote._id)}}})
						}
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
			updateMe: ({username}) => {
				return mutate({
					variables: {username},
					/*optimisticResponse: {
						__typename: 'Mutation',
						updateMe: {
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
			updateNote: (args) => mutate({variables: args})
		})
	}),
	graphql(gqlCreateNote, {
		props: ({ownProps, mutate}) => ({
			createNote: () => mutate()
		})
	}),
	graphql(gqlDeleteNote, {
		props: ({ownProps, mutate}) => ({
			deleteNote: (args) => mutate({variables: args})
		})
	})
)(UserProfileContainer)


export default UserProfileContainerWithGql