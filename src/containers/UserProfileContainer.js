import React from 'react'
import PropTypes from 'prop-types'
import {withRouter} from 'react-router-dom'
import {gql, graphql, compose} from 'react-apollo'


class UserProfileContainer extends React.Component {
	state = {
	}


	render() {
		const {loading, me} = this.props
		console.log(loading,me)
	
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

				{loading ? <span>loading...</span> : ''}
				{me ?
				<input type="text" defaultValue={me.username}/> :''}
			</div>
		)
	}
}


UserProfileContainer.propTypes = {
	/* apollo client props */
	me: PropTypes.object,
	loading: PropTypes.bool,
}



const gqlQuery = gql`
  query {
  	me {
			username
			email
		}
  }`

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
	})
)(UserProfileContainer)


export default UserProfileContainerWithGql